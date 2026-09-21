-- ============================================================================
-- LOVABLE MASTER 004 — Matérias-primas, BOM/Ficha Técnica e Produção
--
-- Produção NÃO possui estoque paralelo. Toda movimentação física passa pelo
-- Inventory Ledger (inventory_post_movement): consumo de matéria-prima e
-- perdas são OUT; produto acabado é IN (PRODUCTION_OUTPUT). Nenhuma coluna de
-- saldo é criada aqui.
--
-- Cadeia: MATÉRIA-PRIMA -> LEDGER -> BOM -> ORDEM -> CONSUMO -> PERDAS ->
-- OUTPUT -> LEDGER -> PRODUTO ACABADO.
-- ============================================================================
BEGIN;

-- ============ ITEM DE ESTOQUE (conceito unificado) ============
-- Product/ProductVariant passa a carregar o papel do item. Não há segundo
-- sistema de estoque: matéria-prima, componente e embalagem são variantes
-- normais, movimentadas pelo mesmo ledger.
CREATE TYPE public.item_type AS ENUM (
  'FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'PACKAGING', 'SEMI_FINISHED_GOOD'
);
ALTER TABLE public.products
  ADD COLUMN item_type public.item_type NOT NULL DEFAULT 'FINISHED_GOOD';
CREATE INDEX products_org_item_type_idx ON public.products (organization_id, item_type);

-- ============ UNIDADES DE MEDIDA ============
CREATE TYPE public.unit_category AS ENUM ('COUNT', 'MASS', 'LENGTH', 'VOLUME', 'AREA', 'TIME', 'OTHER');
CREATE TYPE public.unit_status AS ENUM ('ACTIVE', 'INACTIVE');

-- organization_id NULL = unidade padrão do sistema (compartilhada).
CREATE TABLE public.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category public.unit_category NOT NULL DEFAULT 'COUNT',
  decimal_precision integer NOT NULL DEFAULT 0 CHECK (decimal_precision BETWEEN 0 AND 6),
  status public.unit_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX units_of_measure_global_code_idx ON public.units_of_measure (lower(code)) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX units_of_measure_org_code_idx ON public.units_of_measure (organization_id, lower(code)) WHERE organization_id IS NOT NULL;
CREATE TRIGGER units_of_measure_updated_at BEFORE UPDATE ON public.units_of_measure
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Conversões existem apenas dentro da mesma categoria (massa->massa, etc.).
CREATE TABLE public.unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_unit_id uuid NOT NULL REFERENCES public.units_of_measure(id) ON DELETE CASCADE,
  to_unit_id uuid NOT NULL REFERENCES public.units_of_measure(id) ON DELETE CASCADE,
  factor numeric(24,10) NOT NULL CHECK (factor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CHECK (from_unit_id <> to_unit_id),
  UNIQUE (organization_id, from_unit_id, to_unit_id)
);

-- Unidade padrão da variante: define a unidade do movimento no ledger.
ALTER TABLE public.product_variants
  ADD COLUMN unit_of_measure_id uuid REFERENCES public.units_of_measure(id);
CREATE INDEX product_variants_unit_idx ON public.product_variants (unit_of_measure_id);

-- Sementes globais.
INSERT INTO public.units_of_measure (organization_id, code, name, category, decimal_precision) VALUES
  (NULL, 'un', 'Unidade', 'COUNT', 0),
  (NULL, 'par', 'Par', 'COUNT', 0),
  (NULL, 'kg', 'Quilograma', 'MASS', 3),
  (NULL, 'g', 'Grama', 'MASS', 0),
  (NULL, 'm', 'Metro', 'LENGTH', 3),
  (NULL, 'cm', 'Centímetro', 'LENGTH', 2),
  (NULL, 'l', 'Litro', 'VOLUME', 3),
  (NULL, 'ml', 'Mililitro', 'VOLUME', 0),
  (NULL, 'rolo', 'Rolo', 'COUNT', 0),
  (NULL, 'caixa', 'Caixa', 'COUNT', 0);

INSERT INTO public.unit_conversions (organization_id, from_unit_id, to_unit_id, factor)
SELECT NULL, f.id, t.id, x.factor
FROM (VALUES ('kg','g',1000::numeric), ('m','cm',100), ('l','ml',1000)) AS x(fc, tc, factor)
JOIN public.units_of_measure f ON f.code = x.fc AND f.organization_id IS NULL
JOIN public.units_of_measure t ON t.code = x.tc AND t.organization_id IS NULL;

-- ============ ENUMS DE PRODUÇÃO ============
CREATE TYPE public.bom_status AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE public.production_order_status AS ENUM
  ('DRAFT', 'PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- ============ FICHA TÉCNICA / BOM (versionada) ============
CREATE TABLE public.bill_of_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  code text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status public.bom_status NOT NULL DEFAULT 'DRAFT',
  effective_from timestamptz,
  effective_to timestamptz,
  notes text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, code, version)
);
CREATE INDEX bill_of_materials_variant_idx ON public.bill_of_materials (organization_id, product_variant_id);
-- Apenas uma versão ACTIVE por variante.
CREATE UNIQUE INDEX bill_of_materials_one_active_idx
  ON public.bill_of_materials (organization_id, product_variant_id) WHERE status = 'ACTIVE';
CREATE TRIGGER bill_of_materials_updated_at BEFORE UPDATE ON public.bill_of_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bill_of_materials_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bom_id uuid NOT NULL REFERENCES public.bill_of_materials(id) ON DELETE CASCADE,
  component_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_of_measure_id uuid NOT NULL REFERENCES public.units_of_measure(id),
  scrap_percentage numeric(6,3) NOT NULL DEFAULT 0 CHECK (scrap_percentage >= 0 AND scrap_percentage < 100),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (bom_id, component_variant_id)
);
CREATE INDEX bill_of_materials_items_bom_idx ON public.bill_of_materials_items (bom_id, sort_order);
CREATE TRIGGER bill_of_materials_items_updated_at BEFORE UPDATE ON public.bill_of_materials_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ORDENS DE PRODUÇÃO ============
CREATE TABLE public.production_order_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0
);

CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  product_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  bom_id uuid REFERENCES public.bill_of_materials(id) ON DELETE SET NULL,
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  produced_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (produced_quantity >= 0),
  rejected_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  status public.production_order_status NOT NULL DEFAULT 'DRAFT',
  source_location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  destination_location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  released_at timestamptz,
  canceled_at timestamptz,
  notes text,
  cancel_reason text,
  approved_by uuid REFERENCES public.profiles(id),
  completed_by uuid REFERENCES public.profiles(id),
  canceled_by uuid REFERENCES public.profiles(id),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, idempotency_key),
  CHECK (destination_location_id <> source_location_id)
);
CREATE INDEX production_orders_status_idx ON public.production_orders (organization_id, status, created_at DESC);
CREATE INDEX production_orders_variant_idx ON public.production_orders (organization_id, product_variant_id);
CREATE TRIGGER production_orders_updated_at BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Snapshot da explosão da BOM no momento da criação da ordem. Alterações
-- posteriores na BOM não recalculam este histórico.
CREATE TABLE public.production_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  component_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  bom_item_id uuid REFERENCES public.bill_of_materials_items(id) ON DELETE SET NULL,
  bom_quantity_reference numeric(14,4) NOT NULL,
  scrap_percentage_reference numeric(6,3) NOT NULL DEFAULT 0,
  unit_of_measure_id uuid NOT NULL REFERENCES public.units_of_measure(id),
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_order_id, component_variant_id)
);
CREATE INDEX production_order_materials_order_idx ON public.production_order_materials (production_order_id, sort_order);
CREATE TRIGGER production_order_materials_updated_at BEFORE UPDATE ON public.production_order_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.production_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  from_status public.production_order_status,
  to_status public.production_order_status NOT NULL,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX production_order_status_history_order_idx ON public.production_order_status_history (production_order_id, changed_at);

-- ============ CONSUMO / OUTPUT / PERDAS ============
CREATE TABLE public.production_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  production_order_material_id uuid NOT NULL REFERENCES public.production_order_materials(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  batch_id uuid REFERENCES public.inventory_batches(id),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'un',
  inventory_movement_id uuid REFERENCES public.inventory_movements(id),
  notes text,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX production_consumptions_order_idx ON public.production_consumptions (production_order_id, occurred_at);

CREATE TABLE public.production_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  quantity_good numeric(14,4) NOT NULL DEFAULT 0 CHECK (quantity_good >= 0),
  quantity_rejected numeric(14,4) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  batch_id uuid REFERENCES public.inventory_batches(id),
  inventory_movement_id uuid REFERENCES public.inventory_movements(id),
  notes text,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CHECK (quantity_good > 0 OR quantity_rejected > 0),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX production_outputs_order_idx ON public.production_outputs (production_order_id, occurred_at);

CREATE TABLE public.production_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  status public.unit_status NOT NULL DEFAULT 'ACTIVE',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX production_loss_reasons_global_code_idx ON public.production_loss_reasons (lower(code)) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX production_loss_reasons_org_code_idx ON public.production_loss_reasons (organization_id, lower(code)) WHERE organization_id IS NOT NULL;

INSERT INTO public.production_loss_reasons (organization_id, code, label, sort_order) VALUES
  (NULL, 'CORTE', 'Corte', 1),
  (NULL, 'DEFEITO_MATERIAL', 'Defeito de material', 2),
  (NULL, 'ERRO_PRODUCAO', 'Erro de produção', 3),
  (NULL, 'DANO', 'Dano', 4),
  (NULL, 'QUALIDADE', 'Qualidade', 5),
  (NULL, 'OUTRO', 'Outro', 6);

CREATE TABLE public.production_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE CASCADE,
  loss_reason_id uuid REFERENCES public.production_loss_reasons(id),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  batch_id uuid REFERENCES public.inventory_batches(id),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'un',
  reason text NOT NULL,
  inventory_movement_id uuid REFERENCES public.inventory_movements(id),
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX production_losses_order_idx ON public.production_losses (production_order_id, occurred_at);

-- ============ GUARD DE TENANT DA PRODUÇÃO ============
CREATE FUNCTION public.production_guard_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_data jsonb := to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ['product_variant_id','product_variants'],['component_variant_id','product_variants'],
    ['variant_id','product_variants'],['location_id','inventory_locations'],
    ['source_location_id','inventory_locations'],['destination_location_id','inventory_locations'],
    ['bom_id','bill_of_materials'],['production_order_id','production_orders'],
    ['bom_item_id','bill_of_materials_items'],['inventory_movement_id','inventory_movements'],
    ['batch_id','inventory_batches'],['unit_of_measure_id','units_of_measure'],
    ['loss_reason_id','production_loss_reasons']]
  LOOP
    v_id := (v_data->>v_pair[1])::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
    -- unidades e motivos de perda podem ser globais (organization_id NULL)
    IF v_org IS NULL AND v_pair[2] IN ('units_of_measure','production_loss_reasons') THEN CONTINUE; END IF;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
  END LOOP;
  IF TG_OP='UPDATE' AND OLD.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['units_of_measure','unit_conversions','bill_of_materials','bill_of_materials_items',
    'production_orders','production_order_materials','production_order_status_history',
    'production_consumptions','production_outputs','production_loss_reasons','production_losses'] LOOP
    EXECUTE format('CREATE TRIGGER production_tenant_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.production_guard_relations()',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.production_guard_relations() FROM PUBLIC, anon, authenticated;

-- A unidade do movimento passa a ser a unidade padrão da variante (quando
-- houver); sem unidade definida, permanece 'un'. Demais regras inalteradas.
CREATE OR REPLACE FUNCTION public.inventory_guard_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before numeric; v_after numeric; v_negative boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Movimento consolidado não é editado nem excluído.'; END IF;
  PERFORM public.inventory_lock(NEW.organization_id);
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 OR NEW.quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Quantidade inválida.';
  END IF;
  IF NEW.unit <> 'un' AND NOT EXISTS (
    SELECT 1 FROM public.product_variants v JOIN public.units_of_measure u ON u.id = v.unit_of_measure_id
    WHERE v.id = NEW.variant_id AND v.organization_id = NEW.organization_id AND u.code = NEW.unit
  ) THEN
    RAISE EXCEPTION 'Unidade % não é a unidade padrão do item.', NEW.unit;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=NEW.variant_id AND organization_id=NEW.organization_id)
    OR NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=NEW.location_id AND organization_id=NEW.organization_id AND status='ACTIVE') THEN
    RAISE EXCEPTION 'Variante ou localização inválida nesta organização.';
  END IF;
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_batches
    WHERE id=NEW.batch_id AND organization_id=NEW.organization_id AND variant_id=NEW.variant_id) THEN
    RAISE EXCEPTION 'Lote não pertence à variante/organização.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_counts WHERE organization_id=NEW.organization_id
    AND location_id=NEW.location_id AND status IN ('DRAFT','IN_PROGRESS','REVIEW')
    AND NOT (coalesce(NEW.reference_type,'')='INVENTORY_COUNT' AND id=NEW.reference_id)) THEN
    RAISE EXCEPTION 'Localização em contagem: conclua ou cancele o inventário antes de movimentar.';
  END IF;
  IF NEW.status <> 'POSTED' THEN RAISE EXCEPTION 'Postagem exige status POSTED.'; END IF;
  SELECT coalesce(sum(on_hand),0) INTO v_before FROM public.inventory_balances
    WHERE organization_id=NEW.organization_id AND variant_id=NEW.variant_id
    AND location_id=NEW.location_id AND batch_id IS NOT DISTINCT FROM NEW.batch_id;
  v_after := v_before + CASE NEW.direction WHEN 'IN' THEN NEW.quantity ELSE -NEW.quantity END;
  SELECT coalesce((SELECT allow_negative_inventory FROM public.organization_inventory_settings
    WHERE organization_id=NEW.organization_id),false) INTO v_negative;
  IF NEW.direction='OUT' AND v_after < 0 AND NEW.movement_type <> 'REVERSAL' THEN
    IF NOT v_negative THEN RAISE EXCEPTION 'Saldo insuficiente nesta localização/lote. Saldo: %.', v_before; END IF;
    IF NOT public.has_permission(NEW.organization_id,'inventory.allow_negative') THEN
      RAISE EXCEPTION 'Sem permissão para gerar estoque negativo.';
    END IF;
  END IF;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES(NEW.organization_id,auth.uid(),CASE WHEN v_after<0 THEN 'inventory.negative_warning' ELSE 'inventory.ledger.post' END,
    'inventory_movements',NEW.id::text,jsonb_build_object('before',v_before,'after',v_after,
    'quantity',NEW.quantity,'direction',NEW.direction,'reason',NEW.reason,'variant_id',NEW.variant_id,
    'location_id',NEW.location_id,'batch_id',NEW.batch_id,'reference_id',NEW.reference_id,'unit',NEW.unit));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.inventory_guard_movement() FROM PUBLIC, anon, authenticated;

