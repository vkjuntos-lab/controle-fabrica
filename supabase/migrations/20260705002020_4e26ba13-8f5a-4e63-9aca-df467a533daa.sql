
-- =============== Crediário Inteligente — Onda A ===============

CREATE TYPE credit_tier AS ENUM ('A','B','C');
CREATE TYPE credit_installment_status AS ENUM ('open','paid','overdue','canceled');

-- Carteira do cliente por loja
CREATE TABLE public.credit_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  limit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 80,
  tier credit_tier NOT NULL DEFAULT 'B',
  blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_limits TO authenticated;
GRANT ALL ON public.credit_limits TO service_role;
ALTER TABLE public.credit_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read credit_limits by store" ON public.credit_limits FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "manage credit_limits admin/manager" ON public.credit_limits FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');
CREATE TRIGGER trg_credit_limits_updated BEFORE UPDATE ON public.credit_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Venda fiado
CREATE TABLE public.credit_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  sale_id UUID REFERENCES public.sales(id),
  total NUMERIC(12,2) NOT NULL,
  entrada NUMERIC(12,2) NOT NULL DEFAULT 0,
  restante NUMERIC(12,2) NOT NULL,
  num_parcelas INTEGER NOT NULL,
  notes TEXT,
  operator_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_sales TO authenticated;
