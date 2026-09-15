
-- 1) Vendas → financial_transactions (source=sale)
CREATE OR REPLACE FUNCTION public.on_sale_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _method text;
  _n int;
BEGIN
  -- evita duplicar se já existe (backfill/reprocessos)
  IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE sale_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _n FROM jsonb_array_elements(COALESCE(NEW.payments, '[]'::jsonb));
  IF _n = 1 THEN
    SELECT (COALESCE(NEW.payments->0->>'method', 'cash')) INTO _method;
  ELSIF _n > 1 THEN
    _method := 'mixed';
  ELSE
    _method := 'cash';
  END IF;

  INSERT INTO public.financial_transactions (
    store_id, kind, source, description, amount, payment_method,
    sale_id, paid_at, created_by
  ) VALUES (
    NEW.store_id, 'income', 'sale',
    'Venda ' || NEW.code,
    COALESCE(NEW.total, 0),
    _method,
    NEW.id,
    NEW.created_at,
    NEW.operator_user_id
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sale_created ON public.sales;
CREATE TRIGGER trg_sale_created
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.on_sale_created();

-- 2) PIX aprovado → financial_transactions (source=pix)
CREATE OR REPLACE FUNCTION public.on_pix_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE pix_charge_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.financial_transactions (
      store_id, kind, source, description, amount, payment_method,
      pix_charge_id, paid_at, created_by
    ) VALUES (
      NEW.store_id, 'income', 'pix',
      'PIX ' || NEW.sale_code,
      NEW.amount,
      'pix',
      NEW.id,
      COALESCE(NEW.approved_at, now()),
      NEW.operator_user_id
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pix_approved ON public.pix_charges;
CREATE TRIGGER trg_pix_approved
AFTER UPDATE ON public.pix_charges
FOR EACH ROW EXECUTE FUNCTION public.on_pix_approved();

-- 3) Recorrência: quando uma AP mensal/semanal é paga, cria a próxima
CREATE OR REPLACE FUNCTION public.on_payable_paid_recurring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_due date;
BEGIN
  IF NEW.status = 'paid'
     AND (OLD.status IS DISTINCT FROM 'paid')
     AND NEW.recurring IN ('monthly','weekly') THEN
    _next_due := CASE NEW.recurring
      WHEN 'monthly' THEN (NEW.due_date + interval '1 month')::date
      WHEN 'weekly'  THEN (NEW.due_date + interval '7 days')::date
    END;
    -- só cria se ainda não existe uma próxima com mesma descrição/venc
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts_payable
      WHERE store_id = NEW.store_id
        AND description = NEW.description
        AND due_date = _next_due
    ) THEN
      INSERT INTO public.accounts_payable (
        store_id, supplier, description, category_id, competence, due_date,
        amount, status, planned_method, bank_account_id, recurring, notes, created_by
      ) VALUES (
        NEW.store_id, NEW.supplier, NEW.description, NEW.category_id,
        CASE WHEN NEW.competence IS NULL THEN NULL
             ELSE (NEW.competence + (CASE NEW.recurring WHEN 'monthly' THEN interval '1 month' ELSE interval '7 days' END))::date
        END,
        _next_due,
        NEW.amount, 'open', NEW.planned_method, NEW.bank_account_id, NEW.recurring, NEW.notes, NEW.created_by
      );
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_payable_recurring ON public.accounts_payable;
CREATE TRIGGER trg_payable_recurring
AFTER UPDATE ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.on_payable_paid_recurring();

-- 4) Backfill: vendas existentes sem transaction
INSERT INTO public.financial_transactions (store_id, kind, source, description, amount, payment_method, sale_id, paid_at, created_by)
SELECT s.store_id, 'income'::fin_kind, 'sale'::fin_source,
  'Venda ' || s.code, COALESCE(s.total, 0),
  CASE
    WHEN jsonb_array_length(COALESCE(s.payments,'[]'::jsonb)) = 1 THEN COALESCE(s.payments->0->>'method','cash')
    WHEN jsonb_array_length(COALESCE(s.payments,'[]'::jsonb)) > 1 THEN 'mixed'
    ELSE 'cash'
  END,
  s.id, s.created_at, s.operator_user_id
FROM public.sales s
WHERE NOT EXISTS (SELECT 1 FROM public.financial_transactions ft WHERE ft.sale_id = s.id);

-- 5) Backfill: PIX aprovados sem transaction
INSERT INTO public.financial_transactions (store_id, kind, source, description, amount, payment_method, pix_charge_id, paid_at, created_by)
SELECT p.store_id, 'income'::fin_kind, 'pix'::fin_source,
  'PIX ' || p.sale_code, p.amount, 'pix',
  p.id, COALESCE(p.approved_at, p.updated_at), p.operator_user_id
FROM public.pix_charges p
WHERE p.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM public.financial_transactions ft WHERE ft.pix_charge_id = p.id);

-- 6) RPC de fluxo de caixa por dia (previsto vs realizado)
CREATE OR REPLACE FUNCTION public.cashflow_daily(_store_id uuid, _from date, _to date)
RETURNS TABLE(day date, realized_in numeric, realized_out numeric, forecast_in numeric, forecast_out numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(_from, _to, interval '1 day')::date AS day
  ),
  real_tx AS (
    SELECT date_trunc('day', paid_at)::date AS day,
      sum(CASE WHEN kind='income' THEN amount ELSE 0 END) AS r_in,
      sum(CASE WHEN kind='expense' THEN amount ELSE 0 END) AS r_out
    FROM public.financial_transactions
    WHERE store_id = _store_id
      AND paid_at::date BETWEEN _from AND _to
    GROUP BY 1
  ),
  fc_in AS (
    SELECT due_date AS day, sum(amount) AS f_in
    FROM public.accounts_receivable
    WHERE store_id = _store_id AND status IN ('open','overdue')
      AND due_date BETWEEN _from AND _to
    GROUP BY 1
  ),
  fc_out AS (
    SELECT due_date AS day, sum(amount) AS f_out
    FROM public.accounts_payable
    WHERE store_id = _store_id AND status IN ('open','overdue')
      AND due_date BETWEEN _from AND _to
    GROUP BY 1
  )
  SELECT d.day,
    COALESCE(r.r_in,0), COALESCE(r.r_out,0),
    COALESCE(i.f_in,0), COALESCE(o.f_out,0)
  FROM days d
  LEFT JOIN real_tx r USING (day)
  LEFT JOIN fc_in i USING (day)
  LEFT JOIN fc_out o USING (day)
  WHERE public.user_has_store(auth.uid(), _store_id)
  ORDER BY d.day;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_daily(uuid, date, date) TO authenticated;