-- ============ RPCs — FICHAS TÉCNICAS ============
CREATE FUNCTION public.production_explode_bom(
  _organization_id uuid, _bom_id uuid, _quantity numeric, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bom public.bill_of_materials; v_items jsonb;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.bom.read', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para consultar fichas técnicas.';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
  SELECT * INTO v_bom FROM public.bill_of_materials WHERE id=_bom_id AND organization_id=_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica não encontrada nesta organização.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'bom_item_id', i.id,
      'component_variant_id', i.component_variant_id,
      'sku', v.sku,
      'product_name', coalesce(p.name,'—'),
      'unit_of_measure_id', i.unit_of_measure_id,
      'unit_code', u.code,
      'quantity', i.quantity,
      'scrap_percentage', i.scrap_percentage,
      'planned_quantity', round(_quantity * i.quantity * (1 + i.scrap_percentage/100.0), 4)
    ) ORDER BY i.sort_order, v.sku), '[]'::jsonb)
    INTO v_items
    FROM public.bill_of_materials_items i
    JOIN public.product_variants v ON v.id = i.component_variant_id
    LEFT JOIN public.products p ON p.id = v.product_id
    LEFT JOIN public.units_of_measure u ON u.id = i.unit_of_measure_id
    WHERE i.bom_id = _bom_id;
  RETURN jsonb_build_object(
    'bom_id', v_bom.id, 'bom_code', v_bom.code, 'bom_version', v_bom.version,
    'product_variant_id', v_bom.product_variant_id, 'quantity', _quantity, 'items', v_items);
END;
$$;

CREATE FUNCTION public.production_bom_save(
  _organization_id uuid, _bom_id uuid DEFAULT NULL, _product_variant_id uuid DEFAULT NULL,
  _code text DEFAULT NULL, _notes text DEFAULT NULL, _items jsonb DEFAULT '[]',
  _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_bom public.bill_of_materials; v_version integer; v_variant uuid;
  v_component uuid; v_uom uuid; v_qty numeric; v_scrap numeric; v_cuom uuid; v_order integer := 0;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF _bom_id IS NULL THEN
    IF NOT public.has_permission(_organization_id, 'production.bom.create', _user_id) THEN
      RAISE EXCEPTION 'Sem permissão para criar ficha técnica.';
    END IF;
    IF _product_variant_id IS NULL OR nullif(trim(_code),'') IS NULL THEN
      RAISE EXCEPTION 'Informe a variante e o código da ficha técnica.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=_product_variant_id AND organization_id=_organization_id) THEN
      RAISE EXCEPTION 'Variante não encontrada nesta organização.';
    END IF;
    SELECT coalesce(max(version),0)+1 INTO v_version FROM public.bill_of_materials
      WHERE organization_id=_organization_id AND product_variant_id=_product_variant_id AND lower(code)=lower(trim(_code));
    INSERT INTO public.bill_of_materials(organization_id, product_variant_id, code, version, status, notes, created_by, updated_by)
    VALUES (_organization_id, _product_variant_id, trim(_code), v_version, 'DRAFT', nullif(trim(_notes),''), _user_id, _user_id)
    RETURNING * INTO v_bom;
    INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
    VALUES (_organization_id,_user_id,'production.bom.create','bill_of_materials',v_bom.id::text,
      jsonb_build_object('code',v_bom.code,'version',v_bom.version,'product_variant_id',v_bom.product_variant_id));
  ELSE
    IF NOT public.has_permission(_organization_id, 'production.bom.update', _user_id) THEN
      RAISE EXCEPTION 'Sem permissão para editar ficha técnica.';
    END IF;
    SELECT * INTO v_bom FROM public.bill_of_materials WHERE id=_bom_id AND organization_id=_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica não encontrada nesta organização.'; END IF;
    IF v_bom.status <> 'DRAFT' THEN RAISE EXCEPTION 'Somente fichas em elaboração podem ser editadas.'; END IF;
    UPDATE public.bill_of_materials SET code=coalesce(nullif(trim(_code),''),code), notes=nullif(trim(_notes),''), updated_by=_user_id
      WHERE id=_bom_id RETURNING * INTO v_bom;
    INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
    VALUES (_organization_id,_user_id,'production.bom.update','bill_of_materials',v_bom.id::text,jsonb_build_object('code',v_bom.code));
    DELETE FROM public.bill_of_materials_items WHERE bom_id=_bom_id;
  END IF;

  v_variant := v_bom.product_variant_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) LOOP
    v_component := (v_item->>'component_variant_id')::uuid;
    v_uom := (v_item->>'unit_of_measure_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_scrap := coalesce((v_item->>'scrap_percentage')::numeric, 0);
    IF v_component IS NULL OR v_uom IS NULL THEN RAISE EXCEPTION 'Item de ficha incompleto.'; END IF;
    IF v_component = v_variant THEN RAISE EXCEPTION 'O item da ficha não pode ser o próprio produto.'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade do componente deve ser maior que zero.'; END IF;
    IF v_scrap < 0 OR v_scrap >= 100 THEN RAISE EXCEPTION 'Perda prevista deve estar entre 0 e 99,999%%.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=v_component AND organization_id=_organization_id) THEN
      RAISE EXCEPTION 'Componente fora da organização.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.units_of_measure WHERE id=v_uom AND (organization_id IS NULL OR organization_id=_organization_id)) THEN
      RAISE EXCEPTION 'Unidade de medida inválida.';
    END IF;
    SELECT unit_of_measure_id INTO v_cuom FROM public.product_variants WHERE id=v_component;
    IF v_cuom IS NOT NULL AND v_cuom <> v_uom THEN
      RAISE EXCEPTION 'A unidade do componente deve ser a unidade padrão do item.';
    END IF;
    INSERT INTO public.bill_of_materials_items(organization_id,bom_id,component_variant_id,quantity,unit_of_measure_id,scrap_percentage,notes,sort_order,created_by,updated_by)
    VALUES (_organization_id,v_bom.id,v_component,v_qty,v_uom,v_scrap,nullif(trim(v_item->>'notes'),''),v_order,_user_id,_user_id);
    v_order := v_order + 1;
  END LOOP;

  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.bom.items','bill_of_materials',v_bom.id::text,
    jsonb_build_object('items',jsonb_array_length(coalesce(_items,'[]'::jsonb))));
  RETURN to_jsonb(v_bom);
