
-- ============================================================
-- 1. Enum de papéis
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'cashier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. stores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

INSERT INTO public.stores (id, name, code)
VALUES ('00000000-0000-0000-0000-000000000001', 'Loja Principal', 'PRINCIPAL')
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER stores_set_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. user_roles (papel + loja + login)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  login_email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, store_id)
);
CREATE INDEX IF NOT EXISTS user_roles_store_idx ON public.user_roles (store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Funções auxiliares (SECURITY DEFINER, evitam recursão RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin' AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_store(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND store_id = _store_id AND active
  );
$$;

CREATE OR REPLACE FUNCTION public.user_role_in_store(_user_id UUID, _store_id UUID)
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id AND store_id = _store_id AND active
  ORDER BY CASE role WHEN 'manager' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END
  LIMIT 1;
$$;

-- Regra reutilizável de leitura por loja para uma linha (store_id, operator_user_id)
CREATE OR REPLACE FUNCTION public.can_read_store_row(_store_id UUID, _operator_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), _store_id) = 'manager'
    OR (
      public.user_role_in_store(auth.uid(), _store_id) = 'cashier'
      AND _operator_user_id = auth.uid()
    );
$$;

-- ============================================================
-- 5. Login público por PIN — expõe só o mínimo necessário
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_login_stores()
RETURNS TABLE(id UUID, name TEXT, code TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, name, code FROM public.stores WHERE active ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION public.list_login_operators(_store_id UUID)
RETURNS TABLE(user_id UUID, display_name TEXT, role public.app_role, login_email TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT user_id, display_name, role, login_email
  FROM public.user_roles
  WHERE store_id = _store_id AND active AND login_email IS NOT NULL
  ORDER BY role, display_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_login_stores() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_login_operators(UUID) TO anon, authenticated;

-- ============================================================
-- 6. RLS de stores e user_roles
-- ============================================================
DROP POLICY IF EXISTS "Stores visible to all" ON public.stores;
CREATE POLICY "Stores visible to all"
  ON public.stores FOR SELECT
  USING (active OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage stores" ON public.stores;
CREATE POLICY "Admins manage stores"
  ON public.stores FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own role or admin all" ON public.user_roles;
CREATE POLICY "Users read own role or admin all"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 7. store_id / operator_user_id nas tabelas existentes
-- ============================================================
ALTER TABLE public.product_lots      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.stock_movements   ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.stock_movements   ADD COLUMN IF NOT EXISTS operator_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.cashier_sessions  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.cashier_sessions  ADD COLUMN IF NOT EXISTS operator_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.sales             ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.sales             ADD COLUMN IF NOT EXISTS operator_user_id UUID REFERENCES auth.users(id);

UPDATE public.product_lots      SET store_id='00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
UPDATE public.stock_movements   SET store_id='00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
UPDATE public.cashier_sessions  SET store_id='00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
UPDATE public.sales             SET store_id='00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;

ALTER TABLE public.product_lots      ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.stock_movements   ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.cashier_sessions  ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.sales             ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS product_lots_store_idx     ON public.product_lots (store_id);
CREATE INDEX IF NOT EXISTS stock_movements_store_idx  ON public.stock_movements (store_id);
CREATE INDEX IF NOT EXISTS cashier_sessions_store_idx ON public.cashier_sessions (store_id);
CREATE INDEX IF NOT EXISTS sales_store_idx            ON public.sales (store_id);

-- ============================================================
-- 8. Concede papel de admin ao usuário admin já existente
-- ============================================================
DO $$
DECLARE admin_uid UUID;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE email='admin@ksmultimake.local' LIMIT 1;
  IF admin_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, display_name, login_email)
    VALUES (admin_uid, 'admin', 'Administrador', 'admin@ksmultimake.local')
    ON CONFLICT (user_id, role, store_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- 9. Reescreve políticas de negócio por papel
-- ============================================================

-- ---- products (catálogo compartilhado) ----
DROP POLICY IF EXISTS "products readable by everyone" ON public.products;
DROP POLICY IF EXISTS "Products readable by all authenticated" ON public.products;
DROP POLICY IF EXISTS "products writable by authenticated admin" ON public.products;
DROP POLICY IF EXISTS "products updatable by authenticated admin" ON public.products;
DROP POLICY IF EXISTS "products deletable by authenticated admin" ON public.products;

CREATE POLICY "products readable by authenticated"
  ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products manageable by admin"
  ON public.products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---- customers (compartilhado) ----
DROP POLICY IF EXISTS "customers readable by everyone" ON public.customers;
DROP POLICY IF EXISTS "customers insertable by anyone" ON public.customers;
DROP POLICY IF EXISTS "customers updatable by anyone" ON public.customers;
DROP POLICY IF EXISTS "customers deletable by authenticated" ON public.customers;

CREATE POLICY "customers readable by authenticated"
  ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers insertable by authenticated"
  ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers updatable by authenticated"
  ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customers deletable by admin"
  ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ---- product_lots (por loja) ----
DROP POLICY IF EXISTS "lots readable by everyone" ON public.product_lots;
DROP POLICY IF EXISTS "lots insertable by authenticated admin" ON public.product_lots;
DROP POLICY IF EXISTS "lots updatable by authenticated admin" ON public.product_lots;
DROP POLICY IF EXISTS "lots deletable by authenticated admin" ON public.product_lots;
DROP POLICY IF EXISTS "lots qty decrement by anyone" ON public.product_lots;

CREATE POLICY "lots readable in own store"
  ON public.product_lots FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "lots insert by admin or manager"
  ON public.product_lots FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) = 'manager'
  );
CREATE POLICY "lots update in store (qty via sale)"
  ON public.product_lots FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "lots delete by admin or manager"
  ON public.product_lots FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) = 'manager'
  );

