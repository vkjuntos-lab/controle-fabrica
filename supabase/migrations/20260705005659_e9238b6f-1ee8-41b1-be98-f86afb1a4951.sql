
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  frequency_type TEXT NOT NULL DEFAULT 'months' CHECK (frequency_type IN ('days','weeks','months')),
  frequency INT NOT NULL DEFAULT 1 CHECK (frequency >= 1),
  next_charge_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','cancelled','completed')),
  payer_email TEXT,
  mp_preapproval_id TEXT,
  mp_init_point TEXT,
  charges_count INT NOT NULL DEFAULT 0,
  max_charges INT,
  last_charge_at TIMESTAMPTZ,
  notes TEXT,
  operator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs view store" ON public.subscriptions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = subscriptions.store_id));
CREATE POLICY "subs manage manager" ON public.subscriptions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = subscriptions.store_id AND ur.role IN ('manager')))
WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = subscriptions.store_id AND ur.role IN ('manager')));

CREATE TRIGGER trg_subs_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.subscription_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  mp_payment_id TEXT,
  charged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.subscription_charges TO authenticated;
GRANT ALL ON public.subscription_charges TO service_role;
ALTER TABLE public.subscription_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub-charges view store" ON public.subscription_charges FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = subscription_charges.store_id));

-- Baixa automática ao marcar cobrança como paga
CREATE OR REPLACE FUNCTION public.on_sub_charge_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat UUID;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    IF NEW.charged_at IS NULL THEN NEW.charged_at := now(); END IF;
    SELECT id INTO v_cat FROM public.financial_categories
      WHERE store_id = NEW.store_id AND kind = 'income' ORDER BY created_at LIMIT 1;
    INSERT INTO public.financial_transactions(store_id, kind, amount, occurred_at, category_id, description, source, source_id)
    VALUES (NEW.store_id, 'income', NEW.amount, NEW.charged_at, v_cat,
            'Assinatura #' || substr(NEW.subscription_id::text,1,8),
            'subscription', NEW.id);
    UPDATE public.subscriptions
       SET charges_count = charges_count + 1,
           last_charge_at = NEW.charged_at,
           status = CASE
             WHEN max_charges IS NOT NULL AND (charges_count + 1) >= max_charges THEN 'completed'
             ELSE status END
     WHERE id = NEW.subscription_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_sub_charge_paid BEFORE UPDATE ON public.subscription_charges
FOR EACH ROW EXECUTE FUNCTION public.on_sub_charge_paid();

CREATE OR REPLACE FUNCTION public.create_subscription(
  _store UUID, _customer UUID, _title TEXT, _amount NUMERIC,
  _freq_type TEXT, _freq INT, _next DATE,
  _payer_email TEXT DEFAULT NULL, _max_charges INT DEFAULT NULL, _notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.subscriptions(store_id, customer_id, title, amount, frequency_type, frequency, next_charge_at, payer_email, max_charges, notes, operator_user_id)
  VALUES (_store, _customer, _title, _amount, _freq_type, _freq, _next, _payer_email, _max_charges, _notes, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_subscriptions(_store UUID)
RETURNS TABLE(
  id UUID, customer_id UUID, customer_name TEXT, customer_phone TEXT,
  title TEXT, amount NUMERIC, frequency_type TEXT, frequency INT,
  next_charge_at DATE, status TEXT, charges_count INT, max_charges INT,
  last_charge_at TIMESTAMPTZ, mp_init_point TEXT, mp_preapproval_id TEXT,
  payer_email TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.customer_id, c.name, c.phone,
         s.title, s.amount, s.frequency_type, s.frequency,
         s.next_charge_at, s.status, s.charges_count, s.max_charges,
         s.last_charge_at, s.mp_init_point, s.mp_preapproval_id,
         s.payer_email, s.created_at
    FROM public.subscriptions s
    JOIN public.customers c ON c.id = s.customer_id
   WHERE s.store_id = _store
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store))
   ORDER BY s.created_at DESC LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.set_subscription_status(_id UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID;
BEGIN
  IF _status NOT IN ('active','paused','cancelled','completed','pending') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT store_id INTO v_store FROM public.subscriptions WHERE id = _id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = v_store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.subscriptions SET status = _status WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_subscription_charges(_subscription UUID)
RETURNS TABLE(id UUID, amount NUMERIC, status TEXT, mp_payment_id TEXT, charged_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT sc.id, sc.amount, sc.status, sc.mp_payment_id, sc.charged_at, sc.created_at
    FROM public.subscription_charges sc
    JOIN public.subscriptions s ON s.id = sc.subscription_id
   WHERE sc.subscription_id = _subscription
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = s.store_id))
   ORDER BY sc.created_at DESC LIMIT 200;
$$;