END;
$$;

CREATE FUNCTION public.production_bom_activate(
  _organization_id uuid, _bom_id uuid, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bom public.bill_of_materials; v_items integer;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.bom.approve', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar ficha técnica.';
  END IF;
  SELECT * INTO v_bom FROM public.bill_of_materials WHERE id=_bom_id AND organization_id=_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica não encontrada nesta organização.'; END IF;
  IF v_bom.status = 'ARCHIVED' THEN RAISE EXCEPTION 'Ficha arquivada não pode ser ativada.'; END IF;
  SELECT count(*) INTO v_items FROM public.bill_of_materials_items WHERE bom_id=_bom_id;
  IF v_items = 0 THEN RAISE EXCEPTION 'Ficha técnica sem componentes não pode ser ativada.'; END IF;
  UPDATE public.bill_of_materials SET status='INACTIVE', updated_by=_user_id
    WHERE organization_id=_organization_id AND product_variant_id=v_bom.product_variant_id AND status='ACTIVE' AND id<>_bom_id;
  UPDATE public.bill_of_materials SET status='ACTIVE', approved_at=now(), approved_by=_user_id, updated_by=_user_id
    WHERE id=_bom_id RETURNING * INTO v_bom;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.bom.activate','bill_of_materials',v_bom.id::text,
    jsonb_build_object('code',v_bom.code,'version',v_bom.version,'product_variant_id',v_bom.product_variant_id));
  RETURN to_jsonb(v_bom);
END;
$$;

CREATE FUNCTION public.production_bom_archive(
  _organization_id uuid, _bom_id uuid, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bom public.bill_of_materials;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.bom.update', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para arquivar ficha técnica.';
  END IF;
  UPDATE public.bill_of_materials SET status='ARCHIVED', updated_by=_user_id
    WHERE id=_bom_id AND organization_id=_organization_id AND status<>'ARCHIVED' RETURNING * INTO v_bom;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica não encontrada ou já arquivada.'; END IF;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.bom.archive','bill_of_materials',v_bom.id::text,jsonb_build_object('code',v_bom.code));
  RETURN to_jsonb(v_bom);
END;
$$;

CREATE FUNCTION public.production_bom_duplicate(
  _organization_id uuid, _bom_id uuid, _target_variant_id uuid,
  _code text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src public.bill_of_materials; v_bom public.bill_of_materials; v_code text; v_version integer;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.bom.create', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para duplicar ficha técnica.';
  END IF;
  SELECT * INTO v_src FROM public.bill_of_materials WHERE id=_bom_id AND organization_id=_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica de origem não encontrada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=_target_variant_id AND organization_id=_organization_id) THEN
    RAISE EXCEPTION 'Variante de destino não encontrada nesta organização.';
  END IF;
  v_code := coalesce(nullif(trim(_code),''), v_src.code);
  SELECT coalesce(max(version),0)+1 INTO v_version FROM public.bill_of_materials
    WHERE organization_id=_organization_id AND product_variant_id=_target_variant_id AND lower(code)=lower(v_code);
  INSERT INTO public.bill_of_materials(organization_id,product_variant_id,code,version,status,notes,created_by,updated_by)
  VALUES (_organization_id,_target_variant_id,v_code,v_version,'DRAFT',v_src.notes,_user_id,_user_id)
  RETURNING * INTO v_bom;
  INSERT INTO public.bill_of_materials_items(organization_id,bom_id,component_variant_id,quantity,unit_of_measure_id,scrap_percentage,notes,sort_order,created_by,updated_by)
  SELECT _organization_id, v_bom.id, i.component_variant_id, i.quantity, i.unit_of_measure_id, i.scrap_percentage, i.notes, i.sort_order, _user_id, _user_id
  FROM public.bill_of_materials_items i WHERE i.bom_id=_bom_id;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.bom.duplicate','bill_of_materials',v_bom.id::text,
    jsonb_build_object('source_bom_id',_bom_id,'target_variant_id',_target_variant_id,'code',v_bom.code,'version',v_bom.version));
  RETURN to_jsonb(v_bom);
END;
$$;

