
-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'boleto_overdue' | 'payment_received' | 'subscription_failed' | 'credit_overdue' | 'stock_low' | 'sale_closed' | 'generic'
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','error')),
  title TEXT NOT NULL,
  message TEXT,
  link_url TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_roles TEXT[] NOT NULL DEFAULT ARRAY['admin','manager'],
  read_by UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif view store" ON public.notifications FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.store_id = notifications.store_id
      AND ur.role::text = ANY(notifications.target_roles)
  )
);
CREATE POLICY "notif update store" ON public.notifications FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.store_id = notifications.store_id
      AND ur.role::text = ANY(notifications.target_roles)
  )
);

CREATE INDEX IF NOT EXISTS idx_notif_store_created ON public.notifications(store_id, created_at DESC);

-- ============ WA SETTINGS ============
CREATE TABLE IF NOT EXISTS public.wa_settings (
  store_id UUID NOT NULL PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'wa_link' CHECK (provider IN ('wa_link','zapi','cloud')),
  from_number TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_settings TO authenticated;
GRANT ALL ON public.wa_settings TO service_role;
ALTER TABLE public.wa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_settings view store" ON public.wa_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=wa_settings.store_id));
CREATE POLICY "wa_settings manage manager" ON public.wa_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=wa_settings.store_id AND ur.role IN ('manager')))
WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=wa_settings.store_id AND ur.role IN ('manager')));

CREATE TRIGGER trg_wa_settings_updated_at BEFORE UPDATE ON public.wa_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ EXTEND payment_reminders ============
ALTER TABLE public.payment_reminders ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.payment_reminders ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.payment_reminders ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.payment_reminders ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.payment_reminders ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============ RPCs ============
-- Emit notification (SECURITY DEFINER; may be called from triggers/RPCs)
CREATE OR REPLACE FUNCTION public.emit_notification(
  _store UUID, _kind TEXT, _title TEXT, _message TEXT DEFAULT NULL,
  _severity TEXT DEFAULT 'info', _link TEXT DEFAULT NULL, _ctx JSONB DEFAULT '{}'::jsonb,
  _roles TEXT[] DEFAULT ARRAY['admin','manager']
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.notifications(store_id, kind, severity, title, message, link_url, context, target_roles)
  VALUES (_store, _kind, _severity, _title, _message, _link, COALESCE(_ctx,'{}'::jsonb), _roles)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_notifications(_store UUID, _only_unread BOOLEAN DEFAULT FALSE, _limit INT DEFAULT 100)
RETURNS TABLE(id UUID, kind TEXT, severity TEXT, title TEXT, message TEXT, link_url TEXT, context JSONB, is_read BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.kind, n.severity, n.title, n.message, n.link_url, n.context,
         (auth.uid() = ANY(n.read_by)) AS is_read, n.created_at
    FROM public.notifications n
   WHERE n.store_id = _store
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.store_id = _store
         AND ur.role::text = ANY(n.target_roles)
     ))
     AND (NOT _only_unread OR NOT (auth.uid() = ANY(n.read_by)))
   ORDER BY n.created_at DESC
   LIMIT COALESCE(_limit,100);
$$;

CREATE OR REPLACE FUNCTION public.notifications_unread_count(_store UUID)
RETURNS INT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.notifications n
   WHERE n.store_id = _store
     AND NOT (auth.uid() = ANY(n.read_by))
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.store_id = _store
         AND ur.role::text = ANY(n.target_roles)
     ));
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications
     SET read_by = ARRAY(SELECT DISTINCT unnest(read_by || ARRAY[auth.uid()]))
   WHERE id = _id
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.store_id = notifications.store_id
         AND ur.role::text = ANY(notifications.target_roles)
     ));
END; $$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(_store UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cnt INT;
BEGIN
  UPDATE public.notifications
     SET read_by = ARRAY(SELECT DISTINCT unnest(read_by || ARRAY[auth.uid()]))
   WHERE store_id = _store
     AND NOT (auth.uid() = ANY(read_by))
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.store_id = _store
         AND ur.role::text = ANY(notifications.target_roles)
     ));
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN v_cnt;
END; $$;

-- ============ WA SETTINGS RPCs ============
CREATE OR REPLACE FUNCTION public.get_wa_settings(_store UUID)
RETURNS TABLE(store_id UUID, provider TEXT, from_number TEXT, active BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.store_id, s.provider, s.from_number, s.active
    FROM public.wa_settings s
   WHERE s.store_id = _store
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=_store));
$$;

