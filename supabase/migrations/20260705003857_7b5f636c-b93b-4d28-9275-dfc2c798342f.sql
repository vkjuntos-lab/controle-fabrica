
-- Enum de método pago
DO $$ BEGIN
  CREATE TYPE public.payment_link_status AS ENUM ('pending','paid','expired','canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) payment_gateways
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pg_select" ON public.payment_gateways FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "pg_manage" ON public.payment_gateways FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

CREATE TRIGGER trg_payment_gateways_updated_at
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed MercadoPago default gateway for each store
INSERT INTO public.payment_gateways (store_id, provider, active, is_default)
SELECT id, 'mercadopago', true, true FROM public.stores
ON CONFLICT (store_id, provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.on_store_seed_payment_gateway()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.payment_gateways (store_id, provider, active, is_default)
    VALUES (NEW.id, 'mercadopago', true, true)
    ON CONFLICT (store_id, provider) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_stores_seed_payment_gateway ON public.stores;
CREATE TRIGGER trg_stores_seed_payment_gateway
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.on_store_seed_payment_gateway();

-- 2) payment_links
CREATE TABLE IF NOT EXISTS public.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  receivable_id UUID REFERENCES public.accounts_receivable(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  methods JSONB NOT NULL DEFAULT '["pix","credit","debit"]'::jsonb,
  max_installments INTEGER NOT NULL DEFAULT 1 CHECK (max_installments BETWEEN 1 AND 12),
  status public.payment_link_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2),
  paid_method TEXT,
  installments_paid INTEGER,
  mp_preference_id TEXT,
  mp_init_point TEXT,
  mp_payment_id TEXT,
  operator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_store ON public.payment_links(store_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_customer ON public.payment_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_mp_payment ON public.payment_links(mp_payment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pl_select" ON public.payment_links FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "pl_insert" ON public.payment_links FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "pl_update_manager" ON public.payment_links FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

CREATE POLICY "pl_delete_admin" ON public.payment_links FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_payment_links_updated_at
  BEFORE UPDATE ON public.payment_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Link financial_transactions to payment_links
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS payment_link_id UUID REFERENCES public.payment_links(id) ON DELETE SET NULL;

-- 4) Trigger: paid -> financial_transactions + receivable/sale baixa
CREATE OR REPLACE FUNCTION public.on_payment_link_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    IF NOT EXISTS (SELECT 1 FROM public.financial_transactions WHERE payment_link_id = NEW.id) THEN
      INSERT INTO public.financial_transactions (
        store_id, kind, source, description, amount, payment_method,
        payment_link_id, sale_id, receivable_id, paid_at, created_by
      ) VALUES (
        NEW.store_id, 'income', 'link',
        'Link ' || NEW.code || COALESCE(' — ' || NEW.description, ''),
        COALESCE(NEW.paid_amount, NEW.amount),
        COALESCE(NEW.paid_method, 'link'),
        NEW.id, NEW.sale_id, NEW.receivable_id,
        COALESCE(NEW.paid_at, now()), NEW.operator_user_id
      );
    END IF;

    IF NEW.receivable_id IS NOT NULL THEN
      UPDATE public.accounts_receivable
        SET status='paid', paid_at=COALESCE(NEW.paid_at, now()),
            paid_amount=COALESCE(NEW.paid_amount, amount),
            updated_at=now()
        WHERE id=NEW.receivable_id AND status <> 'paid';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_payment_link_paid ON public.payment_links;
CREATE TRIGGER trg_payment_link_paid
  AFTER UPDATE ON public.payment_links
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_link_paid();

-- 5) Short-code generator + create_payment_link
CREATE OR REPLACE FUNCTION public.gen_payment_link_code()
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  alphabet TEXT := 'abcdefghijkmnpqrstuvwxyz23456789';
  code TEXT; i INTEGER;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_links WHERE code = code);
  END LOOP;
  RETURN code;
END; $$;

