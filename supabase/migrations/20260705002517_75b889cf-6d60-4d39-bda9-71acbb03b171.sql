
-- Vínculo PIX -> parcela
ALTER TABLE public.pix_charges
  ADD COLUMN IF NOT EXISTS credit_installment_id UUID REFERENCES public.credit_installments(id);
CREATE INDEX IF NOT EXISTS idx_pix_charges_installment ON public.pix_charges(credit_installment_id);

-- Regras de cobrança
CREATE TABLE IF NOT EXISTS public.collection_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  offset_days INTEGER NOT NULL, -- negativo = antes do vencimento
  level INTEGER NOT NULL DEFAULT 1, -- 1..4
  template TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  auto_pix BOOLEAN NOT NULL DEFAULT true,
  notify_manager BOOLEAN NOT NULL DEFAULT false,
  auto_block BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, offset_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_rules TO authenticated;
GRANT ALL ON public.collection_rules TO service_role;
ALTER TABLE public.collection_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read collection_rules by store" ON public.collection_rules FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "manage collection_rules admin/manager" ON public.collection_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');
CREATE TRIGGER trg_collection_rules_updated BEFORE UPDATE ON public.collection_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Eventos de cobrança
CREATE TABLE IF NOT EXISTS public.collection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES public.credit_installments(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  rule_id UUID REFERENCES public.collection_rules(id),
  offset_days INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  wa_url TEXT,
  pix_charge_id UUID REFERENCES public.pix_charges(id),
  status TEXT NOT NULL DEFAULT 'queued', -- queued|sent|failed
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installment_id, offset_days)
);
CREATE INDEX idx_collection_events_installment ON public.collection_events(installment_id);
CREATE INDEX idx_collection_events_store ON public.collection_events(store_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.collection_events TO authenticated;
GRANT ALL ON public.collection_events TO service_role;
ALTER TABLE public.collection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read collection_events by store" ON public.collection_events FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "update collection_events by store" ON public.collection_events FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

-- Seed automático de regras padrão para toda loja existente e futura
CREATE OR REPLACE FUNCTION public.seed_collection_rules(_store_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.collection_rules (store_id, offset_days, level, template, auto_pix, notify_manager, auto_block) VALUES
    (_store_id, -7, 1, 'Olá {cliente}! Sua parcela de {valor} vence em {vencimento} ({dias} dias). Se quiser antecipar, envio o PIX. ', true, false, false),
    (_store_id,  0, 1, 'Olá {cliente}, hoje vence sua parcela de {valor}. PIX na sequência: {pix}', true, false, false),
    (_store_id,  3, 2, 'Olá {cliente}, identificamos uma parcela de {valor} vencida há {dias} dias. Pode pagar via PIX: {pix}', true, false, false),
    (_store_id,  7, 2, '{cliente}, sua parcela de {valor} está com {dias} dias de atraso. Regularize via PIX: {pix}', true, false, false),
    (_store_id, 15, 3, '{cliente}, parcela em atraso há {dias} dias. Entre em contato com a loja urgentemente.', false, true, false),
    (_store_id, 30, 4, 'Cliente {cliente} atingiu {dias} dias de atraso — conta bloqueada para novas compras fiado.', false, true, true)
  ON CONFLICT (store_id, offset_days) DO NOTHING;
END; $$;

-- Faz seed em todas as lojas ativas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.stores WHERE active LOOP
    PERFORM public.seed_collection_rules(r.id);
  END LOOP;
END $$;

-- Novas lojas ganham seed automático
CREATE OR REPLACE FUNCTION public.on_store_created_seed_collection_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.seed_collection_rules(NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_store_seed_collection ON public.stores;
CREATE TRIGGER trg_store_seed_collection AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.on_store_created_seed_collection_rules();

-- Baixa de parcela pelo sistema (bypass auth.uid, invocado pelo webhook admin)
CREATE OR REPLACE FUNCTION public.system_pay_installment(
  _installment_id UUID, _amount NUMERIC, _method TEXT, _pix_charge UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _inst RECORD; _delta INTEGER; _reason TEXT;
BEGIN
  SELECT * INTO _inst FROM public.credit_installments WHERE id=_installment_id;
  IF _inst IS NULL THEN RETURN; END IF;
  IF _inst.status = 'paid' THEN RETURN; END IF;

  UPDATE public.credit_installments
    SET status='paid', paid_at=now(), paid_amount=_amount,
        payment_method=_method, pix_charge_id = COALESCE(_pix_charge, pix_charge_id)
    WHERE id=_installment_id;

  INSERT INTO public.financial_transactions(
    store_id, kind, source, description, amount, payment_method,
    pix_charge_id, paid_at
  ) VALUES (
    _inst.store_id, 'income', 'credit',
    'Crediário parcela ' || _inst.numero || ' (PIX auto)',
    _amount, _method, _pix_charge, now()
  );

  IF _inst.vencimento >= current_date THEN
    _delta := 5; _reason := 'Pagamento em dia (auto)';
  ELSIF (current_date - _inst.vencimento) <= 5 THEN
    _delta := -3; _reason := 'Atraso curto (auto)';
  ELSIF (current_date - _inst.vencimento) <= 30 THEN
    _delta := -10; _reason := 'Atraso 6-30 dias (auto)';
  ELSE
    _delta := -20; _reason := 'Atraso 30+ dias (auto)';
  END IF;

  INSERT INTO public.credit_score_events(customer_id, store_id, installment_id, delta, reason)
    VALUES (_inst.customer_id, _inst.store_id, _installment_id, _delta, _reason);

  UPDATE public.credit_limits SET
    score = GREATEST(0, LEAST(100, score + _delta)),
    tier = public.credit_tier_from_score(GREATEST(0, LEAST(100, score + _delta))),
    updated_at = now()
  WHERE customer_id=_inst.customer_id AND store_id=_inst.store_id;

  -- desbloqueia se quitou tudo
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_installments
    WHERE customer_id=_inst.customer_id AND store_id=_inst.store_id
      AND status IN ('open','overdue')
  ) THEN
    UPDATE public.credit_limits SET blocked=false, blocked_reason=NULL, blocked_at=NULL
      WHERE customer_id=_inst.customer_id AND store_id=_inst.store_id AND blocked;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.system_pay_installment(UUID, NUMERIC, TEXT, UUID) FROM anon, authenticated;

-- Bloqueio automático (chamado pelo cron)
CREATE OR REPLACE FUNCTION public.system_block_customer(_customer UUID, _store UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.ensure_credit_limit(_customer, _store);
  UPDATE public.credit_limits
    SET blocked=true, blocked_reason=_reason, blocked_at=now(), updated_at=now()
    WHERE customer_id=_customer AND store_id=_store AND NOT blocked;
END; $$;
REVOKE EXECUTE ON FUNCTION public.system_block_customer(UUID, UUID, TEXT) FROM anon, authenticated;