CREATE OR REPLACE FUNCTION public.upsert_wa_settings(_store UUID, _provider TEXT, _from TEXT, _active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=_store AND ur.role IN ('manager')))
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.wa_settings(store_id, provider, from_number, active)
  VALUES (_store, _provider, _from, COALESCE(_active,TRUE))
  ON CONFLICT (store_id) DO UPDATE SET provider = EXCLUDED.provider, from_number = EXCLUDED.from_number, active = EXCLUDED.active, updated_at = now();
END; $$;

-- Reminders for sending: queued rows joined with customer phone
CREATE OR REPLACE FUNCTION public.list_queued_reminders(_limit INT DEFAULT 200)
RETURNS TABLE(id UUID, store_id UUID, customer_id UUID, customer_name TEXT, phone TEXT, message TEXT, wa_url TEXT, provider TEXT, attempts INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.store_id, r.customer_id, c.name, COALESCE(r.phone, c.phone), r.message, r.wa_url,
         COALESCE(r.provider, ws.provider, 'wa_link'), r.attempts
    FROM public.payment_reminders r
    JOIN public.customers c ON c.id = r.customer_id
    LEFT JOIN public.wa_settings ws ON ws.store_id = r.store_id
   WHERE r.status = 'queued'
     AND r.attempts < 5
   ORDER BY r.created_at ASC
   LIMIT COALESCE(_limit,200);
$$;

CREATE OR REPLACE FUNCTION public.record_reminder_result(
  _id UUID, _ok BOOLEAN, _provider TEXT DEFAULT NULL, _msg_id TEXT DEFAULT NULL, _error TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.payment_reminders
     SET status = CASE WHEN _ok THEN 'sent' ELSE 'failed' END,
         sent_at = CASE WHEN _ok THEN now() ELSE sent_at END,
         provider = COALESCE(_provider, provider),
         provider_message_id = COALESCE(_msg_id, provider_message_id),
         error = _error,
         attempts = attempts + 1
   WHERE id = _id;
END; $$;

-- ============ TRIGGERS FOR NOTIFICATIONS ============
-- Boleto overdue → notify
CREATE OR REPLACE FUNCTION public.trg_boleto_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'overdue' AND COALESCE(OLD.status,'') <> 'overdue' THEN
    PERFORM public.emit_notification(
      NEW.store_id, 'boleto_overdue',
      'Boleto vencido',
      'Boleto #' || COALESCE(NEW.our_number, substr(NEW.id::text,1,8)) || ' venceu.',
      'warning', '/pdv/recebimentos/boletos',
      jsonb_build_object('boleto_id', NEW.id, 'amount', NEW.amount)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid' THEN
    PERFORM public.emit_notification(
      NEW.store_id, 'payment_received',
      'Boleto pago',
      'Boleto foi liquidado.',
      'success', '/pdv/recebimentos/boletos',
      jsonb_build_object('boleto_id', NEW.id, 'amount', NEW.amount)
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_boleto_notify ON public.boletos;
CREATE TRIGGER trg_boleto_notify AFTER UPDATE ON public.boletos
FOR EACH ROW EXECUTE FUNCTION public.trg_boleto_status_notify();

-- Payment link paid → notify
CREATE OR REPLACE FUNCTION public.trg_paylink_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid' THEN
    PERFORM public.emit_notification(
      NEW.store_id, 'payment_received',
      'Pagamento recebido',
      'Link ' || COALESCE(NEW.code,'') || ' foi pago.',
      'success', '/pdv/recebimentos',
      jsonb_build_object('payment_link_id', NEW.id, 'amount', NEW.amount)
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_paylink_notify ON public.payment_links;
CREATE TRIGGER trg_paylink_notify AFTER UPDATE ON public.payment_links
FOR EACH ROW EXECUTE FUNCTION public.trg_paylink_status_notify();

-- Subscription charge failed → notify
CREATE OR REPLACE FUNCTION public.trg_subcharge_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'failed' AND COALESCE(OLD.status,'') <> 'failed' THEN
    SELECT store_id INTO v_store FROM public.subscriptions WHERE id = NEW.subscription_id;
    IF v_store IS NOT NULL THEN
      PERFORM public.emit_notification(
        v_store, 'subscription_failed',
        'Cobrança recorrente falhou',
        'Uma parcela de assinatura não foi cobrada.',
        'error', '/pdv/recebimentos/assinaturas',
        jsonb_build_object('subscription_id', NEW.subscription_id, 'amount', NEW.amount)
      );
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_subcharge_notify ON public.subscription_charges;
CREATE TRIGGER trg_subcharge_notify AFTER UPDATE ON public.subscription_charges
FOR EACH ROW EXECUTE FUNCTION public.trg_subcharge_status_notify();