CREATE OR REPLACE FUNCTION public.create_payment_link(
  _store UUID,
  _amount NUMERIC,
  _description TEXT,
  _methods JSONB DEFAULT '["pix","credit","debit"]'::jsonb,
  _max_installments INTEGER DEFAULT 1,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _customer UUID DEFAULT NULL,
  _sale UUID DEFAULT NULL,
  _receivable UUID DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID; _code TEXT;
BEGIN
  IF NOT public.user_has_store(auth.uid(), _store) THEN
    RAISE EXCEPTION 'Sem permissão nessa loja';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  _code := public.gen_payment_link_code();
  INSERT INTO public.payment_links (
    store_id, code, customer_id, sale_id, receivable_id,
    description, amount, methods, max_installments,
    expires_at, operator_user_id, notes
  ) VALUES (
    _store, _code, _customer, _sale, _receivable,
    _description, _amount, COALESCE(_methods, '["pix","credit","debit"]'::jsonb),
    GREATEST(1, LEAST(12, COALESCE(_max_installments, 1))),
    COALESCE(_expires_at, now() + interval '48 hours'),
    auth.uid(), _notes
  ) RETURNING payment_links.id INTO _id;

  PERFORM public.log_audit('payment_link.create','payment_links',_id::text,_store,
    jsonb_build_object('amount',_amount,'methods',_methods));

  RETURN QUERY SELECT _id, _code;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_payment_link(_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row RECORD;
BEGIN
  SELECT * INTO _row FROM public.payment_links WHERE id = _id;
  IF _row IS NULL THEN RAISE EXCEPTION 'Link não encontrado'; END IF;
  IF NOT (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), _row.store_id) = 'manager') THEN
    RAISE EXCEPTION 'Apenas admin/gerente pode cancelar';
  END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'Somente links pendentes podem ser cancelados'; END IF;

  UPDATE public.payment_links SET status='canceled', updated_at=now() WHERE id=_id;
  PERFORM public.log_audit('payment_link.cancel','payment_links',_id::text,_row.store_id,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.list_payment_links(_store_id UUID, _scope TEXT)
RETURNS TABLE(
  id UUID, code TEXT, description TEXT, amount NUMERIC,
  status public.payment_link_status, methods JSONB,
  customer_id UUID, customer_name TEXT, customer_phone TEXT,
  created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
  paid_amount NUMERIC, paid_method TEXT, mp_init_point TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pl.id, pl.code, pl.description, pl.amount, pl.status, pl.methods,
         pl.customer_id, c.name, c.phone,
         pl.created_at, pl.expires_at, pl.paid_at,
         pl.paid_amount, pl.paid_method, pl.mp_init_point
  FROM public.payment_links pl
  LEFT JOIN public.customers c ON c.id = pl.customer_id
  WHERE pl.store_id = _store_id
    AND public.user_has_store(auth.uid(), _store_id)
    AND (
      _scope = 'all' OR
      (_scope = 'pending' AND pl.status = 'pending' AND (pl.expires_at IS NULL OR pl.expires_at > now())) OR
      (_scope = 'paid' AND pl.status = 'paid') OR
      (_scope = 'expired' AND (pl.status = 'expired' OR (pl.status = 'pending' AND pl.expires_at < now()))) OR
      (_scope = 'canceled' AND pl.status = 'canceled')
    )
  ORDER BY pl.created_at DESC
  LIMIT 500;
$$;

-- 6) mark_expired for cron
CREATE OR REPLACE FUNCTION public.mark_expired_payment_links()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n INTEGER;
BEGIN
  UPDATE public.payment_links
    SET status='expired', updated_at=now()
    WHERE status='pending' AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;

-- 7) Public resolver (used by /pay/:code landing) — anon-safe
CREATE OR REPLACE FUNCTION public.resolve_payment_link(_code TEXT)
RETURNS TABLE(
  id UUID, code TEXT, description TEXT, amount NUMERIC,
  methods JSONB, max_installments INTEGER,
  status public.payment_link_status, expires_at TIMESTAMPTZ,
  customer_name TEXT, store_name TEXT,
  mp_init_point TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pl.id, pl.code, pl.description, pl.amount,
         pl.methods, pl.max_installments,
         pl.status, pl.expires_at,
         c.name, s.name, pl.mp_init_point
  FROM public.payment_links pl
  LEFT JOIN public.customers c ON c.id = pl.customer_id
  JOIN public.stores s ON s.id = pl.store_id
  WHERE pl.code = _code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_payment_link(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_payment_link(TEXT) TO anon, authenticated;