GRANT ALL ON public.credit_sales TO service_role;
ALTER TABLE public.credit_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read credit_sales by store" ON public.credit_sales FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "insert credit_sales by store" ON public.credit_sales FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "update credit_sales admin/manager" ON public.credit_sales FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');
CREATE TRIGGER trg_credit_sales_updated BEFORE UPDATE ON public.credit_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Parcelas
CREATE TABLE public.credit_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  numero INTEGER NOT NULL,
  vencimento DATE NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  status credit_installment_status NOT NULL DEFAULT 'open',
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2),
  payment_method TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  pix_charge_id UUID REFERENCES public.pix_charges(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_installments_venc ON public.credit_installments(store_id, status, vencimento);
CREATE INDEX idx_credit_installments_customer ON public.credit_installments(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_installments TO authenticated;
GRANT ALL ON public.credit_installments TO service_role;
ALTER TABLE public.credit_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read credit_installments by store" ON public.credit_installments FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "manage credit_installments by store" ON public.credit_installments FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE TRIGGER trg_credit_installments_updated BEFORE UPDATE ON public.credit_installments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Score events
CREATE TABLE public.credit_score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id),
  installment_id UUID REFERENCES public.credit_installments(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credit_score_events TO authenticated;
GRANT ALL ON public.credit_score_events TO service_role;
ALTER TABLE public.credit_score_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read score events" ON public.credit_score_events FOR SELECT TO authenticated
  USING (store_id IS NULL OR public.user_has_store(auth.uid(), store_id));
CREATE POLICY "insert score events" ON public.credit_score_events FOR INSERT TO authenticated
  WITH CHECK (store_id IS NULL OR public.user_has_store(auth.uid(), store_id));

-- ============ Funções ============

-- Recalcula tier a partir do score
CREATE OR REPLACE FUNCTION public.credit_tier_from_score(_score INTEGER)
RETURNS credit_tier LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _score >= 85 THEN 'A'::credit_tier
    WHEN _score >= 60 THEN 'B'::credit_tier
    ELSE 'C'::credit_tier
  END;
$$;

-- Garante linha de credit_limits
CREATE OR REPLACE FUNCTION public.ensure_credit_limit(_customer UUID, _store UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id UUID;
BEGIN
  SELECT id INTO _id FROM public.credit_limits WHERE customer_id=_customer AND store_id=_store;
  IF _id IS NULL THEN
    INSERT INTO public.credit_limits (customer_id, store_id, limit_amount, score, tier)
      VALUES (_customer, _store, 300, 80, 'B') RETURNING id INTO _id;
  END IF;
  RETURN _id;
END; $$;

-- Wallet do cliente
CREATE OR REPLACE FUNCTION public.credit_wallet(_customer_id UUID, _store_id UUID)
RETURNS TABLE(
  limit_amount NUMERIC, used NUMERIC, available NUMERIC,
  score INTEGER, tier credit_tier, blocked BOOLEAN, blocked_reason TEXT,
  overdue_count BIGINT, open_count BIGINT, next_due DATE
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH lim AS (
    SELECT * FROM public.credit_limits
    WHERE customer_id=_customer_id AND store_id=_store_id
  ),
  agg AS (
    SELECT
      COALESCE(sum(CASE WHEN status IN ('open','overdue') THEN valor ELSE 0 END),0) AS used,
      count(*) FILTER (WHERE status='overdue') AS overdue_count,
      count(*) FILTER (WHERE status IN ('open','overdue')) AS open_count,
      min(vencimento) FILTER (WHERE status IN ('open','overdue')) AS next_due
    FROM public.credit_installments
    WHERE customer_id=_customer_id AND store_id=_store_id
  )
  SELECT
    COALESCE(l.limit_amount, 0),
    a.used,
    GREATEST(0, COALESCE(l.limit_amount,0) - a.used),
    COALESCE(l.score, 80),
    COALESCE(l.tier, 'B'::credit_tier),
    COALESCE(l.blocked, false),
    l.blocked_reason,
    a.overdue_count, a.open_count, a.next_due
  FROM agg a LEFT JOIN lim l ON true;
$$;

-- Dashboard
CREATE OR REPLACE FUNCTION public.credit_dashboard(_store_id UUID)
RETURNS TABLE(
  to_receive_today NUMERIC,
  overdue_amount NUMERIC,
  received_today NUMERIC,
  default_rate NUMERIC,
  open_count BIGINT,
  overdue_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH i AS (
    SELECT * FROM public.credit_installments WHERE store_id=_store_id
  ), tot AS (SELECT count(*) AS c FROM i)
  SELECT
    COALESCE((SELECT sum(valor) FROM i WHERE status IN ('open','overdue') AND vencimento = current_date),0),
    COALESCE((SELECT sum(valor) FROM i WHERE status='overdue' OR (status='open' AND vencimento < current_date)),0),
    COALESCE((SELECT sum(paid_amount) FROM i WHERE status='paid' AND paid_at::date=current_date),0),
    CASE WHEN (SELECT c FROM tot) > 0
      THEN ROUND(100.0 * (SELECT count(*) FROM i WHERE status='overdue' OR (status='open' AND vencimento < current_date))::numeric / (SELECT c FROM tot), 2)
      ELSE 0 END,
    (SELECT count(*) FROM i WHERE status='open'),
    (SELECT count(*) FROM i WHERE status='overdue' OR (status='open' AND vencimento < current_date))
  WHERE public.user_has_store(auth.uid(), _store_id);
$$;

-- Lista parcelas com dados do cliente
CREATE OR REPLACE FUNCTION public.list_credit_installments(_store_id UUID, _scope TEXT)
RETURNS TABLE(
  id UUID, credit_sale_id UUID, customer_id UUID, customer_name TEXT,
  customer_phone TEXT, numero INTEGER, num_total INTEGER,
  vencimento DATE, valor NUMERIC, status credit_installment_status,
  paid_at TIMESTAMPTZ, paid_amount NUMERIC, days_late INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.id, i.credit_sale_id, i.customer_id, c.name, c.phone,
    i.numero, cs.num_parcelas, i.vencimento, i.valor, i.status,
    i.paid_at, i.paid_amount,
    CASE WHEN i.status IN ('open','overdue') AND i.vencimento < current_date
         THEN (current_date - i.vencimento)::int ELSE 0 END
  FROM public.credit_installments i
  JOIN public.customers c ON c.id = i.customer_id
  JOIN public.credit_sales cs ON cs.id = i.credit_sale_id
  WHERE i.store_id = _store_id
    AND public.user_has_store(auth.uid(), _store_id)
    AND (
      _scope = 'all' OR
      (_scope = 'upcoming' AND i.status IN ('open','overdue') AND i.vencimento BETWEEN current_date AND current_date + 7) OR
      (_scope = 'overdue' AND (i.status='overdue' OR (i.status='open' AND i.vencimento < current_date))) OR
      (_scope = 'open' AND i.status IN ('open','overdue')) OR
      (_scope = 'paid' AND i.status = 'paid')
    )
  ORDER BY
    CASE WHEN i.status='paid' THEN 1 ELSE 0 END,
    i.vencimento;
$$;

-- Criar venda fiado
CREATE OR REPLACE FUNCTION public.create_credit_sale(
  _customer UUID, _store UUID, _total NUMERIC, _entrada NUMERIC,
  _parcelas INTEGER, _primeiro_venc DATE, _intervalo_dias INTEGER DEFAULT 30, _notes TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _sale_id UUID; _restante NUMERIC; _valor_parc NUMERIC; _i INTEGER;
  _lim RECORD;
BEGIN
  IF NOT public.user_has_store(auth.uid(), _store) THEN
    RAISE EXCEPTION 'Sem permissão nessa loja';
  END IF;
  IF _parcelas < 1 THEN RAISE EXCEPTION 'Número de parcelas inválido'; END IF;
  IF _entrada < 0 OR _entrada >= _total THEN RAISE EXCEPTION 'Entrada inválida'; END IF;

  PERFORM public.ensure_credit_limit(_customer, _store);
  SELECT * INTO _lim FROM public.credit_wallet(_customer, _store);
  IF _lim.blocked THEN RAISE EXCEPTION 'Cliente bloqueado para fiado: %', COALESCE(_lim.blocked_reason,''); END IF;
  IF _lim.tier = 'C' THEN RAISE EXCEPTION 'Cliente com score C não pode comprar fiado'; END IF;

  _restante := _total - _entrada;
  IF _restante > _lim.available THEN
    RAISE EXCEPTION 'Limite insuficiente. Disponível: R$ %', _lim.available;
  END IF;

  INSERT INTO public.credit_sales(customer_id, store_id, total, entrada, restante, num_parcelas, notes, operator_user_id)
    VALUES (_customer, _store, _total, _entrada, _restante, _parcelas, _notes, auth.uid())
    RETURNING id INTO _sale_id;

  _valor_parc := ROUND(_restante / _parcelas, 2);
  FOR _i IN 1.._parcelas LOOP
    INSERT INTO public.credit_installments(
      credit_sale_id, customer_id, store_id, numero, vencimento, valor
    ) VALUES (
      _sale_id, _customer, _store, _i,
      _primeiro_venc + ((_i-1) * _intervalo_dias),
      CASE WHEN _i = _parcelas
           THEN _restante - (_valor_parc * (_parcelas-1))
           ELSE _valor_parc END
    );
  END LOOP;

  PERFORM public.log_audit('credit_sale.create','credit_sales',_sale_id::text,_store,
    jsonb_build_object('total',_total,'entrada',_entrada,'parcelas',_parcelas));
  RETURN _sale_id;
END; $$;

-- Baixar parcela + criar transaction + evento score
CREATE OR REPLACE FUNCTION public.pay_installment(
  _installment_id UUID, _amount NUMERIC, _method TEXT, _bank_account UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _inst RECORD; _delta INTEGER; _reason TEXT; _new_score INTEGER;
BEGIN
  SELECT * INTO _inst FROM public.credit_installments WHERE id=_installment_id;
  IF _inst IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  IF NOT public.user_has_store(auth.uid(), _inst.store_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _inst.status = 'paid' THEN RAISE EXCEPTION 'Parcela já paga'; END IF;

  UPDATE public.credit_installments
    SET status='paid', paid_at=now(), paid_amount=_amount,
        payment_method=_method, bank_account_id=_bank_account
    WHERE id=_installment_id;

  INSERT INTO public.financial_transactions(
    store_id, kind, source, description, amount, payment_method,
    bank_account_id, paid_at, created_by
  ) VALUES (
    _inst.store_id, 'income', 'credit',
    'Crediário parcela ' || _inst.numero,
    _amount, _method, _bank_account, now(), auth.uid()
  );

  -- Score
  IF _inst.vencimento >= current_date THEN
    _delta := 5; _reason := 'Pagamento em dia';
  ELSIF (current_date - _inst.vencimento) <= 5 THEN
    _delta := -3; _reason := 'Atraso curto';
  ELSIF (current_date - _inst.vencimento) <= 30 THEN
    _delta := -10; _reason := 'Atraso 6-30 dias';
  ELSE
    _delta := -20; _reason := 'Atraso 30+ dias';
  END IF;

  INSERT INTO public.credit_score_events(customer_id, store_id, installment_id, delta, reason)
    VALUES (_inst.customer_id, _inst.store_id, _installment_id, _delta, _reason);

  UPDATE public.credit_limits SET
    score = GREATEST(0, LEAST(100, score + _delta)),
    tier = public.credit_tier_from_score(GREATEST(0, LEAST(100, score + _delta))),
    updated_at = now()
  WHERE customer_id=_inst.customer_id AND store_id=_inst.store_id
  RETURNING score INTO _new_score;

  -- desbloqueia se quitou tudo
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_installments
    WHERE customer_id=_inst.customer_id AND store_id=_inst.store_id
      AND status IN ('open','overdue')
  ) THEN
    UPDATE public.credit_limits SET blocked=false, blocked_reason=NULL, blocked_at=NULL
      WHERE customer_id=_inst.customer_id AND store_id=_inst.store_id AND blocked;
  END IF;

  PERFORM public.log_audit('credit_installment.paid','credit_installments',_installment_id::text,_inst.store_id,
    jsonb_build_object('amount',_amount,'method',_method,'delta',_delta));
END; $$;

-- Ajustar limite
CREATE OR REPLACE FUNCTION public.adjust_credit_limit(
  _customer UUID, _store UUID, _new_limit NUMERIC, _reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), _store) = 'manager') THEN
    RAISE EXCEPTION 'Apenas admin/gerente pode ajustar limite';
  END IF;
  PERFORM public.ensure_credit_limit(_customer, _store);
  UPDATE public.credit_limits SET limit_amount=_new_limit, updated_at=now()
    WHERE customer_id=_customer AND store_id=_store;
  PERFORM public.log_audit('credit_limit.adjust','credit_limits',_customer::text,_store,
    jsonb_build_object('new_limit',_new_limit,'reason',_reason));
END; $$;

-- Bloquear / desbloquear
CREATE OR REPLACE FUNCTION public.toggle_credit_block(
  _customer UUID, _store UUID, _blocked BOOLEAN, _reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), _store) = 'manager') THEN
    RAISE EXCEPTION 'Apenas admin/gerente';
  END IF;
  PERFORM public.ensure_credit_limit(_customer, _store);
  UPDATE public.credit_limits
    SET blocked=_blocked,
        blocked_reason = CASE WHEN _blocked THEN _reason ELSE NULL END,
        blocked_at = CASE WHEN _blocked THEN now() ELSE NULL END,
        updated_at = now()
    WHERE customer_id=_customer AND store_id=_store;
  PERFORM public.log_audit(CASE WHEN _blocked THEN 'credit.block' ELSE 'credit.unblock' END,
    'credit_limits',_customer::text,_store, jsonb_build_object('reason',_reason));
END; $$;

-- Marca overdue (executável manualmente na Onda A; cron na B)
CREATE OR REPLACE FUNCTION public.mark_overdue_installments()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.credit_installments
    SET status='overdue', updated_at=now()
    WHERE status='open' AND vencimento < current_date;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;