CREATE FUNCTION public.production_bom_delete(
  _organization_id uuid, _bom_id uuid, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bom public.bill_of_materials;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.bom.update', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para excluir ficha técnica.';
  END IF;
  SELECT * INTO v_bom FROM public.bill_of_materials WHERE id=_bom_id AND organization_id=_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica não encontrada.'; END IF;
  IF v_bom.status <> 'DRAFT' THEN RAISE EXCEPTION 'Somente fichas em elaboração podem ser excluídas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.production_orders WHERE bom_id=_bom_id) THEN
    RAISE EXCEPTION 'Ficha já utilizada por ordem de produção: arquive em vez de excluir.';
  END IF;
  DELETE FROM public.bill_of_materials WHERE id=_bom_id;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.bom.delete','bill_of_materials',_bom_id::text,jsonb_build_object('code',v_bom.code));
  RETURN jsonb_build_object('deleted', true);
END;
$$;

-- ============ RPCs — ORDENS DE PRODUÇÃO ============
CREATE FUNCTION public.production_next_order_code(_organization_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_number bigint;
BEGIN
  INSERT INTO public.production_order_counters(organization_id,last_number) VALUES (_organization_id,1)
  ON CONFLICT (organization_id) DO UPDATE SET last_number = public.production_order_counters.last_number + 1
  RETURNING last_number INTO v_number;
  RETURN 'OP-' || to_char(now(),'YYYY') || '-' || lpad(v_number::text, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.production_next_order_code(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.production_create_order(
  _organization_id uuid, _product_variant_id uuid, _planned_quantity numeric,
  _source_location_id uuid, _destination_location_id uuid,
  _bom_id uuid DEFAULT NULL, _planned_start_at timestamptz DEFAULT NULL, _planned_end_at timestamptz DEFAULT NULL,
  _notes text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.production_orders; v_bom public.bill_of_materials;
  v_existing public.production_orders; v_items jsonb;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.order.create', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para criar ordem de produção.';
  END IF;
  IF _planned_quantity IS NULL OR _planned_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade planejada deve ser maior que zero.'; END IF;
  IF _source_location_id = _destination_location_id THEN RAISE EXCEPTION 'Origem e destino devem ser diferentes.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=_product_variant_id AND organization_id=_organization_id) THEN
    RAISE EXCEPTION 'Variante do produto não encontrada nesta organização.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=_source_location_id AND organization_id=_organization_id AND status='ACTIVE')
    OR NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=_destination_location_id AND organization_id=_organization_id AND status='ACTIVE') THEN
    RAISE EXCEPTION 'Localização de origem/destino inválida ou inativa.';
  END IF;

  -- Idempotência de criação.
  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.production_orders
      WHERE organization_id=_organization_id AND idempotency_key=_idempotency_key;
    IF FOUND THEN
      IF v_existing.product_variant_id<>_product_variant_id OR v_existing.planned_quantity<>_planned_quantity
         OR v_existing.source_location_id<>_source_location_id OR v_existing.destination_location_id<>_destination_location_id THEN
        RAISE EXCEPTION 'Chave de idempotência já usada com outro conteúdo.';
      END IF;
      RETURN jsonb_build_object('deduped', true, 'order', to_jsonb(v_existing));
    END IF;
  END IF;

  IF _bom_id IS NOT NULL THEN
    SELECT * INTO v_bom FROM public.bill_of_materials WHERE id=_bom_id AND organization_id=_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha técnica não encontrada nesta organização.'; END IF;
    IF v_bom.product_variant_id <> _product_variant_id THEN RAISE EXCEPTION 'Ficha técnica não pertence ao produto da ordem.'; END IF;
  END IF;

  INSERT INTO public.production_orders(
    organization_id, code, product_variant_id, bom_id, planned_quantity, status,
    source_location_id, destination_location_id, planned_start_at, planned_end_at,
    notes, idempotency_key, created_by, updated_by)
  VALUES (
    _organization_id, public.production_next_order_code(_organization_id), _product_variant_id, _bom_id,
    _planned_quantity, 'DRAFT', _source_location_id, _destination_location_id,
    _planned_start_at, _planned_end_at, nullif(trim(_notes),''), _idempotency_key, _user_id, _user_id)
  RETURNING * INTO v_order;

  -- Snapshot da explosão: preserva o histórico mesmo com BOM alterada depois.
  IF _bom_id IS NOT NULL THEN
    INSERT INTO public.production_order_materials(
      organization_id, production_order_id, component_variant_id, bom_item_id,
      bom_quantity_reference, scrap_percentage_reference, unit_of_measure_id, planned_quantity, sort_order)
    SELECT _organization_id, v_order.id, i.component_variant_id, i.id,
      i.quantity, i.scrap_percentage, i.unit_of_measure_id,
      round(_planned_quantity * i.quantity * (1 + i.scrap_percentage/100.0), 4), i.sort_order
    FROM public.bill_of_materials_items i WHERE i.bom_id=_bom_id
    ORDER BY i.sort_order;
  END IF;

  INSERT INTO public.production_order_status_history(organization_id,production_order_id,from_status,to_status,note,changed_by)
  VALUES (_organization_id, v_order.id, NULL, 'DRAFT', nullif(trim(_notes),''), _user_id);
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.order.create','production_orders',v_order.id::text,
    jsonb_build_object('code',v_order.code,'product_variant_id',_product_variant_id,'planned_quantity',_planned_quantity,'bom_id',_bom_id));
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.sort_order),'[]'::jsonb) INTO v_items
    FROM public.production_order_materials m WHERE m.production_order_id=v_order.id;
  RETURN jsonb_build_object('deduped', false, 'order', to_jsonb(v_order), 'materials', v_items);
END;
$$;

CREATE FUNCTION public.production_release_order(
  _organization_id uuid, _order_id uuid, _note text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.production_orders; v_missing numeric; v_items integer; v_from public.production_order_status;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.order.release', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para liberar ordem de produção.';
  END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status NOT IN ('DRAFT','PLANNED') THEN RAISE EXCEPTION 'Somente ordens em elaboração/planejada podem ser liberadas.'; END IF;
  v_from := v_order.status;
  IF NOT EXISTS (SELECT 1 FROM public.production_order_materials WHERE production_order_id=_order_id) THEN
    RAISE EXCEPTION 'Ordem sem materiais: informe uma ficha técnica com componentes antes de liberar.';
  END IF;
  -- Disponibilidade é informativa; o bloqueio real ocorre no consumo (ledger).
  SELECT count(*) INTO v_items FROM public.production_order_materials m
    WHERE m.production_order_id=_order_id AND m.planned_quantity > coalesce((
      SELECT sum(b.on_hand) FROM public.inventory_balances b
      WHERE b.organization_id=_organization_id AND b.variant_id=m.component_variant_id
        AND b.location_id=v_order.source_location_id),0);
  UPDATE public.production_orders SET status='RELEASED', released_at=now(), approved_by=_user_id, updated_by=_user_id
    WHERE id=_order_id RETURNING * INTO v_order;
  INSERT INTO public.production_order_status_history(organization_id,production_order_id,from_status,to_status,note,changed_by)
  VALUES (_organization_id,_order_id,v_from,'RELEASED',nullif(trim(_note),''),_user_id);
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.order.release','production_orders',_order_id::text,
    jsonb_build_object('code',v_order.code,'materials_missing',v_items));
  RETURN jsonb_build_object('order', to_jsonb(v_order), 'materials_missing', v_items);
END;
$$;

CREATE FUNCTION public.production_start_order(
  _organization_id uuid, _order_id uuid, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.production_orders;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.order.start', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para iniciar ordem de produção.';
  END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status <> 'RELEASED' THEN RAISE EXCEPTION 'Somente ordens liberadas podem ser iniciadas.'; END IF;
  UPDATE public.production_orders SET status='IN_PROGRESS', started_at=now(), updated_by=_user_id
    WHERE id=_order_id RETURNING * INTO v_order;
  INSERT INTO public.production_order_status_history(organization_id,production_order_id,from_status,to_status,changed_by)
  VALUES (_organization_id,_order_id,'RELEASED','IN_PROGRESS',_user_id);
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.order.start','production_orders',_order_id::text,jsonb_build_object('code',v_order.code));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.production_record_consumption(
  _organization_id uuid, _order_id uuid, _order_material_id uuid, _quantity numeric,
  _location_id uuid DEFAULT NULL, _batch_id uuid DEFAULT NULL, _occurred_at timestamptz DEFAULT now(),
  _notes text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.production_orders; v_material public.production_order_materials;
  v_existing public.production_consumptions; v_unit text; v_movement jsonb; v_row public.production_consumptions;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.consume', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar consumo.';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade consumida deve ser maior que zero.'; END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Consumo só é permitido em ordem em andamento.'; END IF;
  SELECT * INTO v_material FROM public.production_order_materials WHERE id=_order_material_id AND production_order_id=_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material não pertence à ordem.'; END IF;
  IF _location_id IS NULL THEN _location_id := v_order.source_location_id; END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.production_consumptions
      WHERE organization_id=_organization_id AND idempotency_key=_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('deduped', true, 'consumption', to_jsonb(v_existing)); END IF;
  END IF;

  SELECT coalesce(u.code,'un') INTO v_unit FROM public.product_variants v
    LEFT JOIN public.units_of_measure u ON u.id=v.unit_of_measure_id
    WHERE v.id=v_material.component_variant_id;

  v_movement := public.inventory_post_movement(
    _organization_id, v_material.component_variant_id, _location_id, 'PRODUCTION_CONSUMPTION', _quantity,
    coalesce(nullif(trim(_notes),''),'Consumo de produção '||v_order.code), _occurred_at, v_unit,
    'PRODUCTION_ORDER', _order_id, _batch_id,
    CASE WHEN _idempotency_key IS NULL THEN NULL ELSE 'consume:'||_idempotency_key END,
    NULL, _user_id, false);

  INSERT INTO public.production_consumptions(organization_id,production_order_id,production_order_material_id,
    variant_id,location_id,batch_id,quantity,unit,inventory_movement_id,notes,idempotency_key,occurred_at,created_by)
  VALUES (_organization_id,_order_id,_order_material_id,v_material.component_variant_id,_location_id,_batch_id,
    _quantity,v_unit,(v_movement->>'movement_id')::uuid,nullif(trim(_notes),''),_idempotency_key,_occurred_at,_user_id)
  RETURNING * INTO v_row;

  UPDATE public.production_order_materials SET actual_quantity = actual_quantity + _quantity
    WHERE id=_order_material_id;

  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.consume','production_consumptions',v_row.id::text,
    jsonb_build_object('order',v_order.code,'variant_id',v_material.component_variant_id,'quantity',_quantity,
      'unit',v_unit,'location_id',_location_id,'batch_id',_batch_id));
  RETURN jsonb_build_object('deduped', false, 'consumption', to_jsonb(v_row), 'movement', v_movement);
END;
$$;

CREATE FUNCTION public.production_record_loss(
  _organization_id uuid, _order_id uuid, _variant_id uuid, _quantity numeric, _reason text,
  _loss_reason_id uuid DEFAULT NULL, _location_id uuid DEFAULT NULL, _batch_id uuid DEFAULT NULL,
  _occurred_at timestamptz DEFAULT now(), _idempotency_key text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.production_orders; v_existing public.production_losses;
  v_unit text; v_movement jsonb; v_row public.production_losses;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.loss', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar perda.';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade da perda deve ser maior que zero.'; END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo da perda é obrigatório.'; END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status NOT IN ('RELEASED','IN_PROGRESS') THEN RAISE EXCEPTION 'Perda só é permitida em ordem liberada/em andamento.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=_variant_id AND organization_id=_organization_id) THEN
    RAISE EXCEPTION 'Item da perda não encontrado nesta organização.';
  END IF;
  IF _location_id IS NULL THEN _location_id := v_order.source_location_id; END IF;
  IF _loss_reason_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.production_loss_reasons
      WHERE id=_loss_reason_id AND (organization_id IS NULL OR organization_id=_organization_id)) THEN
    RAISE EXCEPTION 'Motivo de perda inválido.';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.production_losses
      WHERE organization_id=_organization_id AND idempotency_key=_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('deduped', true, 'loss', to_jsonb(v_existing)); END IF;
  END IF;

  SELECT coalesce(u.code,'un') INTO v_unit FROM public.product_variants v
    LEFT JOIN public.units_of_measure u ON u.id=v.unit_of_measure_id WHERE v.id=_variant_id;

  v_movement := public.inventory_post_movement(
    _organization_id, _variant_id, _location_id, 'LOSS', _quantity, trim(_reason), _occurred_at, v_unit,
    'PRODUCTION_ORDER', _order_id, _batch_id,
    CASE WHEN _idempotency_key IS NULL THEN NULL ELSE 'loss:'||_idempotency_key END, NULL, _user_id, false);

  INSERT INTO public.production_losses(organization_id,production_order_id,loss_reason_id,variant_id,location_id,
    batch_id,quantity,unit,reason,inventory_movement_id,idempotency_key,occurred_at,created_by)
  VALUES (_organization_id,_order_id,_loss_reason_id,_variant_id,_location_id,_batch_id,_quantity,v_unit,
    trim(_reason),(v_movement->>'movement_id')::uuid,_idempotency_key,_occurred_at,_user_id)
  RETURNING * INTO v_row;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.loss','production_losses',v_row.id::text,
    jsonb_build_object('order',v_order.code,'variant_id',_variant_id,'quantity',_quantity,'reason',trim(_reason)));
  RETURN jsonb_build_object('deduped', false, 'loss', to_jsonb(v_row), 'movement', v_movement);
