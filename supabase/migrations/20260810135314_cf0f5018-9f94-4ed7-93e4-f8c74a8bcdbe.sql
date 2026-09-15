CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  kind text NOT NULL DEFAULT 'operacional',
  monthly_budget numeric(12,2) NOT NULL DEFAULT 0,
  color text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_centers_store ON public.cost_centers(store_id);
CREATE UNIQUE INDEX idx_cost_centers_store_name ON public.cost_centers(store_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_select" ON public.cost_centers FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "cc_insert" ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "cc_update" ON public.cost_centers FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "cc_delete" ON public.cost_centers FOR DELETE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

CREATE TRIGGER cost_centers_set_updated_at
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.financial_transactions
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.accounts_payable
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.accounts_receivable
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX idx_ft_cost_center ON public.financial_transactions(cost_center_id);
CREATE INDEX idx_ap_cost_center ON public.accounts_payable(cost_center_id);
CREATE INDEX idx_ar_cost_center ON public.accounts_receivable(cost_center_id);

CREATE OR REPLACE FUNCTION public.cashflow_by_cost_center(_store_id uuid, _from date, _to date)
RETURNS TABLE(
  cost_center_id uuid,
  cost_center_name text,
  kind text,
  monthly_budget numeric,
  realized_in numeric,
  realized_out numeric,
  forecast_in numeric,
  forecast_out numeric,
  net numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH centers AS (
    SELECT c.id, c.name, c.kind, c.monthly_budget
    FROM public.cost_centers c
    WHERE c.store_id = _store_id AND c.active
  ),
  tx AS (
    SELECT t.cost_center_id AS cid,
      sum(CASE WHEN t.kind='income' THEN t.amount ELSE 0 END) AS r_in,
      sum(CASE WHEN t.kind='expense' THEN t.amount ELSE 0 END) AS r_out
    FROM public.financial_transactions t
    WHERE t.store_id = _store_id AND t.paid_at::date BETWEEN _from AND _to
    GROUP BY 1
  ),
  fin AS (
    SELECT r.cost_center_id AS cid, sum(r.amount) AS f_in
    FROM public.accounts_receivable r
    WHERE r.store_id = _store_id AND r.status IN ('open','overdue')
      AND r.due_date BETWEEN _from AND _to
    GROUP BY 1
  ),
  fout AS (
    SELECT p.cost_center_id AS cid, sum(p.amount) AS f_out
    FROM public.accounts_payable p
    WHERE p.store_id = _store_id AND p.status IN ('open','overdue')
      AND p.due_date BETWEEN _from AND _to
    GROUP BY 1
  )
  SELECT c.id, c.name, c.kind, c.monthly_budget,
    COALESCE(tx.r_in,0), COALESCE(tx.r_out,0),
    COALESCE(fin.f_in,0), COALESCE(fout.f_out,0),
    COALESCE(tx.r_in,0) - COALESCE(tx.r_out,0)
  FROM centers c
  LEFT JOIN tx ON tx.cid = c.id
  LEFT JOIN fin ON fin.cid = c.id
  LEFT JOIN fout ON fout.cid = c.id
  WHERE public.user_has_store(auth.uid(), _store_id)
  UNION ALL
  SELECT NULL::uuid, 'Sem centro de custo', 'nao_alocado', 0,
    COALESCE((SELECT sum(CASE WHEN t.kind='income' THEN t.amount ELSE 0 END) FROM public.financial_transactions t
      WHERE t.store_id=_store_id AND t.cost_center_id IS NULL AND t.paid_at::date BETWEEN _from AND _to),0),
    COALESCE((SELECT sum(CASE WHEN t.kind='expense' THEN t.amount ELSE 0 END) FROM public.financial_transactions t
      WHERE t.store_id=_store_id AND t.cost_center_id IS NULL AND t.paid_at::date BETWEEN _from AND _to),0),
    COALESCE((SELECT sum(r.amount) FROM public.accounts_receivable r
      WHERE r.store_id=_store_id AND r.cost_center_id IS NULL AND r.status IN ('open','overdue') AND r.due_date BETWEEN _from AND _to),0),
    COALESCE((SELECT sum(p.amount) FROM public.accounts_payable p
      WHERE p.store_id=_store_id AND p.cost_center_id IS NULL AND p.status IN ('open','overdue') AND p.due_date BETWEEN _from AND _to),0),
    0
  WHERE public.user_has_store(auth.uid(), _store_id)
  ORDER BY 6 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.cashflow_projection(_store_id uuid, _days integer DEFAULT 90)
RETURNS TABLE(
  day date,
  expected_in numeric,
  expected_out numeric,
  net numeric,
  running_balance numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CURRENT_DATE AS d0, (CURRENT_DATE + (_days || ' days')::interval)::date AS d1
  ),
  opening AS (
    SELECT
      COALESCE((SELECT sum(b.opening_balance) FROM public.bank_accounts b WHERE b.store_id=_store_id AND b.active),0)
      + COALESCE((SELECT sum(CASE WHEN t.kind='income' THEN t.amount ELSE -t.amount END)
                  FROM public.financial_transactions t WHERE t.store_id=_store_id),0) AS start_balance
  ),
  days AS (
    SELECT generate_series((SELECT d0 FROM bounds), (SELECT d1 FROM bounds), interval '1 day')::date AS day
  ),
  inflow AS (
    SELECT r.due_date AS day, sum(r.amount) AS v
    FROM public.accounts_receivable r
    WHERE r.store_id=_store_id AND r.status IN ('open','overdue')
      AND r.due_date BETWEEN (SELECT d0 FROM bounds) AND (SELECT d1 FROM bounds)
    GROUP BY 1
  ),
  outflow AS (
    SELECT p.due_date AS day, sum(p.amount) AS v
    FROM public.accounts_payable p
    WHERE p.store_id=_store_id AND p.status IN ('open','overdue')
      AND p.due_date BETWEEN (SELECT d0 FROM bounds) AND (SELECT d1 FROM bounds)
    GROUP BY 1
  ),
  merged AS (
    SELECT d.day, COALESCE(i.v,0) AS e_in, COALESCE(o.v,0) AS e_out
    FROM days d
    LEFT JOIN inflow i USING (day)
    LEFT JOIN outflow o USING (day)
  )
  SELECT m.day, m.e_in, m.e_out, m.e_in - m.e_out,
    (SELECT start_balance FROM opening) + sum(m.e_in - m.e_out) OVER (ORDER BY m.day)
  FROM merged m
  WHERE public.user_has_store(auth.uid(), _store_id)
  ORDER BY m.day;
$function$;

CREATE OR REPLACE FUNCTION public.cashflow_history_monthly(_store_id uuid, _months integer DEFAULT 12)
RETURNS TABLE(
  month date,
  realized_in numeric,
  realized_out numeric,
  net numeric,
  accumulated numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - ((_months - 1) || ' months')::interval,
      date_trunc('month', CURRENT_DATE),
      interval '1 month'
    )::date AS month
  ),
  agg AS (
    SELECT date_trunc('month', t.paid_at)::date AS month,
      sum(CASE WHEN t.kind='income' THEN t.amount ELSE 0 END) AS r_in,
      sum(CASE WHEN t.kind='expense' THEN t.amount ELSE 0 END) AS r_out
    FROM public.financial_transactions t
    WHERE t.store_id=_store_id
      AND t.paid_at >= date_trunc('month', CURRENT_DATE) - ((_months - 1) || ' months')::interval
    GROUP BY 1
  ),
  merged AS (
    SELECT m.month, COALESCE(a.r_in,0) AS r_in, COALESCE(a.r_out,0) AS r_out
    FROM months m LEFT JOIN agg a USING (month)
  )
  SELECT x.month, x.r_in, x.r_out, x.r_in - x.r_out,
    sum(x.r_in - x.r_out) OVER (ORDER BY x.month)
  FROM merged x
  WHERE public.user_has_store(auth.uid(), _store_id)
  ORDER BY x.month;
$function$;