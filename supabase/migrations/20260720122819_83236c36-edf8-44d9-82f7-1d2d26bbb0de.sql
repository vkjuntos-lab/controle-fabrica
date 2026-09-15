
CREATE TABLE IF NOT EXISTS public.bella_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','needs_training','escalated')),
  csat_score smallint,
  csat_comment text,
  reviewer_id uuid,
  reviewer_notes text,
  reviewed_at timestamptz,
  escalation_reason text,
  auto_flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bella_reviews TO authenticated;
GRANT ALL ON public.bella_reviews TO service_role;
ALTER TABLE public.bella_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bella_reviews_admin_all" ON public.bella_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "bella_reviews_manager_scope" ON public.bella_reviews
  FOR ALL TO authenticated
  USING (public.user_role_in_store(auth.uid(), store_id) = ANY (ARRAY['manager'::app_role,'admin'::app_role]) OR public.is_admin(auth.uid()))
  WITH CHECK (public.user_role_in_store(auth.uid(), store_id) = ANY (ARRAY['manager'::app_role,'admin'::app_role]) OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS bella_reviews_store_status_idx ON public.bella_reviews(store_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bella_reviews_conv_unique ON public.bella_reviews(conversation_id);

CREATE TRIGGER trg_bella_reviews_updated
  BEFORE UPDATE ON public.bella_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.loyalty_rules
  ADD COLUMN IF NOT EXISTS birthday_bonus_points integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS low_balance_threshold integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS notify_on_earn boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_expiring_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.recompute_loyalty_tier(_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lifetime integer;
  _rule record;
  _new_tier loyalty_tier;
BEGIN
  SELECT COALESCE(lifetime_points, 0) INTO _lifetime FROM public.loyalty_accounts WHERE customer_id = _customer_id;
  IF _lifetime IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _rule FROM public.loyalty_rules WHERE active = true ORDER BY created_at DESC LIMIT 1;
  IF _rule IS NULL THEN RETURN NULL; END IF;
  IF _lifetime >= _rule.tier_diamante_threshold THEN _new_tier := 'diamante';
  ELSIF _lifetime >= _rule.tier_ouro_threshold THEN _new_tier := 'ouro';
  ELSIF _lifetime >= _rule.tier_prata_threshold THEN _new_tier := 'prata';
  ELSE _new_tier := 'bronze';
  END IF;
  UPDATE public.loyalty_accounts SET tier = _new_tier, updated_at = now() WHERE customer_id = _customer_id;
  RETURN _new_tier::text;
END;
$$;
