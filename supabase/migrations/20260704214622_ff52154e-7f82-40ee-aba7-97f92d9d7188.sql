
-- Tabela de cobranças PIX
CREATE TABLE public.pix_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.cashier_sessions(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  operator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sale_code TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  cart_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_phone TEXT NOT NULL,
  mp_payment_id TEXT UNIQUE,
  mp_qr_code TEXT,
  mp_qr_code_base64 TEXT,
  mp_ticket_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','expired','cancelled','reminded','regenerated')),
  parent_charge_id UUID REFERENCES public.pix_charges(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  reminded_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pix_charges_store_status_idx ON public.pix_charges(store_id, status);
CREATE INDEX pix_charges_expires_idx ON public.pix_charges(expires_at) WHERE status = 'pending';
CREATE INDEX pix_charges_mp_payment_idx ON public.pix_charges(mp_payment_id);

GRANT SELECT, INSERT, UPDATE ON public.pix_charges TO authenticated;
GRANT ALL ON public.pix_charges TO service_role;

ALTER TABLE public.pix_charges ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo
CREATE POLICY "admin_all_pix" ON public.pix_charges
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Gerente vê tudo da loja
CREATE POLICY "manager_store_pix" ON public.pix_charges
  FOR SELECT TO authenticated
  USING (public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- Operador vê o próprio
CREATE POLICY "operator_own_pix" ON public.pix_charges
  FOR SELECT TO authenticated
  USING (operator_user_id = auth.uid());

-- Insert por operador autenticado da loja
CREATE POLICY "operator_insert_pix" ON public.pix_charges
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_store(auth.uid(), store_id)
    AND operator_user_id = auth.uid()
  );

-- Update por gerente/admin da loja (para cancelamentos manuais)
CREATE POLICY "manager_update_pix" ON public.pix_charges
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) = 'manager'
  );

CREATE TRIGGER pix_charges_updated_at
  BEFORE UPDATE ON public.pix_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