END;
$$;

CREATE FUNCTION public.production_record_output(
  _organization_id uuid, _order_id uuid, _quantity_good numeric, _quantity_rejected numeric DEFAULT 0,
  _location_id uuid DEFAULT NULL, _batch_id uuid DEFAULT NULL, _occurred_at timestamptz DEFAULT now(),
  _notes text DEFAULT NULL, _idempotency_key text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.production_orders; v_existing public.production_outputs;
  v_unit text; v_movement jsonb := NULL; v_row public.production_outputs;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.output', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para registrar produção.';
  END IF;
  IF coalesce(_quantity_good,0) < 0 OR coalesce(_quantity_rejected,0) < 0 THEN RAISE EXCEPTION 'Quantidades não podem ser negativas.'; END IF;
  IF coalesce(_quantity_good,0) = 0 AND coalesce(_quantity_rejected,0) = 0 THEN RAISE EXCEPTION 'Informe a quantidade produzida.'; END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Apontamento só é permitido em ordem em andamento.'; END IF;
  IF _location_id IS NULL THEN _location_id := v_order.destination_location_id; END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.production_outputs
      WHERE organization_id=_organization_id AND idempotency_key=_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('deduped', true, 'output', to_jsonb(v_existing)); END IF;
  END IF;

  -- Só o produto BOM entra no estoque; rejeitados não viram saldo vendável.
  IF coalesce(_quantity_good,0) > 0 THEN
    SELECT coalesce(u.code,'un') INTO v_unit FROM public.product_variants v
      LEFT JOIN public.units_of_measure u ON u.id=v.unit_of_measure_id WHERE v.id=v_order.product_variant_id;
    v_movement := public.inventory_post_movement(
      _organization_id, v_order.product_variant_id, _location_id, 'PRODUCTION_OUTPUT', _quantity_good,
      'Produção '||v_order.code, _occurred_at, v_unit, 'PRODUCTION_ORDER', _order_id, _batch_id,
      CASE WHEN _idempotency_key IS NULL THEN NULL ELSE 'output:'||_idempotency_key END, NULL, _user_id, false);
  END IF;

  INSERT INTO public.production_outputs(organization_id,production_order_id,quantity_good,quantity_rejected,
    location_id,batch_id,inventory_movement_id,notes,idempotency_key,occurred_at,created_by)
  VALUES (_organization_id,_order_id,coalesce(_quantity_good,0),coalesce(_quantity_rejected,0),_location_id,_batch_id,
    CASE WHEN v_movement IS NULL THEN NULL ELSE (v_movement->>'movement_id')::uuid END,
    nullif(trim(_notes),''),_idempotency_key,_occurred_at,_user_id)
  RETURNING * INTO v_row;

  UPDATE public.production_orders
    SET produced_quantity = produced_quantity + coalesce(_quantity_good,0),
        rejected_quantity = rejected_quantity + coalesce(_quantity_rejected,0), updated_by=_user_id
    WHERE id=_order_id;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.output','production_outputs',v_row.id::text,
    jsonb_build_object('order',v_order.code,'quantity_good',coalesce(_quantity_good,0),
      'quantity_rejected',coalesce(_quantity_rejected,0),'location_id',_location_id,'batch_id',_batch_id));
  RETURN jsonb_build_object('deduped', false, 'output', to_jsonb(v_row), 'movement', v_movement);
