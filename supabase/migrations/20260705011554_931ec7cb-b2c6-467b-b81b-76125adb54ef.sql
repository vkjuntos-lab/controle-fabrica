
CREATE TABLE public.gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  initial_amount NUMERIC(12,2) NOT NULL CHECK (initial_amount > 0),
  balance NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','redeemed','expired','cancelled')),
  issued_to_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gift_cards TO authenticated;
GRANT ALL ON public.gift_cards TO service_role;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read gift cards" ON public.gift_cards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage gift cards" ON public.gift_cards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier'));

CREATE TRIGGER trg_gift_cards_updated BEFORE UPDATE ON public.gift_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_gift_cards_store ON public.gift_cards(store_id, status);
CREATE INDEX idx_gift_cards_customer ON public.gift_cards(issued_to_customer_id);

CREATE TABLE public.gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
  sale_id UUID,
  type TEXT NOT NULL CHECK (type IN ('issue','redeem','refund','cancel')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.gift_card_transactions TO authenticated;
GRANT ALL ON public.gift_card_transactions TO service_role;
ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read gift card txs" ON public.gift_card_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert gift card txs" ON public.gift_card_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_gc_tx_card ON public.gift_card_transactions(gift_card_id, created_at DESC);

CREATE TABLE public.customer_store_credit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, store_id)
);
GRANT SELECT, INSERT, UPDATE ON public.customer_store_credit TO authenticated;
GRANT ALL ON public.customer_store_credit TO service_role;
ALTER TABLE public.customer_store_credit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read store credit" ON public.customer_store_credit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff modify store credit" ON public.customer_store_credit
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier'));
CREATE TRIGGER trg_csc_updated BEFORE UPDATE ON public.customer_store_credit
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customer_store_credit_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit','debit','adjustment')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sale','refund','manual','system')),
  source_id UUID,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_store_credit_movements TO authenticated;
GRANT ALL ON public.customer_store_credit_movements TO service_role;
ALTER TABLE public.customer_store_credit_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read credit movs" ON public.customer_store_credit_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert credit movs" ON public.customer_store_credit_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_csc_mov_customer ON public.customer_store_credit_movements(customer_id, store_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.gen_gift_card_code()
RETURNS TEXT LANGUAGE plpgsql SET search_path=public AS $$
DECLARE chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code TEXT; i INT;
BEGIN
  LOOP
    code := 'KS';
    FOR i IN 1..8 LOOP code := code || substr(chars, 1 + floor(random()*length(chars))::INT, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gift_cards WHERE gift_cards.code = code);
  END LOOP;
  RETURN code;
END; $$;

CREATE OR REPLACE FUNCTION public.issue_gift_card(
  p_store_id UUID, p_amount NUMERIC, p_customer_id UUID DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS public.gift_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code TEXT; v_row public.gift_cards;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  v_code := public.gen_gift_card_code();
  INSERT INTO public.gift_cards(store_id, code, initial_amount, balance, issued_to_customer_id, issued_by, expires_at, notes)
  VALUES (p_store_id, v_code, p_amount, p_amount, p_customer_id, auth.uid(), p_expires_at, p_notes) RETURNING * INTO v_row;
  INSERT INTO public.gift_card_transactions(gift_card_id, type, amount, balance_after, created_by)
  VALUES (v_row.id, 'issue', p_amount, p_amount, auth.uid());
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_gift_card(
  p_code TEXT, p_amount NUMERIC, p_sale_id UUID DEFAULT NULL
) RETURNS public.gift_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.gift_cards; v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_row FROM public.gift_cards WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vale-presente não encontrado'; END IF;
  IF v_row.status <> 'active' THEN RAISE EXCEPTION 'Vale inativo (%)', v_row.status; END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    UPDATE public.gift_cards SET status='expired' WHERE id=v_row.id;
    RAISE EXCEPTION 'Vale expirado';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_amount > v_row.balance THEN RAISE EXCEPTION 'Saldo insuficiente (disponível: %)', v_row.balance; END IF;
  v_new_balance := v_row.balance - p_amount;
  UPDATE public.gift_cards
    SET balance = v_new_balance,
        status = CASE WHEN v_new_balance = 0 THEN 'redeemed' ELSE 'active' END
    WHERE id = v_row.id RETURNING * INTO v_row;
  INSERT INTO public.gift_card_transactions(gift_card_id, sale_id, type, amount, balance_after, created_by)
  VALUES (v_row.id, p_sale_id, 'redeem', p_amount, v_new_balance, auth.uid());
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_gift_card(p_id UUID)
RETURNS public.gift_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.gift_cards;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Apenas admin/gerente';
  END IF;
  UPDATE public.gift_cards SET status='cancelled' WHERE id=p_id AND status='active' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vale não encontrado ou já inativo'; END IF;
  INSERT INTO public.gift_card_transactions(gift_card_id, type, amount, balance_after, created_by)
  VALUES (v_row.id, 'cancel', v_row.balance, 0, auth.uid());
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.add_store_credit(
  p_customer_id UUID, p_store_id UUID, p_amount NUMERIC,
  p_source TEXT DEFAULT 'manual', p_source_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  INSERT INTO public.customer_store_credit(customer_id, store_id, balance)
  VALUES (p_customer_id, p_store_id, p_amount)
  ON CONFLICT (customer_id, store_id)
  DO UPDATE SET balance = customer_store_credit.balance + EXCLUDED.balance
  RETURNING balance INTO v_balance;
  INSERT INTO public.customer_store_credit_movements(customer_id, store_id, type, amount, balance_after, source, source_id, note, created_by)
  VALUES (p_customer_id, p_store_id, 'credit', p_amount, v_balance, p_source, p_source_id, p_note, auth.uid());
  RETURN v_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.debit_store_credit(
  p_customer_id UUID, p_store_id UUID, p_amount NUMERIC,
  p_source TEXT DEFAULT 'sale', p_source_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.customer_store_credit; v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  SELECT * INTO v_row FROM public.customer_store_credit
    WHERE customer_id=p_customer_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente sem saldo nesta loja'; END IF;
  IF v_row.balance < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente (disponível: %)', v_row.balance; END IF;
  v_balance := v_row.balance - p_amount;
  UPDATE public.customer_store_credit SET balance = v_balance WHERE id = v_row.id;
  INSERT INTO public.customer_store_credit_movements(customer_id, store_id, type, amount, balance_after, source, source_id, note, created_by)
  VALUES (p_customer_id, p_store_id, 'debit', p_amount, v_balance, p_source, p_source_id, p_note, auth.uid());
  RETURN v_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.get_store_credit_balance(p_customer_id UUID, p_store_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT COALESCE((SELECT balance FROM public.customer_store_credit WHERE customer_id=p_customer_id AND store_id=p_store_id), 0);
$$;