-- ---- stock_movements (por loja + operador) ----
DROP POLICY IF EXISTS "movements readable by everyone" ON public.stock_movements;
DROP POLICY IF EXISTS "movements insertable by anyone" ON public.stock_movements;
DROP POLICY IF EXISTS "movements updatable by authenticated admin" ON public.stock_movements;
DROP POLICY IF EXISTS "movements deletable by authenticated admin" ON public.stock_movements;

CREATE POLICY "movements readable by role"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (public.can_read_store_row(store_id, operator_user_id));
CREATE POLICY "movements insert in own store"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_store(auth.uid(), store_id)
    AND (operator_user_id IS NULL OR operator_user_id = auth.uid() OR public.is_admin(auth.uid()))
  );
CREATE POLICY "movements manage by admin or manager"
  ON public.stock_movements FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) = 'manager'
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) = 'manager'
  );
CREATE POLICY "movements delete by admin"
  ON public.stock_movements FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---- cashier_sessions ----
DROP POLICY IF EXISTS "sessions readable by everyone" ON public.cashier_sessions;
DROP POLICY IF EXISTS "sessions insertable by anyone" ON public.cashier_sessions;
DROP POLICY IF EXISTS "sessions updatable by anyone" ON public.cashier_sessions;
DROP POLICY IF EXISTS "sessions deletable by authenticated" ON public.cashier_sessions;

CREATE POLICY "sessions readable by role"
  ON public.cashier_sessions FOR SELECT TO authenticated
  USING (public.can_read_store_row(store_id, operator_user_id));
CREATE POLICY "sessions insert own"
  ON public.cashier_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_store(auth.uid(), store_id)
    AND (operator_user_id = auth.uid() OR public.is_admin(auth.uid()))
  );
CREATE POLICY "sessions update own or manage"
  ON public.cashier_sessions FOR UPDATE TO authenticated
  USING (public.can_read_store_row(store_id, operator_user_id))
  WITH CHECK (public.can_read_store_row(store_id, operator_user_id));
CREATE POLICY "sessions delete by admin"
  ON public.cashier_sessions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---- sales ----
DROP POLICY IF EXISTS "sales readable by everyone" ON public.sales;
DROP POLICY IF EXISTS "sales insertable by anyone" ON public.sales;

CREATE POLICY "sales readable by role"
  ON public.sales FOR SELECT TO authenticated
  USING (public.can_read_store_row(store_id, operator_user_id));
CREATE POLICY "sales insert own"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_store(auth.uid(), store_id)
    AND (operator_user_id = auth.uid() OR public.is_admin(auth.uid()))
  );
CREATE POLICY "sales manage by admin"
  ON public.sales FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "sales delete by admin"
  ON public.sales FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