END;
$$;

CREATE FUNCTION public.production_complete_order(
  _organization_id uuid, _order_id uuid, _note text DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.production_orders;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.complete', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para concluir ordem de produção.';
  END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Somente ordens em andamento podem ser concluídas.'; END IF;
  IF v_order.produced_quantity <= 0 THEN RAISE EXCEPTION 'Registre a produção antes de concluir a ordem.'; END IF;
  UPDATE public.production_orders SET status='COMPLETED', completed_at=now(), completed_by=_user_id, updated_by=_user_id
    WHERE id=_order_id RETURNING * INTO v_order;
  INSERT INTO public.production_order_status_history(organization_id,production_order_id,from_status,to_status,note,changed_by)
  VALUES (_organization_id,_order_id,'IN_PROGRESS','COMPLETED',nullif(trim(_note),''),_user_id);
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.order.complete','production_orders',_order_id::text,
    jsonb_build_object('code',v_order.code,'produced_quantity',v_order.produced_quantity,'rejected_quantity',v_order.rejected_quantity));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.production_cancel_order(
  _organization_id uuid, _order_id uuid, _reason text, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.production_orders; v_from public.production_order_status;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido para esta operação.'; END IF;
  IF NOT public.has_permission(_organization_id, 'production.cancel', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar ordem de produção.';
  END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo do cancelamento é obrigatório.'; END IF;
  SELECT * INTO v_order FROM public.production_orders WHERE id=_order_id AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de produção não encontrada.'; END IF;
  IF v_order.status = 'COMPLETED' THEN RAISE EXCEPTION 'Ordem concluída não pode ser cancelada; corrija por reversão no ledger.'; END IF;
  IF v_order.status = 'CANCELED' THEN RETURN jsonb_build_object('deduped', true, 'order', to_jsonb(v_order)); END IF;
  IF EXISTS (SELECT 1 FROM public.production_consumptions WHERE production_order_id=_order_id)
    OR EXISTS (SELECT 1 FROM public.production_outputs WHERE production_order_id=_order_id)
    OR EXISTS (SELECT 1 FROM public.production_losses WHERE production_order_id=_order_id) THEN
    RAISE EXCEPTION 'Ordem com movimentações não pode ser apagada: reverta os movimentos no ledger antes.';
  END IF;
  UPDATE public.production_orders SET status='CANCELED', canceled_at=now(), canceled_by=_user_id,
    cancel_reason=trim(_reason), updated_by=_user_id WHERE id=_order_id RETURNING * INTO v_order;
  INSERT INTO public.production_order_status_history(organization_id,production_order_id,from_status,to_status,note,changed_by)
  VALUES (_organization_id,_order_id,v_order.status,'CANCELED',trim(_reason),_user_id);
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES (_organization_id,_user_id,'production.order.cancel','production_orders',_order_id::text,
    jsonb_build_object('code',v_order.code,'reason',trim(_reason)));
  RETURN to_jsonb(v_order);
END;
$$;

-- ============ RPC — DASHBOARD DE PRODUÇÃO ============
CREATE FUNCTION public.production_dashboard(
  _organization_id uuid, _from timestamptz, _to timestamptz, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() OR NOT public.has_permission(_organization_id,'production.read',_user_id) THEN
    RAISE EXCEPTION 'Sem permissão para consultar produção.';
  END IF;
  RETURN jsonb_build_object(
    'open_orders', (SELECT count(*) FROM public.production_orders WHERE organization_id=_organization_id
      AND status IN ('DRAFT','PLANNED','RELEASED','IN_PROGRESS')),
    'in_progress_orders', (SELECT count(*) FROM public.production_orders WHERE organization_id=_organization_id AND status='IN_PROGRESS'),
    'late_orders', (SELECT count(*) FROM public.production_orders WHERE organization_id=_organization_id
      AND status IN ('DRAFT','PLANNED','RELEASED','IN_PROGRESS') AND planned_end_at IS NOT NULL AND planned_end_at < now()),
    'produced_quantity', (SELECT coalesce(sum(quantity_good),0) FROM public.production_outputs
      WHERE organization_id=_organization_id AND occurred_at>=_from AND occurred_at<_to),
    'rejected_quantity', (SELECT coalesce(sum(quantity_rejected),0) FROM public.production_outputs
      WHERE organization_id=_organization_id AND occurred_at>=_from AND occurred_at<_to),
    'lost_quantity', (SELECT coalesce(sum(quantity),0) FROM public.production_losses
      WHERE organization_id=_organization_id AND occurred_at>=_from AND occurred_at<_to),
    'orders_in_period', (SELECT count(*) FROM public.production_orders WHERE organization_id=_organization_id
      AND created_at>=_from AND created_at<_to),
    'materials_below_minimum', (SELECT count(*) FROM public.product_variants v
      JOIN public.products p ON p.id=v.product_id
      WHERE v.organization_id=_organization_id AND p.item_type IN ('RAW_MATERIAL','COMPONENT','PACKAGING','SEMI_FINISHED_GOOD')
      AND v.minimum_stock > 0 AND coalesce((SELECT sum(b.on_hand) FROM public.inventory_balances b
        WHERE b.organization_id=_organization_id AND b.variant_id=v.id),0) < v.minimum_stock)
  );
END;
$$;

-- ============ RLS + GRANTS ============
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_of_materials_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_losses ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.units_of_measure, public.unit_conversions, public.bill_of_materials,
  public.bill_of_materials_items, public.production_orders, public.production_order_materials,
  public.production_order_status_history, public.production_consumptions, public.production_outputs,
  public.production_loss_reasons, public.production_losses TO authenticated;
GRANT ALL ON public.units_of_measure, public.unit_conversions, public.bill_of_materials,
  public.bill_of_materials_items, public.production_orders, public.production_order_materials,
  public.production_order_status_history, public.production_consumptions, public.production_outputs,
  public.production_loss_reasons, public.production_losses TO service_role;

-- Leitura por permissão; escrita apenas pelas RPCs SECURITY DEFINER (auditadas).
CREATE POLICY "members read units_of_measure" ON public.units_of_measure FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));
CREATE POLICY "members read unit_conversions" ON public.unit_conversions FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));
CREATE POLICY "members read production_loss_reasons" ON public.production_loss_reasons FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));
DO $$ DECLARE t text; p text; BEGIN
  FOREACH t IN ARRAY ARRAY['bill_of_materials','bill_of_materials_items'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(organization_id,%L))','members read '||t,t,'production.bom.read');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['production_orders','production_order_materials','production_order_status_history',
    'production_consumptions','production_outputs','production_losses'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(organization_id,%L))','members read '||t,t,'production.read');
  END LOOP;
