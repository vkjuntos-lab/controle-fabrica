-- Catálogo Mestre de Produtos.
--
-- O PRODUCT é o MODELO (sapatilha ballet clássica); a PRODUCT VARIANT é a
-- unidade comercial/operacional identificável por SKU (32/rosa, 32/preta...).
-- Nunca duplicar um Product inteiro porque mudou tamanho/cor — as variantes
-- absorvem tamanho, cor, código de barras, preços e peso.
--
-- Convenções deste domínio:
--   * tenant = organization_id (nunca store_id);
--   * sem exclusão física como comportamento padrão quando há referências;
--   * produto inativo continua disponível para histórico;
--   * NCM é texto (nunca identificador interno);
--   * `attributes` jsonb reserva espaço para campos futuros sem nova migration.

-- ============ ENUMS ============
CREATE TYPE public.product_status AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED', 'DRAFT');
CREATE TYPE public.product_variant_status AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED', 'DRAFT');

-- ============ CATEGORIES ============
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX product_categories_org_parent_idx
  ON public.product_categories (organization_id, parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  brand text,
  ncm text,
  status public.product_status NOT NULL DEFAULT 'DRAFT',
  main_image_url text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, code)
);
CREATE INDEX products_org_idx ON public.products (organization_id);
CREATE INDEX products_org_status_idx ON public.products (organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============ PRODUCT VARIANTS ============
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text NOT NULL,
  barcode text,
  size text,
  color text,
  cost_price numeric(14,2),
  sell_price numeric(14,2),
  weight_grams numeric(10,2),
  status public.product_variant_status NOT NULL DEFAULT 'ACTIVE',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, sku),
  UNIQUE (organization_id, barcode)
);
CREATE INDEX product_variants_org_product_idx
  ON public.product_variants (organization_id, product_id);
CREATE INDEX product_variants_org_status_idx
  ON public.product_variants (organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- ============ UPDATED_AT ============
CREATE TRIGGER product_categories_updated_at BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RLS POLICIES ============
-- Leitura: qualquer membro ativo da organização (catálogo é base para todos
-- os módulos: estoque, produção, marketplaces, comercial, custos, relatórios).
CREATE POLICY "members read product_categories" ON public.product_categories
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read products" ON public.products
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read product_variants" ON public.product_variants
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Escrita: papéis com a permissão products.manage (admin, gestor, estoque).
CREATE POLICY "products.manage insert product_categories" ON public.product_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'products.manage'));
CREATE POLICY "products.manage update product_categories" ON public.product_categories
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'products.manage'))
  WITH CHECK (public.has_permission(organization_id, 'products.manage'));
CREATE POLICY "products.manage delete product_categories" ON public.product_categories
  FOR DELETE TO authenticated
  USING (public.has_permission(organization_id, 'products.manage'));

CREATE POLICY "products.manage insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'products.manage'));
CREATE POLICY "products.manage update products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'products.manage'))
  WITH CHECK (public.has_permission(organization_id, 'products.manage'));
CREATE POLICY "products.manage delete products" ON public.products
  FOR DELETE TO authenticated
  USING (public.has_permission(organization_id, 'products.manage'));

CREATE POLICY "products.manage insert product_variants" ON public.product_variants
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'products.manage'));
CREATE POLICY "products.manage update product_variants" ON public.product_variants
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'products.manage'))
  WITH CHECK (public.has_permission(organization_id, 'products.manage'));
CREATE POLICY "products.manage delete product_variants" ON public.product_variants
  FOR DELETE TO authenticated
  USING (public.has_permission(organization_id, 'products.manage'));

-- ============ PERMISSION MATRIX ============
-- products.read: catálogo visível para todos os papéis.
-- products.manage: quem edita produtos, variantes e categorias.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','products.read'),('admin','products.manage'),
  ('gestor','products.read'),('gestor','products.manage'),
  ('estoque','products.read'),('estoque','products.manage'),
  ('producao','products.read'),
  ('comercial','products.read'),
  ('marketplace','products.read'),
  ('financeiro','products.read')
ON CONFLICT DO NOTHING;