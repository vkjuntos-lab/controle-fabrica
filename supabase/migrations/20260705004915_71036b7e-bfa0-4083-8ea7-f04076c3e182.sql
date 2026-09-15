
CREATE TABLE IF NOT EXISTS public.boletos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  ar_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  barcode TEXT,
  digitable_line TEXT,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','overdue','cancelled')),
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2),
  notes TEXT,
  operator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boletos TO authenticated;
GRANT ALL ON public.boletos TO service_role;
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boletos view store" ON public.boletos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = boletos.store_id));

CREATE POLICY "boletos manage manager" ON public.boletos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = boletos.store_id AND ur.role IN ('manager')))
WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = boletos.store_id AND ur.role IN ('manager')));

CREATE TRIGGER trg_boletos_updated_at BEFORE UPDATE ON public.boletos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.on_boleto_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat UUID;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    IF NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
    IF NEW.paid_amount IS NULL THEN NEW.paid_amount := NEW.amount; END IF;
    SELECT id INTO v_cat FROM public.financial_categories
      WHERE store_id = NEW.store_id AND kind = 'income' ORDER BY created_at LIMIT 1;
    INSERT INTO public.financial_transactions(store_id, kind, amount, occurred_at, category_id, description, source, source_id)
    VALUES (NEW.store_id, 'income', NEW.paid_amount, NEW.paid_at, v_cat, 'Boleto pago #' || substr(NEW.id::text,1,8), 'boleto', NEW.id);
    IF NEW.ar_id IS NOT NULL THEN
      UPDATE public.accounts_receivable SET status='paid', paid_at=NEW.paid_at, paid_amount=NEW.paid_amount, updated_at=now() WHERE id = NEW.ar_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_boleto_paid BEFORE UPDATE ON public.boletos
FOR EACH ROW EXECUTE FUNCTION public.on_boleto_paid();

CREATE OR REPLACE FUNCTION public.create_boleto(
  _store UUID, _customer UUID, _amount NUMERIC, _due DATE,
  _barcode TEXT DEFAULT NULL, _digitable TEXT DEFAULT NULL,
  _pdf TEXT DEFAULT NULL, _notes TEXT DEFAULT NULL,
  _ar UUID DEFAULT NULL, _sale UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.boletos(store_id, customer_id, amount, due_date, barcode, digitable_line, pdf_url, notes, ar_id, sale_id, operator_user_id)
  VALUES (_store, _customer, _amount, _due, _barcode, _digitable, _pdf, _notes, _ar, _sale, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_boletos(_store UUID, _status TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, store_id UUID, customer_id UUID, customer_name TEXT, amount NUMERIC, due_date DATE, status TEXT, barcode TEXT, digitable_line TEXT, pdf_url TEXT, paid_at TIMESTAMPTZ, paid_amount NUMERIC, notes TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.store_id, b.customer_id, c.name, b.amount, b.due_date, b.status, b.barcode, b.digitable_line, b.pdf_url, b.paid_at, b.paid_amount, b.notes, b.created_at
    FROM public.boletos b LEFT JOIN public.customers c ON c.id = b.customer_id
   WHERE b.store_id = _store AND (_status IS NULL OR b.status = _status)
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store))
   ORDER BY b.created_at DESC LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.mark_boleto_paid(_id UUID, _amount NUMERIC DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID;
BEGIN
  SELECT store_id INTO v_store FROM public.boletos WHERE id = _id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = v_store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.boletos SET status='paid', paid_at=now(), paid_amount=COALESCE(_amount, amount) WHERE id=_id;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_boleto(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID;
BEGIN
  SELECT store_id INTO v_store FROM public.boletos WHERE id = _id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = v_store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.boletos SET status='cancelled' WHERE id=_id AND status='open';
END; $$;

CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2),
  cadence TEXT NOT NULL CHECK (cadence IN ('once','daily','weekly','monthly')),
  next_run_at DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  occurrences INT NOT NULL DEFAULT 0,
  max_occurrences INT,
  last_run_at TIMESTAMPTZ,
  operator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedules TO authenticated;
GRANT ALL ON public.payment_schedules TO service_role;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psched view store" ON public.payment_schedules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = payment_schedules.store_id));

CREATE POLICY "psched manage manager" ON public.payment_schedules FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = payment_schedules.store_id AND ur.role IN ('manager')))
WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = payment_schedules.store_id AND ur.role IN ('manager')));

CREATE TRIGGER trg_psched_updated_at BEFORE UPDATE ON public.payment_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  wa_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reminders TO authenticated;
GRANT ALL ON public.payment_reminders TO service_role;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preminders view store" ON public.payment_reminders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = payment_reminders.store_id));

CREATE POLICY "preminders update manager" ON public.payment_reminders FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = payment_reminders.store_id AND ur.role IN ('manager')));