END $$;

-- ============ PERMISSÕES ============
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','production.read'),('gestor','production.read'),('estoque','production.read'),
  ('producao','production.read'),('financeiro','production.read'),('comercial','production.read'),('marketplace','production.read'),
  ('admin','production.materials.read'),('gestor','production.materials.read'),('estoque','production.materials.read'),
  ('producao','production.materials.read'),('financeiro','production.materials.read'),
  ('comercial','production.materials.read'),('marketplace','production.materials.read'),
  ('admin','production.bom.read'),('gestor','production.bom.read'),('estoque','production.bom.read'),
  ('producao','production.bom.read'),('financeiro','production.bom.read'),('comercial','production.bom.read'),
  ('marketplace','production.bom.read'),
  -- Gestão de ficha técnica (criar/editar para quem fabrica; aprovar é gerencial).
  ('admin','production.bom.create'),('gestor','production.bom.create'),('estoque','production.bom.create'),
  ('producao','production.bom.create'),
  ('admin','production.bom.update'),('gestor','production.bom.update'),('estoque','production.bom.update'),
  ('producao','production.bom.update'),
  ('admin','production.bom.approve'),('gestor','production.bom.approve'),
  -- Ordens de produção.
  ('admin','production.order.create'),('gestor','production.order.create'),('estoque','production.order.create'),
  ('producao','production.order.create'),
  ('admin','production.order.update'),('gestor','production.order.update'),('estoque','production.order.update'),
  ('producao','production.order.update'),
  ('admin','production.order.release'),('gestor','production.order.release'),('estoque','production.order.release'),
  ('producao','production.order.release'),
  ('admin','production.order.start'),('gestor','production.order.start'),('estoque','production.order.start'),
  ('producao','production.order.start'),
  ('admin','production.consume'),('gestor','production.consume'),('estoque','production.consume'),('producao','production.consume'),
  ('admin','production.output'),('gestor','production.output'),('estoque','production.output'),('producao','production.output'),
  ('admin','production.loss'),('gestor','production.loss'),('estoque','production.loss'),('producao','production.loss'),
  ('admin','production.complete'),('gestor','production.complete'),('estoque','production.complete'),('producao','production.complete'),
  ('admin','production.cancel'),('gestor','production.cancel'),('estoque','production.cancel'),('producao','production.cancel')
ON CONFLICT DO NOTHING;

-- Consumo/output passam pelo ledger, que exige inventory.move; o papel Produção
-- precisa dessa permissão para registrar a movimentação física.
INSERT INTO public.role_permissions (role, permission) VALUES ('producao','inventory.move')
ON CONFLICT DO NOTHING;

-- ============ GRANTS DAS RPCs ============
REVOKE ALL ON FUNCTION
  public.production_explode_bom(uuid,uuid,numeric,uuid),
  public.production_bom_save(uuid,uuid,uuid,text,text,jsonb,uuid),
  public.production_bom_activate(uuid,uuid,uuid),
  public.production_bom_archive(uuid,uuid,uuid),
  public.production_bom_duplicate(uuid,uuid,uuid,text,uuid),
  public.production_bom_delete(uuid,uuid,uuid),
  public.production_create_order(uuid,uuid,numeric,uuid,uuid,uuid,timestamptz,timestamptz,text,text,uuid),
  public.production_release_order(uuid,uuid,text,uuid),
  public.production_start_order(uuid,uuid,uuid),
  public.production_record_consumption(uuid,uuid,uuid,numeric,uuid,uuid,timestamptz,text,text,uuid),
  public.production_record_loss(uuid,uuid,uuid,numeric,text,uuid,uuid,uuid,timestamptz,text,uuid),
  public.production_record_output(uuid,uuid,numeric,numeric,uuid,uuid,timestamptz,text,text,uuid),
  public.production_complete_order(uuid,uuid,text,uuid),
  public.production_cancel_order(uuid,uuid,text,uuid),
  public.production_dashboard(uuid,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.production_explode_bom(uuid,uuid,numeric,uuid),
  public.production_bom_save(uuid,uuid,uuid,text,text,jsonb,uuid),
  public.production_bom_activate(uuid,uuid,uuid),
  public.production_bom_archive(uuid,uuid,uuid),
  public.production_bom_duplicate(uuid,uuid,uuid,text,uuid),
  public.production_bom_delete(uuid,uuid,uuid),
  public.production_create_order(uuid,uuid,numeric,uuid,uuid,uuid,timestamptz,timestamptz,text,text,uuid),
  public.production_release_order(uuid,uuid,text,uuid),
  public.production_start_order(uuid,uuid,uuid),
  public.production_record_consumption(uuid,uuid,uuid,numeric,uuid,uuid,timestamptz,text,text,uuid),
  public.production_record_loss(uuid,uuid,uuid,numeric,text,uuid,uuid,uuid,timestamptz,text,uuid),
  public.production_record_output(uuid,uuid,numeric,numeric,uuid,uuid,timestamptz,text,text,uuid),
  public.production_complete_order(uuid,uuid,text,uuid),
  public.production_cancel_order(uuid,uuid,text,uuid),
  public.production_dashboard(uuid,timestamptz,timestamptz,uuid)
  TO authenticated;

COMMIT;
