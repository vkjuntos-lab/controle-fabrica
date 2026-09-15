
-- 1) credit_policies
CREATE TABLE IF NOT EXISTS public.credit_policies (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  tier_a_limit NUMERIC(12,2) NOT NULL DEFAULT 1000,
  tier_b_limit NUMERIC(12,2) NOT NULL DEFAULT 500,
  tier_c_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_score INTEGER NOT NULL DEFAULT 80,
  auto_apply_limit BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_policies TO authenticated;
GRANT ALL ON public.credit_policies TO service_role;

ALTER TABLE public.credit_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_policies_select" ON public.credit_policies
  FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "credit_policies_manage" ON public.credit_policies
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

CREATE TRIGGER trg_credit_policies_updated_at
  BEFORE UPDATE ON public.credit_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) penalty_applied_at on installments
ALTER TABLE public.credit_installments
  ADD COLUMN IF NOT EXISTS penalty_applied_at TIMESTAMPTZ;

-- 3) seed policies for existing stores + trigger for new
INSERT INTO public.credit_policies (store_id)
SELECT id FROM public.stores WHERE active
ON CONFLICT (store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.on_store_created_seed_credit_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.credit_policies (store_id) VALUES (NEW.id)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_stores_seed_credit_policy ON public.stores;
CREATE TRIGGER trg_stores_seed_credit_policy
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.on_store_created_seed_credit_policy();

-- 4) recompute_credit_score
CREATE OR REPLACE FUNCTION public.recompute_credit_score(_customer UUID, _store UUID)
RETURNS TABLE(score INTEGER, tier credit_tier, applied_limit NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _base INTEGER; _sum INTEGER; _final INTEGER;
  _tier credit_tier; _auto BOOLEAN; _lim NUMERIC := NULL;
  _pol RECORD;
BEGIN
  IF NOT public.user_has_store(auth.uid(), _store) THEN
    RAISE EXCEPTION 'Sem permissão nessa loja';
  END IF;

  SELECT * INTO _pol FROM public.credit_policies WHERE store_id = _store;
  _base := COALESCE(_pol.base_score, 80);
  _auto := COALESCE(_pol.auto_apply_limit, false);

  SELECT COALESCE(sum(delta), 0)::int INTO _sum
    FROM public.credit_score_events
    WHERE customer_id = _customer AND store_id = _store;

  _final := GREATEST(0, LEAST(100, _base + _sum));
  _tier := public.credit_tier_from_score(_final);

  PERFORM public.ensure_credit_limit(_customer, _store);

  IF _auto THEN
    _lim := CASE _tier
      WHEN 'A' THEN COALESCE(_pol.tier_a_limit, 1000)
      WHEN 'B' THEN COALESCE(_pol.tier_b_limit, 500)
      ELSE COALESCE(_pol.tier_c_limit, 0)
    END;
    UPDATE public.credit_limits
      SET score = _final, tier = _tier, limit_amount = _lim, updated_at = now()
      WHERE customer_id = _customer AND store_id = _store;
  ELSE
    UPDATE public.credit_limits
      SET score = _final, tier = _tier, updated_at = now()
      WHERE customer_id = _customer AND store_id = _store;
  END IF;

  PERFORM public.log_audit('credit_score.recompute','credit_limits',_customer::text,_store,
    jsonb_build_object('score',_final,'tier',_tier,'auto_limit',_lim));

  RETURN QUERY SELECT _final, _tier, _lim;
END; $$;

-- 5) credit_risk_preview
CREATE OR REPLACE FUNCTION public.credit_risk_preview(_customer UUID, _store UUID)
RETURNS TABLE(
  probability NUMERIC,
  tier_suggested credit_tier,
  paid_ontime BIGINT,
  paid_late BIGINT,
  overdue_now BIGINT,
  avg_days_late NUMERIC,
  score INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH i AS (
    SELECT * FROM public.credit_installments
    WHERE customer_id = _customer AND store_id = _store
      AND public.user_has_store(auth.uid(), _store)
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE status='paid' AND paid_at::date <= vencimento) AS paid_ontime,
      count(*) FILTER (WHERE status='paid' AND paid_at::date > vencimento) AS paid_late,
      count(*) FILTER (WHERE status IN ('open','overdue') AND vencimento < current_date) AS overdue_now,
      COALESCE(avg(CASE WHEN status='paid' AND paid_at::date > vencimento
                        THEN (paid_at::date - vencimento) END), 0)::numeric AS avg_days_late
    FROM i
  ),
  s AS (SELECT COALESCE(score, 80) AS score FROM public.credit_limits
        WHERE customer_id = _customer AND store_id = _store)
  SELECT
    -- heurística: 100 - score, penaliza vencidas atuais e média de dias em atraso
    LEAST(100, GREATEST(0,
      (100 - COALESCE((SELECT score FROM s), 80))
      + (a.overdue_now * 8)
      + (LEAST(a.avg_days_late, 60) * 0.5)
    ))::numeric AS probability,
    public.credit_tier_from_score(COALESCE((SELECT score FROM s), 80)) AS tier_suggested,
    a.paid_ontime, a.paid_late, a.overdue_now, ROUND(a.avg_days_late, 1),
    COALESCE((SELECT score FROM s), 80)::int
  FROM agg a;
$$;

-- 6) apply_overdue_penalties (runs from cron)
CREATE OR REPLACE FUNCTION public.apply_overdue_penalties()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INTEGER := 0; _r RECORD;
BEGIN
  FOR _r IN
    SELECT id, customer_id, store_id, numero
    FROM public.credit_installments
    WHERE status = 'overdue'
      AND penalty_applied_at IS NULL
      AND vencimento < (current_date - INTERVAL '30 days')
  LOOP
    INSERT INTO public.credit_score_events (customer_id, store_id, installment_id, delta, reason)
      VALUES (_r.customer_id, _r.store_id, _r.id, -20, 'Atraso 30+ dias (auto)');

    UPDATE public.credit_limits
      SET score = GREATEST(0, LEAST(100, score - 20)),
          tier = public.credit_tier_from_score(GREATEST(0, LEAST(100, score - 20))),
          updated_at = now()
      WHERE customer_id = _r.customer_id AND store_id = _r.store_id;

    UPDATE public.credit_installments
      SET penalty_applied_at = now()
      WHERE id = _r.id;

    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;