CREATE OR REPLACE FUNCTION public.create_payment_schedule(
  _store UUID, _customer UUID, _title TEXT, _amount NUMERIC,
  _cadence TEXT, _next DATE, _message TEXT, _max_occ INT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.payment_schedules(store_id, customer_id, title, amount, cadence, next_run_at, message, max_occurrences, operator_user_id)
  VALUES (_store, _customer, _title, _amount, _cadence, _next, _message, _max_occ, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_payment_schedules(_store UUID)
RETURNS TABLE(id UUID, customer_id UUID, customer_name TEXT, customer_phone TEXT, title TEXT, amount NUMERIC, cadence TEXT, next_run_at DATE, active BOOLEAN, occurrences INT, max_occurrences INT, last_run_at TIMESTAMPTZ, message TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.customer_id, c.name, c.phone, s.title, s.amount, s.cadence, s.next_run_at, s.active, s.occurrences, s.max_occurrences, s.last_run_at, s.message, s.created_at
    FROM public.payment_schedules s JOIN public.customers c ON c.id = s.customer_id
   WHERE s.store_id = _store
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store))
   ORDER BY s.next_run_at ASC, s.created_at DESC LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.toggle_payment_schedule(_id UUID, _active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID;
BEGIN
  SELECT store_id INTO v_store FROM public.payment_schedules WHERE id = _id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = v_store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payment_schedules SET active = _active WHERE id = _id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_payment_reminders(_store UUID, _limit INT DEFAULT 100)
RETURNS TABLE(id UUID, schedule_id UUID, customer_id UUID, customer_name TEXT, channel TEXT, message TEXT, wa_url TEXT, status TEXT, sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.schedule_id, r.customer_id, c.name, r.channel, r.message, r.wa_url, r.status, r.sent_at, r.created_at
    FROM public.payment_reminders r JOIN public.customers c ON c.id = r.customer_id
   WHERE r.store_id = _store
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = _store))
   ORDER BY r.created_at DESC LIMIT COALESCE(_limit,100);
$$;

CREATE OR REPLACE FUNCTION public.mark_reminder_sent(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID;
BEGIN
  SELECT store_id INTO v_store FROM public.payment_reminders WHERE id = _id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.store_id = v_store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payment_reminders SET status='sent', sent_at=now() WHERE id=_id;
END; $$;

CREATE OR REPLACE FUNCTION public.run_due_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; cust RECORD; brl TEXT; phone_digits TEXT; wa TEXT; msg TEXT; next_date DATE; cnt INT := 0;
BEGIN
  UPDATE public.boletos SET status='overdue', updated_at=now()
   WHERE status='open' AND due_date < CURRENT_DATE;

  FOR r IN
    SELECT * FROM public.payment_schedules
     WHERE active = TRUE AND next_run_at <= CURRENT_DATE
       AND (max_occurrences IS NULL OR occurrences < max_occurrences)
  LOOP
    SELECT id, name, phone INTO cust FROM public.customers WHERE id = r.customer_id;
    IF cust.id IS NULL THEN CONTINUE; END IF;

    brl := 'R$ ' || REPLACE(TO_CHAR(COALESCE(r.amount,0), 'FM999G999G990D00'), '.', ',');
    msg := REPLACE(r.message, '{cliente}', COALESCE(split_part(cust.name,' ',1),'Cliente'));
    msg := REPLACE(msg, '{titulo}', r.title);
    msg := REPLACE(msg, '{valor}', brl);
    msg := REPLACE(msg, '{vencimento}', TO_CHAR(r.next_run_at, 'DD/MM/YYYY'));

    phone_digits := regexp_replace(COALESCE(cust.phone,''), '\D+', '', 'g');
    IF length(phone_digits) = 11 THEN phone_digits := '55' || phone_digits; END IF;
    wa := CASE WHEN phone_digits <> '' THEN
      'https://wa.me/' || phone_digits || '?text=' || replace(replace(msg, ' ', '%20'), E'\n', '%0A')
      ELSE NULL END;

    INSERT INTO public.payment_reminders(schedule_id, store_id, customer_id, channel, message, wa_url)
    VALUES (r.id, r.store_id, r.customer_id, r.channel, msg, wa);
    cnt := cnt + 1;

    next_date := CASE r.cadence
      WHEN 'daily' THEN r.next_run_at + INTERVAL '1 day'
      WHEN 'weekly' THEN r.next_run_at + INTERVAL '7 days'
      WHEN 'monthly' THEN r.next_run_at + INTERVAL '1 month'
      ELSE NULL END;

    UPDATE public.payment_schedules
       SET occurrences = occurrences + 1,
           last_run_at = now(),
           next_run_at = COALESCE(next_date, r.next_run_at),
           active = CASE
             WHEN r.cadence = 'once' THEN FALSE
             WHEN r.max_occurrences IS NOT NULL AND (occurrences + 1) >= r.max_occurrences THEN FALSE
             ELSE r.active END
     WHERE id = r.id;
  END LOOP;
  RETURN cnt;
END; $$;
