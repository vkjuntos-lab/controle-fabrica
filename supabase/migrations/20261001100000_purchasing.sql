-- MASTER 010: Compras, Fornecedores, Recebimento, Reposição e integração com
-- Estoque / Custos / Financeiro. Pedido aprovado NÃO move estoque: só o
-- recebimento POSTED gera entradas oficiais (PURCHASE_RECEIPT, IN) e a
-- devolução gera saída (PURCHASE_RETURN, OUT).
BEGIN;

-- =====================================================================
-- 0. Sequences de numeração.
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS public.purchase_request_seq MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.quotation_seq MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_seq MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.goods_receipt_seq MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.supplier_return_seq MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.supplier_document_seq MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.purchase_payable_seq MINVALUE 1;

-- =====================================================================
-- 1. Ledger: novo tipo de movimento PURCHASE_RETURN (devolução a fornecedor).
-- O ADD VALUE não pode ser usado em DML no mesmo bloco; o CHECK é adicionado
-- NOT VALID (preserva o histórico) e passa a valer para inserções novas.
-- =====================================================================
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'PURCHASE_RETURN';
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_check CHECK (
    (direction = 'IN'  AND movement_type::text IN (
      'OPENING_BALANCE','PURCHASE_RECEIPT','PRODUCTION_OUTPUT','SALE_RETURN',
      'PARTNER_SHIPMENT','PARTNER_RETURN','TRANSFER_IN','ADJUSTMENT_IN','MANUAL_CORRECTION','REVERSAL'))
    OR
    (direction = 'OUT' AND movement_type::text IN (
      'PRODUCTION_CONSUMPTION','SALE','PARTNER_SHIPMENT','PARTNER_RETURN','TRANSFER_OUT',
      'ADJUSTMENT_OUT','LOSS','MANUAL_CORRECTION','REVERSAL','PURCHASE_RETURN'))
) NOT VALID;

-- Custo de material passa a aceitar origem PURCHASE (recebimento).
ALTER TABLE public.material_cost_versions DROP CONSTRAINT IF EXISTS material_cost_versions_source_type_check;
ALTER TABLE public.material_cost_versions ADD CONSTRAINT material_cost_versions_source_type_check CHECK(source_type IN ('MANUAL','ADJUSTMENT','PURCHASE'));

-- Campos de política de reposição na variante (minimum_stock/reorder_point já existem).
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS target_stock numeric(14,3),
  ADD COLUMN IF NOT EXISTS replenishment_policy text NOT NULL DEFAULT 'REORDER_POINT'
    CHECK (replenishment_policy IN ('REORDER_POINT','TARGET_STOCK','MANUAL'));

-- =====================================================================
-- 2. Contas a pagar: parcelas (condições 30/60/90) sem quebrar o padrão.
-- =====================================================================
ALTER TABLE public.account_payables
  ADD COLUMN IF NOT EXISTS installment_number integer NOT NULL DEFAULT 1 CHECK(installment_number>=1),
  ADD COLUMN IF NOT EXISTS total_installments integer NOT NULL DEFAULT 1 CHECK(total_installments>=1),
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  DROP CONSTRAINT IF EXISTS account_payables_organization_id_source_type_source_id_key,
  ADD CONSTRAINT account_payables_org_source_installment_key UNIQUE(organization_id,source_type,source_id,installment_number),
  ADD CONSTRAINT account_payables_installment_order CHECK(installment_number<=total_installments),
  ADD CONSTRAINT account_payables_parent_fk FOREIGN KEY(organization_id,parent_id) REFERENCES public.account_payables(organization_id,id);

-- =====================================================================
-- 3. Permissões do módulo (fonte de verdade no banco).
-- =====================================================================
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['admin','gestor']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard',
  'suppliers.read','suppliers.manage',
  'purchase_requests.read','purchase_requests.create','purchase_requests.approve','purchase_requests.cancel',
  'quotations.read','quotations.create','quotations.manage','quotations.award',
  'purchase_orders.read','purchase_orders.create','purchase_orders.approve','purchase_orders.send','purchase_orders.cancel',
  'goods_receipts.read','goods_receipts.create','goods_receipts.inspect','goods_receipts.post','goods_receipts.cancel',
  'supplier_returns.read','supplier_returns.create','supplier_returns.post','supplier_returns.cancel',
  'supplier_documents.read','supplier_documents.create','supplier_documents.process','supplier_documents.cancel',
  'purchase_exceptions.read','purchase_exceptions.resolve']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['comercial']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard',
  'suppliers.read','suppliers.manage',
  'purchase_requests.read','purchase_requests.create','purchase_requests.cancel',
  'quotations.read','quotations.create','quotations.manage','quotations.award',
  'purchase_orders.read','purchase_orders.create','purchase_orders.send',
  'goods_receipts.read','goods_receipts.create','goods_receipts.inspect','goods_receipts.post',
  'supplier_returns.read','supplier_returns.create',
  'supplier_documents.read','supplier_documents.create','supplier_documents.process',
  'purchase_exceptions.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['estoque']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard',
  'suppliers.read',
  'purchase_requests.read','purchase_orders.read',
  'goods_receipts.read','goods_receipts.create','goods_receipts.inspect','goods_receipts.post','goods_receipts.cancel',
  'supplier_returns.read','supplier_returns.create','supplier_returns.post',
  'supplier_documents.read','purchase_exceptions.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['financeiro']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard','suppliers.read','purchase_requests.read','purchase_orders.read',
  'goods_receipts.read','supplier_documents.read','purchase_exceptions.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['producao','marketplace']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard','suppliers.read','purchase_requests.read',
  'purchase_orders.read','goods_receipts.read']) p ON CONFLICT DO NOTHING;

-- =====================================================================
-- 4. Helpers do módulo.
-- =====================================================================
CREATE FUNCTION public.purchasing_require(_org uuid,_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Sem permissão: %.',_permission; END IF; END
$$;
CREATE FUNCTION public.purchasing_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context) VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;
CREATE FUNCTION public.purchasing_split_terms(_terms text) RETURNS int[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
   WHEN _terms ~ '^[0-9]+(\/[0-9]+)+$' THEN ARRAY(SELECT v::int FROM unnest(string_to_array(_terms,'/')) v)
   WHEN _terms ~* '^net[0-9]+$' THEN ARRAY[(substring(upper(_terms) from 'net([0-9]+)'))::int]
   WHEN _terms ~* '^[0-9]+\s*d$' THEN ARRAY[(substring(lower(_terms) from '([0-9]+)\s*d'))::int]
   WHEN _terms = '0' OR lower(_terms) IN ('a vista','avista','cash') THEN ARRAY[0]
   ELSE ARRAY[30] END
$$;

-- Valida referências dentro da organização (mesmo padrão do financeiro).
CREATE FUNCTION public.purchasing_guard_relations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_data jsonb:=to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY CASE TG_TABLE_NAME
    WHEN 'supplier_profiles' THEN ARRAY[ARRAY['company_id','companies']]
    WHEN 'supplier_products' THEN ARRAY[ARRAY['supplier_id','supplier_profiles'],ARRAY['variant_id','product_variants'],ARRAY['purchase_unit_id','units_of_measure'],ARRAY['inventory_unit_id','units_of_measure']]
    WHEN 'purchase_requests' THEN ARRAY[ARRAY['cost_center_id','cost_centers']]
    WHEN 'purchase_request_items' THEN ARRAY[ARRAY['variant_id','product_variants'],ARRAY['unit_of_measure_id','units_of_measure']]
    WHEN 'quotations' THEN ARRAY[ARRAY['purchase_request_id','purchase_requests']]
    WHEN 'quotation_suppliers' THEN ARRAY[ARRAY['quotation_id','quotations'],ARRAY['supplier_id','supplier_profiles']]
    WHEN 'quotation_supplier_items' THEN ARRAY[ARRAY['quotation_id','quotations'],ARRAY['supplier_id','supplier_profiles'],ARRAY['variant_id','product_variants'],ARRAY['unit_of_measure_id','units_of_measure']]
    WHEN 'purchase_orders' THEN ARRAY[ARRAY['supplier_id','supplier_profiles'],ARRAY['quotation_id','quotations'],ARRAY['purchase_request_id','purchase_requests'],ARRAY['destination_location_id','inventory_locations'],ARRAY['financial_category_id','financial_categories'],ARRAY['cost_center_id','cost_centers']]
    WHEN 'purchase_order_items' THEN ARRAY[ARRAY['purchase_order_id','purchase_orders'],ARRAY['variant_id','product_variants'],ARRAY['purchase_unit_id','units_of_measure'],ARRAY['inventory_unit_id','units_of_measure']]
    WHEN 'goods_receipts' THEN ARRAY[ARRAY['purchase_order_id','purchase_orders'],ARRAY['supplier_id','supplier_profiles'],ARRAY['destination_location_id','inventory_locations']]
    WHEN 'goods_receipt_items' THEN ARRAY[ARRAY['goods_receipt_id','goods_receipts'],ARRAY['purchase_order_item_id','purchase_order_items'],ARRAY['variant_id','product_variants'],ARRAY['purchase_unit_id','units_of_measure'],ARRAY['inventory_unit_id','units_of_measure'],ARRAY['batch_id','inventory_batches']]
    WHEN 'supplier_returns' THEN ARRAY[ARRAY['supplier_id','supplier_profiles'],ARRAY['goods_receipt_id','goods_receipts'],ARRAY['source_location_id','inventory_locations']]
    WHEN 'supplier_return_items' THEN ARRAY[ARRAY['supplier_return_id','supplier_returns'],ARRAY['variant_id','product_variants'],ARRAY['batch_id','inventory_batches']]
    WHEN 'supplier_documents' THEN ARRAY[ARRAY['supplier_id','supplier_profiles'],ARRAY['purchase_order_id','purchase_orders'],ARRAY['goods_receipt_id','goods_receipts']]
    WHEN 'purchase_exceptions' THEN ARRAY[ARRAY['purchase_order_id','purchase_orders'],ARRAY['purchase_order_item_id','purchase_order_items'],ARRAY['goods_receipt_id','goods_receipts'],ARRAY['supplier_document_id','supplier_documents'],ARRAY['variant_id','product_variants']]
    ELSE ARRAY[ARRAY[]::text[]]
  END
  LOOP
    v_id:=(v_data->>v_pair[1])::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
    IF v_org IS NULL AND v_pair[2]='units_of_measure' THEN CONTINUE; END IF;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Guarda: histórico imutável; escrita sempre via RPC.
CREATE FUNCTION public.purchasing_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; j jsonb:=to_jsonb(NEW);
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico não pode ser excluído.'; END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  IF TG_TABLE_NAME='goods_receipts' AND OLD.status IN ('POSTED','CANCELED') THEN RAISE EXCEPTION 'Recebimento postado/cancelado é imutável.'; END IF;
  IF TG_TABLE_NAME='goods_receipt_items' THEN
    SELECT status INTO v_status FROM public.goods_receipts WHERE id=(j->>'goods_receipt_id')::uuid;
    IF v_status IN ('POSTED','CANCELED') THEN RAISE EXCEPTION 'Item de recebimento imutável após postagem.'; END IF;
  END IF;
  IF TG_TABLE_NAME='supplier_returns' AND OLD.status IN ('POSTED','CANCELED') THEN RAISE EXCEPTION 'Devolução postada/cancelada é imutável.'; END IF;
  IF TG_TABLE_NAME='supplier_return_items' THEN
    SELECT status INTO v_status FROM public.supplier_returns WHERE id=(j->>'supplier_return_id')::uuid;
    IF v_status IN ('POSTED','CANCELED') THEN RAISE EXCEPTION 'Item de devolução imutável após postagem.'; END IF;
  END IF;
  IF TG_TABLE_NAME='supplier_documents' AND OLD.status IN ('PROCESSED','CANCELED') THEN RAISE EXCEPTION 'Documento processado/cancelado é imutável.'; END IF;
  IF TG_TABLE_NAME='purchase_orders' AND OLD.status IN ('COMPLETED','CANCELED') THEN RAISE EXCEPTION 'Pedido concluído/cancelado é imutável.'; END IF;
  IF TG_TABLE_NAME='purchase_exceptions' AND OLD.status IN ('RESOLVED','IGNORED_WITH_AUTHORIZATION') THEN RAISE EXCEPTION 'Exceção resolvida é imutável.'; END IF;
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 5. Fornecedores.
-- =====================================================================
CREATE TABLE public.supplier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  company_id uuid NOT NULL,
  supplier_code text NOT NULL CHECK(length(trim(supplier_code))>0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','BLOCKED')),
  default_payment_terms text,
  lead_time_days integer,
  minimum_order_value numeric(16,2) NOT NULL DEFAULT 0,
  preferred boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'BRL',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  updated_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,company_id), UNIQUE(organization_id,supplier_code),
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id)
);
CREATE INDEX supplier_profiles_org_status ON public.supplier_profiles(organization_id,status);

CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  supplier_sku text NOT NULL CHECK(length(trim(supplier_sku))>0),
  supplier_description text,
  purchase_unit_id uuid REFERENCES public.units_of_measure,
  inventory_unit_id uuid REFERENCES public.units_of_measure,
  conversion_factor numeric(24,10),
  last_price numeric(20,6),
  last_price_date date,
  minimum_order_quantity numeric(14,3) NOT NULL DEFAULT 1,
  lead_time_days integer,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  updated_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,supplier_id,variant_id), UNIQUE(organization_id,supplier_id,supplier_sku)
);
CREATE INDEX supplier_products_org_variant ON public.supplier_products(organization_id,variant_id);

-- =====================================================================
-- 6. Requisições de compra.
-- =====================================================================
CREATE TABLE public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  request_number text NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  requested_by uuid REFERENCES public.profiles,
  cost_center_id uuid REFERENCES public.cost_centers,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','ORDERED','CANCELED')),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
  needed_by_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,request_number)
);
CREATE TABLE public.purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  purchase_request_id uuid NOT NULL REFERENCES public.purchase_requests,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  unit_of_measure_id uuid REFERENCES public.units_of_measure,
  needed_by_date date,
  reason text,
  source_type text NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','LOW_STOCK','PRODUCTION_ORDER','MRP','SALES_DEMAND','OTHER')),
  source_id text,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ORDERED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,purchase_request_id,variant_id)
);
CREATE INDEX purchase_request_items_org_variant ON public.purchase_request_items(organization_id,variant_id);

-- =====================================================================
-- 7. Cotações.
-- =====================================================================
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  quotation_number text NOT NULL,
  purchase_request_id uuid REFERENCES public.purchase_requests,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','AWAITING','COMPARED','AWARDED','CLOSED','CANCELED')),
  deadline date,
  notes text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,quotation_number)
);
CREATE TABLE public.quotation_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  quotation_id uuid NOT NULL REFERENCES public.quotations,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,quotation_id,supplier_id)
);
CREATE TABLE public.quotation_supplier_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  quotation_id uuid NOT NULL REFERENCES public.quotations,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  purchase_request_item_id uuid REFERENCES public.purchase_request_items,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  unit_of_measure_id uuid REFERENCES public.units_of_measure,
  unit_price numeric(20,6) NOT NULL CHECK(unit_price>=0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  freight_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(freight_amount>=0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
  other_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(other_amount>=0),
  total_amount numeric(20,6) NOT NULL CHECK(total_amount>=0),
  delivery_days integer,
  payment_terms text,
  valid_until date,
  notes text,
  awarded boolean NOT NULL DEFAULT false,
  awarded_by uuid REFERENCES public.profiles,
  awarded_at timestamptz,
  award_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,quotation_id,supplier_id,variant_id)
);
CREATE INDEX quotation_supplier_items_org_variant ON public.quotation_supplier_items(organization_id,variant_id);

-- =====================================================================
-- 8. Pedidos de compra (não movem estoque; são o contrato).
-- =====================================================================
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  order_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  quotation_id uuid REFERENCES public.quotations,
  purchase_request_id uuid REFERENCES public.purchase_requests,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','RECEIVING','COMPLETED','CANCELED')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  currency text NOT NULL DEFAULT 'BRL',
  subtotal numeric(16,2) NOT NULL DEFAULT 0,
  discount_amount numeric(16,2) NOT NULL DEFAULT 0,
  freight_amount numeric(16,2) NOT NULL DEFAULT 0,
  tax_amount numeric(16,2) NOT NULL DEFAULT 0,
  other_amount numeric(16,2) NOT NULL DEFAULT 0,
  total_amount numeric(16,2) NOT NULL DEFAULT 0,
  payment_terms text,
  destination_location_id uuid REFERENCES public.inventory_locations,
  financial_category_id uuid REFERENCES public.financial_categories,
  cost_center_id uuid REFERENCES public.cost_centers,
  notes text,
  created_by uuid REFERENCES public.profiles,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,order_number),
  CHECK(total_amount>=0)
);
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  supplier_sku text,
  ordered_quantity numeric(14,3) NOT NULL CHECK(ordered_quantity>0),
  received_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
  purchase_unit_id uuid REFERENCES public.units_of_measure,
  inventory_unit_id uuid REFERENCES public.units_of_measure,
  conversion_factor numeric(24,10),
  unit_price numeric(20,6) NOT NULL CHECK(unit_price>=0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
  line_total numeric(20,6) NOT NULL CHECK(line_total>=0),
  expected_delivery_date date,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PARTIALLY_RECEIVED','RECEIVED','CANCELED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,purchase_order_id,variant_id)
);
CREATE INDEX purchase_order_items_org_variant ON public.purchase_order_items(organization_id,variant_id);

-- =====================================================================
-- 9. Recebimento de mercadorias (inspeção e postagem oficial).
-- =====================================================================
CREATE TABLE public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  receipt_number text NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  destination_location_id uuid REFERENCES public.inventory_locations,
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  received_by uuid REFERENCES public.profiles,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','UNDER_INSPECTION','ACCEPTED','REJECTED','POSTED','CANCELED')),
  supplier_document_number text,
  total_received numeric(14,3) NOT NULL DEFAULT 0,
  total_accepted numeric(14,3) NOT NULL DEFAULT 0,
  total_rejected numeric(14,3) NOT NULL DEFAULT 0,
  notes text,
  posted_at timestamptz,
  posted_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,receipt_number)
);
CREATE INDEX goods_receipts_org_po ON public.goods_receipts(organization_id,purchase_order_id);

CREATE TABLE public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  received_quantity numeric(14,3) NOT NULL CHECK(received_quantity>=0),
  accepted_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(accepted_quantity>=0),
  rejected_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(rejected_quantity>=0),
  inventory_unit_id uuid REFERENCES public.units_of_measure,
  purchase_unit_id uuid REFERENCES public.units_of_measure,
  conversion_factor numeric(24,10),
  unit_cost numeric(20,6) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
  line_total numeric(20,6) NOT NULL DEFAULT 0,
  batch_id uuid REFERENCES public.inventory_batches,
  manufacture_date date,
  expiration_date date,
  reason text,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','ACCEPTED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,goods_receipt_id,purchase_order_item_id),
  CHECK(accepted_quantity+rejected_quantity<=received_quantity)
);
CREATE INDEX goods_receipt_items_org_variant ON public.goods_receipt_items(organization_id,variant_id);

-- =====================================================================
-- 10. Devolução a fornecedor.
-- =====================================================================
CREATE TABLE public.supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  return_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  goods_receipt_id uuid REFERENCES public.goods_receipts,
  source_location_id uuid REFERENCES public.inventory_locations,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','CANCELED')),
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text CHECK(nullif(trim(reason),'') IS NULL OR length(trim(reason))<=4000),
  created_by uuid REFERENCES public.profiles,
  posted_at timestamptz,
  posted_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,return_number)
);
CREATE TABLE public.supplier_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  supplier_return_id uuid NOT NULL REFERENCES public.supplier_returns,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  batch_id uuid REFERENCES public.inventory_batches,
  reason text CHECK(nullif(trim(reason),'') IS NULL OR length(trim(reason))<=4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 11. Documentos de fornecedor (fatura/nota) e o 3-way match.
-- =====================================================================
CREATE TABLE public.supplier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  supplier_id uuid NOT NULL REFERENCES public.supplier_profiles,
  document_type text NOT NULL DEFAULT 'INVOICE' CHECK(document_type IN ('INVOICE','CREDIT_NOTE','OTHER')),
  document_number text NOT NULL CHECK(length(trim(document_number))>0),
  issue_date date NOT NULL,
  total_amount numeric(16,2) NOT NULL CHECK(total_amount>=0),
  quantity numeric(14,3),
  purchase_order_id uuid REFERENCES public.purchase_orders,
  goods_receipt_id uuid REFERENCES public.goods_receipts,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','MATCHED','EXCEPTION','PROCESSED','CANCELED')),
  storage_path text,
  notes text,
  created_by uuid REFERENCES public.profiles,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,document_type,document_number)
);
CREATE INDEX supplier_documents_org_supplier ON public.supplier_documents(organization_id,supplier_id);

-- =====================================================================
-- 12. Exceções de compra (central de exceções).
-- =====================================================================
CREATE TABLE public.purchase_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  exception_type text NOT NULL CHECK(exception_type IN (
    'OVER_RECEIPT','QUANTITY_VARIANCE','PRICE_VARIANCE','UNIT_CONVERSION_MISSING',
    'SUPPLIER_DOCUMENT_DUPLICATE','SCHEDULE_DELAY','MISSING_DOCUMENT','OTHER')),
  severity text NOT NULL DEFAULT 'WARNING' CHECK(severity IN ('BLOCKING','WARNING')),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','IGNORED_WITH_AUTHORIZATION')),
  purchase_order_id uuid REFERENCES public.purchase_orders,
  purchase_order_item_id uuid REFERENCES public.purchase_order_items,
  goods_receipt_id uuid REFERENCES public.goods_receipts,
  supplier_document_id uuid REFERENCES public.supplier_documents,
  variant_id uuid REFERENCES public.product_variants,
  message text NOT NULL CHECK(length(trim(message))>0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_by uuid REFERENCES public.profiles,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_exceptions_org_status ON public.purchase_exceptions(organization_id,status);
CREATE INDEX purchase_exceptions_org_type ON public.purchase_exceptions(organization_id,exception_type);

-- =====================================================================
-- 13. Histórico de custo de aquisição (base da política AVERAGE).
-- =====================================================================
CREATE TABLE public.purchase_receipt_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  variant_id uuid NOT NULL REFERENCES public.product_variants,
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts,
  effective_date date NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0),
  unit_cost numeric(20,6) NOT NULL CHECK(unit_cost>=0),
  total_value numeric(20,6) NOT NULL CHECK(total_value>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,goods_receipt_id,variant_id)
);

-- =====================================================================
-- 14. Configurações de compra.
-- =====================================================================
CREATE TABLE public.purchasing_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations,
  acquisition_cost_policy text NOT NULL DEFAULT 'LAST_PURCHASE'
    CHECK (acquisition_cost_policy IN ('NONE','LAST_PURCHASE','STANDARD','AVERAGE')),
  freight_policy text NOT NULL DEFAULT 'EXPENSE_SEPARATELY'
    CHECK (freight_policy IN ('INCLUDE_IN_INVENTORY_COST','EXPENSE_SEPARATELY')),
  over_receipt_policy text NOT NULL DEFAULT 'BLOCK'
    CHECK (over_receipt_policy IN ('BLOCK','AUTH_OVERRIDE')),
  payable_on text NOT NULL DEFAULT 'GOODS_RECEIPT'
    CHECK (payable_on IN ('GOODS_RECEIPT','SUPPLIER_DOCUMENT','MANUAL')),
  approval_segregation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles
);
CREATE FUNCTION public.purchasing_ensure_settings(_org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.purchasing_settings(organization_id) VALUES(_org) ON CONFLICT(organization_id) DO NOTHING;
END;
$$;

-- =====================================================================
-- 15. RLS + grants (escrita somente via RPC).
-- =====================================================================
DO $$ DECLARE t text; perm text; BEGIN
 FOREACH t IN ARRAY ARRAY['supplier_profiles','supplier_products','purchasing_settings'] LOOP
  perm:='suppliers.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['purchase_requests','purchase_request_items'] LOOP
  perm:='purchase_requests.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['quotations','quotation_suppliers','quotation_supplier_items'] LOOP
  perm:='quotations.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['purchase_orders','purchase_order_items'] LOOP
  perm:='purchase_orders.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['goods_receipts','goods_receipt_items'] LOOP
  perm:='goods_receipts.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['supplier_returns','supplier_return_items'] LOOP
  perm:='supplier_returns.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['supplier_documents'] LOOP
  perm:='supplier_documents.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['purchase_exceptions'] LOOP
  perm:='purchase_exceptions.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['purchase_receipt_costs'] LOOP
  perm:='purchasing.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
END $$;

-- =====================================================================
-- 16. RPCs: Fornecedores.
-- =====================================================================
CREATE FUNCTION public.supplier_save_company(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid:=coalesce(_id,gen_random_uuid()); s text:=coalesce(_data->>'status','ACTIVE'); old text;
BEGIN
  PERFORM public.purchasing_require(_org,'suppliers.manage');
  PERFORM public.inventory_lock(_org);
  IF _id IS NOT NULL THEN
    SELECT status INTO old FROM public.companies WHERE id=c AND organization_id=_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  END IF;
  IF _data->>'status'='BLOCKED' AND nullif(trim(_data->>'blocked_reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo do bloqueio obrigatório.'; END IF;
  INSERT INTO public.companies(id,organization_id,code,legal_name,trade_name,document_type,document_number,state_registration,email,phone,website,status,notes,blocked_reason,blocked_at,blocked_by,created_by,updated_by)
  VALUES(c,_org,trim(_data->>'code'),trim(_data->>'legal_name'),_data->>'trade_name',nullif(_data->>'document_type',''),nullif(_data->>'document_number',''),_data->>'state_registration',_data->>'email',_data->>'phone',_data->>'website',s,_data->>'notes',_data->>'blocked_reason',CASE WHEN s='BLOCKED' THEN now() END,CASE WHEN s='BLOCKED' THEN auth.uid() END,auth.uid(),auth.uid())
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,legal_name=excluded.legal_name,trade_name=excluded.trade_name,document_type=excluded.document_type,document_number=excluded.document_number,state_registration=excluded.state_registration,email=excluded.email,phone=excluded.phone,website=excluded.website,status=excluded.status,notes=excluded.notes,blocked_reason=excluded.blocked_reason,blocked_at=excluded.blocked_at,blocked_by=excluded.blocked_by,updated_by=auth.uid(),updated_at=now();
  INSERT INTO public.company_roles(organization_id,company_id,role) VALUES(_org,c,'SUPPLIER') ON CONFLICT DO NOTHING;
  INSERT INTO public.supplier_profiles(organization_id,company_id,supplier_code,status,default_payment_terms,lead_time_days,minimum_order_value,preferred,currency,notes,created_by,updated_by)
  VALUES(_org,c,trim(_data->>'code'),s,_data->>'default_payment_terms',nullif(regexp_replace(_data->>'lead_time_days','[^0-9]','','g'),'')::int,coalesce((_data->>'minimum_order_value')::numeric,0),coalesce((_data->>'preferred')::boolean,false),coalesce(_data->>'currency','BRL'),_data->>'notes',auth.uid(),auth.uid())
  ON CONFLICT(organization_id,company_id) DO UPDATE SET supplier_code=coalesce(trim(_data->>'code'),supplier_profiles.supplier_code),status=s,default_payment_terms=coalesce(_data->>'default_payment_terms',supplier_profiles.default_payment_terms),lead_time_days=coalesce(nullif(regexp_replace(_data->>'lead_time_days','[^0-9]','','g'),'')::int,supplier_profiles.lead_time_days),minimum_order_value=coalesce((_data->>'minimum_order_value')::numeric,supplier_profiles.minimum_order_value),preferred=coalesce((_data->>'preferred')::boolean,supplier_profiles.preferred),currency=coalesce(_data->>'currency',supplier_profiles.currency),notes=coalesce(_data->>'notes',supplier_profiles.notes),updated_by=auth.uid(),updated_at=now();
  PERFORM public.purchasing_audit(_org,CASE WHEN _id IS NULL THEN 'purchasing.supplier.create' WHEN s='BLOCKED' THEN 'purchasing.supplier.block' ELSE 'purchasing.supplier.update' END,'supplier_profiles',c,_data);
  RETURN c;
END;
$$;

CREATE FUNCTION public.supplier_product_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid()); lc text;
BEGIN
  PERFORM public.purchasing_require(_org,'suppliers.manage');
  IF NOT EXISTS(SELECT 1 FROM public.supplier_profiles WHERE id=(_data->>'supplier_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Fornecedor não encontrado.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=(_data->>'variant_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Variante não encontrada.'; END IF;
  lc:=trim(NULLIF(_data->>'supplier_sku',''));
  IF lc IS NULL THEN RAISE EXCEPTION 'SKU do fornecedor obrigatório.'; END IF;
  INSERT INTO public.supplier_products(organization_id,supplier_id,variant_id,supplier_sku,supplier_description,purchase_unit_id,inventory_unit_id,conversion_factor,last_price,last_price_date,minimum_order_quantity,lead_time_days,status,created_by,updated_by)
  VALUES(_org,(_data->>'supplier_id')::uuid,(_data->>'variant_id')::uuid,lc,_data->>'supplier_description',nullif((_data->>'purchase_unit_id')::uuid::text,'')::uuid,nullif((_data->>'inventory_unit_id')::uuid::text,'')::uuid,coalesce((_data->>'conversion_factor')::numeric,NULL),nullif(regexp_replace(_data->>'last_price','[^0-9.]','','g'),'')::numeric,nullif((_data->>'last_price_date')::date::text,'')::date,coalesce((_data->>'minimum_order_quantity')::numeric,1),nullif(regexp_replace(_data->>'lead_time_days','[^0-9]','','g'),'')::int,coalesce(_data->>'status','ACTIVE'),auth.uid(),auth.uid())
  ON CONFLICT(organization_id,supplier_id,variant_id) DO UPDATE SET supplier_sku=lc,supplier_description=coalesce(_data->>'supplier_description',supplier_products.supplier_description),purchase_unit_id=coalesce(nullif((_data->>'purchase_unit_id')::uuid::text,'')::uuid,supplier_products.purchase_unit_id),inventory_unit_id=coalesce(nullif((_data->>'inventory_unit_id')::uuid::text,'')::uuid,supplier_products.inventory_unit_id),conversion_factor=coalesce((_data->>'conversion_factor')::numeric,supplier_products.conversion_factor),last_price=coalesce(nullif(regexp_replace(_data->>'last_price','[^0-9.]','','g'),'')::numeric,supplier_products.last_price),last_price_date=coalesce(nullif((_data->>'last_price_date')::date::text,'')::date,supplier_products.last_price_date),minimum_order_quantity=coalesce((_data->>'minimum_order_quantity')::numeric,supplier_products.minimum_order_quantity),lead_time_days=coalesce(nullif(regexp_replace(_data->>'lead_time_days','[^0-9]','','g'),'')::int,supplier_products.lead_time_days),status=coalesce(_data->>'status',supplier_products.status),updated_by=auth.uid(),updated_at=now()
  RETURNING id INTO v;
  PERFORM public.purchasing_audit(_org,'purchasing.supplier_product.save','supplier_products',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.supplier_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); status text:=coalesce(_filters->>'status','');
BEGIN
  PERFORM public.purchasing_require(_org,'suppliers.read');
  IF _kind='suppliers' THEN
    WITH s AS (
      SELECT c.id company_id,c.code,c.legal_name,c.trade_name,c.document_type,c.document_number,c.status company_status,
        p.id supplier_id,p.supplier_code,p.status supplier_status,p.default_payment_terms,p.preferred,p.currency,
        (SELECT count(*) FROM public.supplier_products sp WHERE sp.supplier_id=p.id AND sp.status='ACTIVE') product_count,
        (SELECT count(*) FROM public.purchase_orders po WHERE po.supplier_id=p.id AND po.status IN ('APPROVED','SENT','RECEIVING')) open_orders
      FROM public.companies c JOIN public.supplier_profiles p ON p.company_id=c.id
      WHERE c.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM s WHERE (query='' OR strpos(lower(concat_ws(' ',code,legal_name,trade_name,supplier_code,document_number)),query)>0) AND (status='' OR supplier_status=status) ORDER BY legal_name LIMIT 50 OFFSET (_page-1)*50) q), '[]'::jsonb),'total',(SELECT count(*) FROM s)) INTO result;
  ELSIF _kind='supplier' THEN
    SELECT to_jsonb(c)||jsonb_build_object(
      'profile',(SELECT to_jsonb(p) FROM public.supplier_profiles p WHERE p.organization_id=_org AND c.id=p.company_id),
      'products',(SELECT coalesce(jsonb_agg(to_jsonb(sp)),'[]'::jsonb) FROM public.supplier_products sp JOIN public.product_variants v ON v.id=sp.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE sp.supplier_id=c.supplier_profiles_id),
      'orders',(SELECT coalesce(jsonb_agg(o),'[]'::jsonb) FROM (SELECT po.id,po.order_number,po.status,po.issue_date,po.expected_delivery_date,po.total_amount,po.currency FROM public.purchase_orders po WHERE po.supplier_id=c.supplier_profiles_id ORDER BY po.created_at DESC LIMIT 20) o),
      'receipts',(SELECT coalesce(jsonb_agg(r),'[]'::jsonb) FROM (SELECT gr.id,gr.receipt_number,gr.status,gr.received_at,gr.total_accepted FROM public.goods_receipts gr WHERE gr.supplier_id=c.supplier_profiles_id ORDER BY gr.created_at DESC LIMIT 20) r),
      'documents',(SELECT coalesce(jsonb_agg(d),'[]'::jsonb) FROM (SELECT sd.id,sd.document_type,sd.document_number,sd.issue_date,sd.total_amount,sd.status FROM public.supplier_documents sd WHERE sd.supplier_id=c.supplier_profiles_id ORDER BY sd.created_at DESC LIMIT 20) d),
      'returns',(SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (SELECT sr.id,sr.return_number,sr.status,sr.return_date FROM public.supplier_returns sr WHERE sr.supplier_id=c.supplier_profiles_id ORDER BY sr.created_at DESC LIMIT 20) t)
    ) INTO result FROM (SELECT c.*,s.id supplier_profiles_id FROM public.companies c JOIN public.supplier_profiles s ON s.company_id=c.id WHERE c.organization_id=_org AND c.id=(coalesce(nullif(_filters->>'company_id',''),nullif(_filters->>'id',''))::uuid)) c;
    IF result IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado.'; END IF;
    result:=result::jsonb||jsonb_build_object('payables',CASE WHEN public.has_permission(_org,'payables.read') THEN (SELECT coalesce(jsonb_agg(p),'[]'::jsonb) FROM (SELECT ap.id,ap.document_number,ap.source_type,ap.source_status,ap.issue_date,ap.due_date,ap.original_amount,ap.open_amount,ap.status,ap.installment_number,ap.total_installments FROM public.account_payables ap WHERE ap.organization_id=_org AND ap.company_id=(result->>'id')::uuid ORDER BY ap.due_date) p) ELSE '[]'::jsonb END);
  ELSIF _kind='products' THEN
    WITH rows AS MATERIALIZED(
      SELECT sp.id,sp.supplier_id,c.legal_name supplier_name,sp.variant_id,v.sku,pr.name product_name,sp.supplier_sku,sp.supplier_description,
        u.code purchase_unit,ui.code inventory_unit,sp.conversion_factor,sp.last_price,sp.last_price_date,sp.minimum_order_quantity,sp.lead_time_days,sp.status
      FROM public.supplier_products sp JOIN public.supplier_profiles s ON s.id=sp.supplier_id JOIN public.companies c ON c.id=s.company_id
      JOIN public.product_variants v ON v.id=sp.variant_id JOIN public.products pr ON pr.id=v.product_id
      LEFT JOIN public.units_of_measure u ON u.id=sp.purchase_unit_id LEFT JOIN public.units_of_measure ui ON ui.id=sp.inventory_unit_id
      WHERE sp.organization_id=_org AND (nullif(_filters->>'supplier_id','') IS NULL OR sp.supplier_id=(_filters->>'supplier_id')::uuid)
        AND (query='' OR strpos(lower(concat_ws(' ',c.legal_name,sp.supplier_sku,v.sku,pr.name)),query)>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY supplier_name LIMIT 100 OFFSET (_page-1)*100) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='dashboard' THEN
    SELECT jsonb_build_object(
      'active_suppliers',(SELECT count(*) FROM public.supplier_profiles WHERE organization_id=_org AND status='ACTIVE'),
      'products_catalogued',(SELECT count(*) FROM public.supplier_products WHERE organization_id=_org AND status='ACTIVE'),
      'open_orders',(SELECT count(*) FROM public.purchase_orders WHERE organization_id=_org AND status IN ('APPROVED','SENT','RECEIVING')),
      'unmatched_documents',(SELECT count(*) FROM public.supplier_documents WHERE organization_id=_org AND status IN ('DRAFT','EXCEPTION')),
      'open_exceptions',(SELECT count(*) FROM public.purchase_exceptions WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW'))) INTO result;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 17. RPCs: Requisições de compra.
-- =====================================================================
CREATE FUNCTION public.request_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid()); it jsonb; v_qty numeric;
BEGIN
  PERFORM public.purchasing_require(_org,'purchase_requests.create');
  IF _data->'items' IS NULL OR jsonb_array_length(_data->'items')=0 THEN RAISE EXCEPTION 'Informe ao menos um item.'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.purchase_requests(organization_id,request_number,request_date,requested_by,cost_center_id,status,priority,needed_by_date,notes)
    VALUES(_org,'REQ-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.purchase_request_seq')::text,6,'0'),coalesce(nullif(_data->>'request_date','')::date,CURRENT_DATE),auth.uid(),nullif(_data->>'cost_center_id','')::uuid,'DRAFT',coalesce(_data->>'priority','NORMAL'),nullif(_data->>'needed_by_date','')::date,_data->>'notes') RETURNING id INTO v;
  ELSE
    UPDATE public.purchase_requests SET cost_center_id=coalesce(nullif(_data->>'cost_center_id','')::uuid,cost_center_id),priority=coalesce(_data->>'priority',priority),needed_by_date=coalesce(nullif(_data->>'needed_by_date','')::date,needed_by_date),notes=coalesce(_data->>'notes',notes),updated_at=now() WHERE id=v AND organization_id=_org AND status='DRAFT';
    IF NOT FOUND THEN RAISE EXCEPTION 'Requisição não encontrada ou já encaminhada.'; END IF;
    DELETE FROM public.purchase_request_items WHERE purchase_request_id=v;
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_data->'items')
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=(it->>'variant_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Variante inválida.'; END IF;
    v_qty:=(it->>'quantity')::numeric;
    IF v_qty<=0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
    INSERT INTO public.purchase_request_items(organization_id,purchase_request_id,variant_id,quantity,unit_of_measure_id,needed_by_date,reason,source_type,source_id,status)
    VALUES(_org,v,(it->>'variant_id')::uuid,v_qty,nullif(it->>'unit_of_measure_id','')::uuid,nullif(it->>'needed_by_date','')::date,it->>'reason',coalesce(it->>'source_type','MANUAL'),it->>'source_id','PENDING');
  END LOOP;
  PERFORM public.purchasing_audit(_org,CASE WHEN _id IS NULL THEN 'purchasing.request.create' ELSE 'purchasing.request.update' END,'purchase_requests',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.request_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.purchase_requests;
BEGIN
  IF _action NOT IN ('submit','approve','cancel') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  PERFORM public.purchasing_require(_org,CASE _action WHEN 'approve' THEN 'purchase_requests.approve' WHEN 'cancel' THEN 'purchase_requests.cancel' ELSE 'purchase_requests.create' END);
  PERFORM public.inventory_lock(_org);
  SELECT * INTO r FROM public.purchase_requests WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requisição não encontrada.'; END IF;
  IF _action='submit' THEN
    IF r.status<>'DRAFT' THEN RAISE EXCEPTION 'Somente rascunhos podem ser submetidos.'; END IF;
    UPDATE public.purchase_requests SET status='SUBMITTED',updated_at=now() WHERE id=_id;
  ELSIF _action='approve' THEN
    IF r.status NOT IN ('SUBMITTED','APPROVED') THEN RAISE EXCEPTION 'Somente requisições submetidas podem ser aprovadas.'; END IF;
    UPDATE public.purchase_requests SET status='APPROVED',updated_at=now() WHERE id=_id;
  ELSIF _action='cancel' THEN
    IF r.status='ORDERED' THEN RAISE EXCEPTION 'Requisição já transformada em pedido não pode ser cancelada.'; END IF;
    UPDATE public.purchase_requests SET status='CANCELED',updated_at=now() WHERE id=_id;
    UPDATE public.purchase_request_items SET status='CANCELLED' WHERE purchase_request_id=_id AND status='PENDING';
  END IF;
  PERFORM public.purchasing_audit(_org,'purchasing.request.'||_action,'purchase_requests',_id,_data);
  RETURN jsonb_build_object('id',_id,'status',CASE _action WHEN 'submit' THEN 'SUBMITTED' WHEN 'approve' THEN 'APPROVED' ELSE 'CANCELED' END);
END;
$$;

CREATE FUNCTION public.request_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); status text:=coalesce(_filters->>'status','');
BEGIN
  PERFORM public.purchasing_require(_org,'purchase_requests.read');
  IF _kind='requests' THEN
    WITH rows AS MATERIALIZED(
      SELECT r.id,r.request_number,r.request_date,r.status AS st,r.priority,r.needed_by_date,cc.name cost_center,
        (SELECT count(*) FROM public.purchase_request_items i WHERE i.purchase_request_id=r.id) items,
        (SELECT count(*) FROM public.purchase_request_items i WHERE i.purchase_request_id=r.id AND i.status='PENDING') pending_items
      FROM public.purchase_requests r LEFT JOIN public.cost_centers cc ON cc.id=r.cost_center_id
      WHERE r.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(request_number),query)>0) AND (status='' OR st=status) ORDER BY request_date DESC,request_number DESC LIMIT 50 OFFSET (_page-1)*50) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='request' THEN
    result:=jsonb_build_object('request',(SELECT to_jsonb(r) FROM public.purchase_requests r WHERE id=(_filters->>'id')::uuid AND organization_id=_org),
      'items',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) FROM public.purchase_request_items i WHERE i.purchase_request_id=(_filters->>'id')::uuid));
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 18. RPCs: Cotações.
-- =====================================================================
CREATE FUNCTION public.quotation_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid()); supp jsonb; it jsonb; v_qty numeric; v_price numeric;
BEGIN
  PERFORM public.purchasing_require(_org,'quotations.create');
  IF _data->'suppliers' IS NULL OR jsonb_array_length(_data->'suppliers')=0 THEN RAISE EXCEPTION 'Informe ao menos um fornecedor.'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.quotations(organization_id,quotation_number,purchase_request_id,status,deadline,notes,created_by)
    VALUES(_org,'COT-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.quotation_seq')::text,6,'0'),nullif(_data->>'purchase_request_id','')::uuid,'DRAFT',nullif(_data->>'deadline','')::date,_data->>'notes',auth.uid()) RETURNING id INTO v;
  ELSE
    UPDATE public.quotations SET purchase_request_id=coalesce(nullif(_data->>'purchase_request_id','')::uuid,purchase_request_id),deadline=coalesce(nullif(_data->>'deadline','')::date,deadline),notes=coalesce(_data->>'notes',notes),updated_at=now() WHERE id=v AND organization_id=_org AND status IN ('DRAFT','AWAITING');
    IF NOT FOUND THEN RAISE EXCEPTION 'Cotação não encontrada ou já encerrada.'; END IF;
    DELETE FROM public.quotation_suppliers WHERE quotation_id=v;
    DELETE FROM public.quotation_supplier_items WHERE quotation_id=v;
  END IF;
  FOR supp IN SELECT * FROM jsonb_array_elements(_data->'suppliers')
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.supplier_profiles WHERE id=(supp->>'supplier_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Fornecedor inválido.'; END IF;
    INSERT INTO public.quotation_suppliers(organization_id,quotation_id,supplier_id,notes) VALUES(_org,v,(supp->>'supplier_id')::uuid,supp->>'notes');
    FOR it IN SELECT * FROM jsonb_array_elements(coalesce(supp->'items','[]'::jsonb))
    LOOP
      v_qty:=(it->>'quantity')::numeric; v_price:=(it->>'unit_price')::numeric;
      IF v_qty<=0 OR v_price<0 THEN RAISE EXCEPTION 'Item de cotação inválido.'; END IF;
      INSERT INTO public.quotation_supplier_items(organization_id,quotation_id,supplier_id,purchase_request_item_id,variant_id,quantity,unit_of_measure_id,unit_price,discount_amount,freight_amount,tax_amount,other_amount,total_amount,delivery_days,payment_terms,valid_until,notes)
      VALUES(_org,v,(supp->>'supplier_id')::uuid,nullif(it->>'purchase_request_item_id','')::uuid,(it->>'variant_id')::uuid,v_qty,nullif(it->>'unit_of_measure_id','')::uuid,v_price,coalesce((it->>'discount_amount')::numeric,0),coalesce((it->>'freight_amount')::numeric,0),coalesce((it->>'tax_amount')::numeric,0),coalesce((it->>'other_amount')::numeric,0),
        round(v_qty*v_price - coalesce((it->>'discount_amount')::numeric,0) + coalesce((it->>'freight_amount')::numeric,0) + coalesce((it->>'tax_amount')::numeric,0) + coalesce((it->>'other_amount')::numeric,0),6),
        nullif(regexp_replace(coalesce(it->>'delivery_days',''),'[^0-9]','','g'),'')::int,it->>'payment_terms',nullif(it->>'valid_until','')::date,it->>'notes');
    END LOOP;
  END LOOP;
  UPDATE public.quotations SET status='AWAITING' WHERE id=v AND status='DRAFT';
  PERFORM public.purchasing_audit(_org,CASE WHEN _id IS NULL THEN 'purchasing.quotation.create' ELSE 'purchasing.quotation.update' END,'quotations',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.quotation_award(_org uuid,_quotation_id uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it jsonb; v_award boolean; v_id uuid; v_variant uuid; v_supplier uuid;
BEGIN
  PERFORM public.purchasing_require(_org,'quotations.award');
  IF NOT EXISTS(SELECT 1 FROM public.quotations WHERE id=_quotation_id AND organization_id=_org) THEN RAISE EXCEPTION 'Cotação não encontrada.'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_data->'items')
  LOOP
    v_id:=(it->>'item_id')::uuid; v_award:=coalesce((it->>'award')::boolean,false);
    IF v_id IS NOT NULL THEN
      UPDATE public.quotation_supplier_items SET awarded=v_award,awarded_by=CASE WHEN v_award THEN auth.uid() END,awarded_at=CASE WHEN v_award THEN now() END,award_reason=CASE WHEN v_award THEN it->>'reason' ELSE NULL END
      WHERE id=v_id AND organization_id=_org AND quotation_id=_quotation_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Item de cotação não encontrado.'; END IF;
    ELSIF v_award THEN
      v_variant:=(it->>'variant_id')::uuid; v_supplier:=(it->>'supplier_id')::uuid;
      UPDATE public.quotation_supplier_items SET awarded=true,awarded_by=auth.uid(),awarded_at=now(),award_reason=coalesce(it->>'reason','Selecionado na cotação')
      WHERE organization_id=_org AND quotation_id=_quotation_id AND supplier_id=v_supplier AND variant_id=v_variant;
    END IF;
  END LOOP;
  UPDATE public.quotations SET status=CASE WHEN EXISTS(SELECT 1 FROM public.quotation_supplier_items WHERE quotation_id=_quotation_id AND awarded) THEN 'AWARDED' ELSE status END,updated_at=now() WHERE id=_quotation_id;
  PERFORM public.purchasing_audit(_org,'purchasing.quotation.award','quotations',_quotation_id,_data);
  RETURN jsonb_build_object('quotation_id',_quotation_id,'awarded',(SELECT count(*) FROM public.quotation_supplier_items WHERE quotation_id=_quotation_id AND awarded));
END;
$$;

CREATE FUNCTION public.quotation_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); status text:=coalesce(_filters->>'status','');
BEGIN
  PERFORM public.purchasing_require(_org,'quotations.read');
  IF _kind='quotations' THEN
    WITH rows AS MATERIALIZED(
      SELECT q.id,q.quotation_number,q.status AS st,q.deadline,q.created_at,q.purchase_request_id,pr.request_number,
        (SELECT count(DISTINCT supplier_id) FROM public.quotation_supplier_items i WHERE i.quotation_id=q.id) suppliers,
        (SELECT count(DISTINCT variant_id) FROM public.quotation_supplier_items i WHERE i.quotation_id=q.id) variants
      FROM public.quotations q LEFT JOIN public.purchase_requests pr ON pr.id=q.purchase_request_id WHERE q.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q2)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(quotation_number),query)>0) AND (status='' OR st=status) ORDER BY created_at DESC LIMIT 50 OFFSET (_page-1)*50) q2),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='quotation' THEN
    SELECT jsonb_build_object('quotation',(SELECT to_jsonb(q) FROM public.quotations q WHERE q.id=(_filters->>'id')::uuid AND q.organization_id=_org),
      'suppliers',(SELECT coalesce(jsonb_agg(s),'[]'::jsonb) FROM (SELECT qs.id,qs.supplier_id,qs.notes,c.legal_name supplier_name FROM public.quotation_suppliers qs JOIN public.supplier_profiles sp ON sp.id=qs.supplier_id JOIN public.companies c ON c.id=sp.company_id WHERE qs.quotation_id=(_filters->>'id')::uuid ORDER BY c.legal_name) s),
      'items',(SELECT coalesce(jsonb_agg(i),'[]'::jsonb) FROM (SELECT qsi.id,qsi.supplier_id,qsi.variant_id,qsi.quantity,qsi.unit_price,qsi.discount_amount,qsi.freight_amount,qsi.tax_amount,qsi.other_amount,qsi.total_amount,qsi.delivery_days,qsi.payment_terms,qsi.valid_until,qsi.awarded,qsi.award_reason,c.legal_name supplier_name,v.sku,pr.name product_name FROM public.quotation_supplier_items qsi JOIN public.supplier_profiles sp ON sp.id=qsi.supplier_id JOIN public.companies c ON c.id=sp.company_id JOIN public.product_variants v ON v.id=qsi.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE qsi.quotation_id=(_filters->>'id')::uuid ORDER BY v.sku,c.legal_name) i)) INTO result;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 19. RPCs: Pedidos de compra.
-- =====================================================================
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS cancel_reason text;
CREATE FUNCTION public.po_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v uuid:=coalesce(_id,gen_random_uuid());
  it jsonb; v_sup uuid; v_qty numeric; v_price numeric; v_line numeric;
  v_sku text; v_pu uuid; v_iu uuid; v_cf numeric; v_terms text;
  v_sub numeric; v_disc numeric; v_tax numeric; v_frete numeric; v_outro numeric;
BEGIN
  PERFORM public.purchasing_require(_org,'purchase_orders.create');
  v_sup:=(_data->>'supplier_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.supplier_profiles WHERE id=v_sup AND organization_id=_org) THEN RAISE EXCEPTION 'Fornecedor não encontrado.'; END IF;
  IF _data->'items' IS NULL OR jsonb_array_length(_data->'items')=0 THEN RAISE EXCEPTION 'Informe ao menos um item.'; END IF;
  SELECT default_payment_terms INTO v_terms FROM public.supplier_profiles WHERE id=v_sup AND organization_id=_org;
  IF _id IS NULL THEN
    INSERT INTO public.purchase_orders(organization_id,order_number,supplier_id,quotation_id,purchase_request_id,status,issue_date,expected_delivery_date,currency,payment_terms,destination_location_id,financial_category_id,cost_center_id,notes,created_by)
    VALUES(_org,'PO-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.purchase_order_seq')::text,6,'0'),v_sup,nullif(_data->>'quotation_id','')::uuid,nullif(_data->>'purchase_request_id','')::uuid,'DRAFT',coalesce(nullif(_data->>'issue_date','')::date,CURRENT_DATE),nullif(_data->>'expected_delivery_date','')::date,coalesce(nullif(_data->>'currency',''),'BRL'),coalesce(nullif(_data->>'payment_terms',''),v_terms),nullif(_data->>'destination_location_id','')::uuid,nullif(_data->>'financial_category_id','')::uuid,nullif(_data->>'cost_center_id','')::uuid,_data->>'notes',auth.uid()) RETURNING id INTO v;
    IF _data->>'purchase_request_id' IS NOT NULL THEN
      UPDATE public.purchase_requests SET status='ORDERED',updated_at=now() WHERE id=(_data->>'purchase_request_id')::uuid AND organization_id=_org AND status='APPROVED';
      UPDATE public.purchase_request_items SET status='ORDERED' WHERE purchase_request_id=(_data->>'purchase_request_id')::uuid AND organization_id=_org AND status='PENDING';
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE id=v AND organization_id=_org AND status='DRAFT') THEN RAISE EXCEPTION 'Pedido não encontrado ou não é rascunho.'; END IF;
    UPDATE public.purchase_orders SET supplier_id=v_sup,quotation_id=nullif(_data->>'quotation_id','')::uuid,purchase_request_id=nullif(_data->>'purchase_request_id','')::uuid,expected_delivery_date=nullif(_data->>'expected_delivery_date','')::date,currency=coalesce(nullif(_data->>'currency',''),currency),payment_terms=coalesce(nullif(_data->>'payment_terms',''),payment_terms),destination_location_id=nullif(_data->>'destination_location_id','')::uuid,financial_category_id=nullif(_data->>'financial_category_id','')::uuid,cost_center_id=nullif(_data->>'cost_center_id','')::uuid,notes=coalesce(_data->>'notes',notes),updated_at=now() WHERE id=v AND organization_id=_org;
    DELETE FROM public.purchase_order_items WHERE purchase_order_id=v AND status='OPEN';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_data->'items')
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=(it->>'variant_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Item inválido: variante não pertence à organização.'; END IF;
    v_qty:=(it->>'ordered_quantity')::numeric; v_price:=(it->>'unit_price')::numeric;
    IF v_qty IS NULL OR v_qty<=0 THEN RAISE EXCEPTION 'Quantidade do pedido inválida.'; END IF;
    IF v_price IS NULL OR v_price<0 THEN RAISE EXCEPTION 'Preço unitário inválido.'; END IF;
    v_sku:=NULL; v_pu:=NULL; v_iu:=NULL; v_cf:=1;
    SELECT supplier_sku,purchase_unit_id,inventory_unit_id,conversion_factor INTO v_sku,v_pu,v_iu,v_cf
      FROM public.supplier_products WHERE supplier_id=v_sup AND variant_id=(it->>'variant_id')::uuid AND organization_id=_org;
    IF NOT FOUND THEN v_cf:=1; END IF;
    v_cf:=coalesce(nullif((it->>'conversion_factor')::numeric,NULL),coalesce(v_cf,NULL),1);
    IF v_cf<=0 THEN RAISE EXCEPTION 'Fator de conversão inválido.'; END IF;
    v_pu:=coalesce(nullif((it->>'purchase_unit_id')::uuid::text,'')::uuid,v_pu);
    v_iu:=coalesce(nullif((it->>'inventory_unit_id')::uuid::text,'')::uuid,v_iu);
    v_line:=round(v_qty*v_price - coalesce((it->>'discount_amount')::numeric,0) + coalesce((it->>'tax_amount')::numeric,0),6);
    INSERT INTO public.purchase_order_items(organization_id,purchase_order_id,variant_id,supplier_sku,ordered_quantity,purchase_unit_id,inventory_unit_id,conversion_factor,unit_price,discount_amount,tax_amount,line_total,expected_delivery_date,status)
    VALUES(_org,v,(it->>'variant_id')::uuid,v_sku,v_qty,v_pu,v_iu,v_cf,v_price,coalesce((it->>'discount_amount')::numeric,0),coalesce((it->>'tax_amount')::numeric,0),v_line,nullif(it->>'expected_delivery_date','')::date,'OPEN');
  END LOOP;
  SELECT coalesce(sum(ordered_quantity*unit_price),0),coalesce(sum(discount_amount),0),coalesce(sum(tax_amount),0) INTO v_sub,v_disc,v_tax FROM public.purchase_order_items WHERE purchase_order_id=v;
  v_frete:=coalesce((_data->>'freight_amount')::numeric,0); v_outro:=coalesce((_data->>'other_amount')::numeric,0);
  IF v_frete<0 OR v_outro<0 THEN RAISE EXCEPTION 'Valores de frete e outros devem ser >= 0.'; END IF;
  UPDATE public.purchase_orders SET subtotal=v_sub,discount_amount=v_disc,tax_amount=v_tax,freight_amount=v_frete,other_amount=v_outro,
    total_amount=greatest(0,v_sub-v_disc+v_tax+v_frete+v_outro),updated_at=now() WHERE id=v;
  PERFORM public.purchasing_audit(_org,CASE WHEN _id IS NULL THEN 'purchasing.purchase_order.create' ELSE 'purchasing.purchase_order.update' END,'purchase_orders',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.po_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.purchase_orders; v_seg boolean; v_pending text;
BEGIN
  IF _action NOT IN ('submit','approve','send','cancel') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  PERFORM public.purchasing_require(_org,CASE _action WHEN 'approve' THEN 'purchase_orders.approve' WHEN 'send' THEN 'purchase_orders.send' WHEN 'cancel' THEN 'purchase_orders.cancel' ELSE 'purchase_orders.create' END);
  SELECT * INTO r FROM public.purchase_orders WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _action='submit' THEN
    IF r.status<>'DRAFT' THEN RAISE EXCEPTION 'Somente rascunhos podem ser submetidos.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=_id) THEN RAISE EXCEPTION 'Pedido sem itens.'; END IF;
    UPDATE public.purchase_orders SET status='PENDING_APPROVAL',updated_at=now() WHERE id=_id;
  ELSIF _action='approve' THEN
    IF r.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Somente pedidos pendentes podem ser aprovados.'; END IF;
    SELECT coalesce(approval_segregation,true) INTO v_seg FROM public.purchasing_settings WHERE organization_id=_org;
    IF v_seg AND r.created_by=auth.uid() THEN RAISE EXCEPTION 'Segregação de funções: não é permitido aprovar pedido criado por você.'; END IF;
    UPDATE public.purchase_orders SET status='APPROVED',approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=_id;
  ELSIF _action='send' THEN
    IF r.status<>'APPROVED' THEN RAISE EXCEPTION 'Somente pedidos aprovados podem ser enviados.'; END IF;
    UPDATE public.purchase_orders SET status='SENT',sent_at=now(),updated_at=now() WHERE id=_id;
  ELSIF _action='cancel' THEN
    IF r.status IN ('COMPLETED','CANCELED') THEN RAISE EXCEPTION 'Pedido já concluído/cancelado.'; END IF;
    IF EXISTS(SELECT 1 FROM public.goods_receipts WHERE purchase_order_id=_id AND status NOT IN ('CANCELED')) THEN RAISE EXCEPTION 'Pedido com recebimentos não pode ser cancelado.'; END IF;
    UPDATE public.purchase_orders SET status='CANCELED',cancel_reason=coalesce(_data->>'reason',''),updated_at=now() WHERE id=_id;
    UPDATE public.purchase_order_items SET status='CANCELED' WHERE purchase_order_id=_id AND status='OPEN';
    IF r.purchase_request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.purchase_orders WHERE organization_id=_org AND purchase_request_id=r.purchase_request_id AND status NOT IN ('CANCELED')) THEN
      UPDATE public.purchase_requests SET status='APPROVED',updated_at=now() WHERE id=r.purchase_request_id;
      UPDATE public.purchase_request_items SET status='PENDING' WHERE purchase_request_id=r.purchase_request_id AND status='ORDERED';
    END IF;
  END IF;
  PERFORM public.purchasing_audit(_org,'purchasing.purchase_order.'||_action,'purchase_orders',_id,_data);
  RETURN jsonb_build_object('id',_id,'status',CASE _action WHEN 'submit' THEN 'PENDING_APPROVAL' WHEN 'approve' THEN 'APPROVED' WHEN 'send' THEN 'SENT' ELSE 'CANCELED' END);
END;
$$;

CREATE FUNCTION public.po_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); st text:=coalesce(_filters->>'status',''); v_id uuid;
BEGIN
  PERFORM public.purchasing_require(_org,'purchase_orders.read');
  IF _kind='orders' THEN
    WITH rows AS MATERIALIZED(
      SELECT po.id,po.order_number,po.supplier_id,po.status,po.issue_date,po.expected_delivery_date,po.total_amount,po.currency,po.payment_terms,
        c.legal_name supplier_name,sp.supplier_code,
        (SELECT count(*) FROM public.purchase_order_items i WHERE i.purchase_order_id=po.id) items,
        (SELECT count(*) FROM public.purchase_order_items i WHERE i.purchase_order_id=po.id AND i.status='OPEN') open_items
      FROM public.purchase_orders po JOIN public.supplier_profiles sp ON sp.id=po.supplier_id JOIN public.companies c ON c.id=sp.company_id
      WHERE po.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(concat_ws(' ',order_number,supplier_name,supplier_code)),query)>0) AND (st='' OR "status"=st) ORDER BY issue_date DESC,order_number DESC LIMIT 50 OFFSET (_page-1)*50) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='order' THEN
    v_id:=(_filters->>'id')::uuid;
    result:=jsonb_build_object(
      'order',(SELECT to_jsonb(po) FROM public.purchase_orders po WHERE po.id=v_id AND po.organization_id=_org),
      'items',(SELECT coalesce(jsonb_agg(i),'[]'::jsonb) FROM (SELECT i.*,v.sku,pr.name product_name,u.code purchase_unit_code FROM public.purchase_order_items i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products pr ON pr.id=v.product_id LEFT JOIN public.units_of_measure u ON u.id=i.purchase_unit_id WHERE i.purchase_order_id=v_id ORDER BY v.sku) i),
      'receipts',(SELECT coalesce(jsonb_agg(gr),'[]'::jsonb) FROM (SELECT gr.id,gr.receipt_number,gr.status,gr.received_at,gr.total_accepted,gr.total_rejected FROM public.goods_receipts gr WHERE gr.purchase_order_id=v_id ORDER BY gr.created_at) gr));
    IF result->'order'='null' THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  ELSIF _kind='candidates' THEN
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT po.id,po.order_number,po.status,po.issue_date,po.total_amount,c.legal_name supplier_name FROM public.purchase_orders po JOIN public.supplier_profiles sp ON sp.id=po.supplier_id JOIN public.companies c ON c.id=sp.company_id WHERE po.organization_id=_org AND po.status IN ('APPROVED','SENT','RECEIVING') AND NOT EXISTS(SELECT 1 FROM public.supplier_documents sd WHERE sd.purchase_order_id=po.id AND sd.status<>'CANCELED') ORDER BY po.issue_date DESC LIMIT 50) o),'[]'::jsonb)) INTO result;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 20. Helpers de custo e financeiro do recebimento.
-- =====================================================================
CREATE FUNCTION public.purchasing_find_factor(_from_unit uuid,_to_unit uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(
   (SELECT CASE WHEN uc.from_unit_id=_from_unit AND uc.to_unit_id=_to_unit THEN uc.factor ELSE 1/uc.factor END FROM public.unit_conversions uc WHERE (uc.from_unit_id=_from_unit AND uc.to_unit_id=_to_unit) OR (uc.from_unit_id=_to_unit AND uc.to_unit_id=_from_unit) LIMIT 1),1)
$$;

CREATE FUNCTION public.purchasing_po_payable_total(_org uuid,_po_id uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(sum(original_amount),0) FROM public.account_payables WHERE organization_id=_org AND source_type='PURCHASE' AND source_id=_po_id::text AND status<>'CANCELED';
$$;

CREATE FUNCTION public.purchasing_create_payables(_org uuid,_po_id uuid,_amount numeric DEFAULT NULL) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE po public.purchase_orders; terms int[]; n int; base numeric; due date; doc text; seq bigint;
  fin uuid; dc uuid; company uuid; amt numeric; i int; cnt int:=0; v_total numeric;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id=_po_id AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF public.purchasing_po_payable_total(_org,_po_id)>0 THEN RAISE EXCEPTION 'Obrigação financeira já criada para este pedido.'; END IF;
  SELECT company_id INTO company FROM public.supplier_profiles WHERE id=po.supplier_id;
  SELECT id INTO fin FROM public.financial_categories WHERE organization_id=_org ORDER BY name LIMIT 1;
  dc:=po.cost_center_id; IF dc IS NULL THEN SELECT id INTO dc FROM public.cost_centers WHERE organization_id=_org ORDER BY name LIMIT 1; END IF;
  v_total:=coalesce(_amount,po.total_amount);
  terms:=public.purchasing_split_terms(coalesce(po.payment_terms,'0'));
  n:=array_length(terms,1); IF n IS NULL OR n<=0 THEN n:=1; END IF;
  base:=round(v_total/n,2);
  FOR i IN 1..n LOOP
    seq:=nextval('public.purchase_payable_seq');
    doc:='CMP-'||to_char(po.issue_date,'YYYY')||'-'||lpad(seq::text,6,'0')||'/'||i;
    amt:=CASE WHEN i<n THEN base ELSE round(v_total-base*(n-1),2) END;
    due:=po.issue_date + (CASE WHEN i<=n THEN terms[i] ELSE 0 END);
    INSERT INTO public.account_payables(organization_id,company_id,source_type,source_id,source_status,document_number,description,issue_date,due_date,original_amount,open_amount,currency,financial_category_id,cost_center_id,notes,created_by,installment_number,total_installments)
    VALUES(_org,company,'PURCHASE',_po_id::text,'ACTIVE',doc,'Pedido de compra '||po.order_number||' - parcela '||i||'/'||n,po.issue_date,due,amt,amt,po.currency,fin,dc,po.notes,auth.uid(),i,n);
    cnt:=cnt+1;
  END LOOP;
  PERFORM public.purchasing_audit(_org,'purchasing.payables.create','purchase_orders',_po_id,jsonb_build_object('installments',cnt,'total',v_total));
  RETURN cnt;
END;
$$;

CREATE FUNCTION public.purchasing_create_payable_doc(_org uuid,_doc_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE doc public.supplier_documents; company uuid; fin uuid; dc uuid; seq bigint; pay uuid;
BEGIN
  SELECT * INTO doc FROM public.supplier_documents WHERE id=_doc_id AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;
  SELECT company_id INTO company FROM public.supplier_profiles WHERE id=doc.supplier_id;
  SELECT id INTO fin FROM public.financial_categories WHERE organization_id=_org ORDER BY name LIMIT 1;
  SELECT id INTO dc FROM public.cost_centers WHERE organization_id=_org ORDER BY name LIMIT 1;
  seq:=nextval('public.purchase_payable_seq');
  INSERT INTO public.account_payables(organization_id,company_id,source_type,source_id,source_status,document_number,description,issue_date,due_date,original_amount,open_amount,currency,financial_category_id,cost_center_id,notes,created_by,installment_number,total_installments)
  VALUES(_org,company,'SUPPLIER_DOCUMENT',_doc_id::text,'ACTIVE','CMP-'||to_char(doc.issue_date,'YYYY')||'-'||lpad(seq::text,6,'0')||'/1','Documento de fornecedor '||doc.document_type||' '||doc.document_number,doc.issue_date,doc.issue_date,doc.total_amount,doc.total_amount,coalesce((SELECT currency FROM public.companies c WHERE c.id=company),'BRL'),fin,dc,doc.notes,auth.uid(),1,1)
  RETURNING id INTO pay;
  PERFORM public.purchasing_audit(_org,'purchasing.payables.create_doc','supplier_documents',_doc_id,jsonb_build_object('payable',pay,'total',doc.total_amount));
  RETURN pay;
END;
$$;

-- Aplica a política de custo após o recebimento (LAST_PURCHASE gravado como a
-- versão corrente; AVERAGE grava a média ponderada do histórico de recebimentos;
-- STANDARD/NONE não sobrescrevem o custo padrão).
CREATE FUNCTION public.purchasing_apply_cost_policy(_org uuid,_variant uuid,_inv_unit uuid,_date date,_qty_inv numeric,_cost_inv numeric,_receipt_number text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pol text; v_ver integer; v_last date; v_avg numeric; v_cur numeric;
BEGIN
  INSERT INTO public.purchase_receipt_costs(organization_id,variant_id,goods_receipt_id,effective_date,quantity,unit_cost,total_value)
  VALUES(_org,_variant,(SELECT id FROM public.goods_receipts WHERE organization_id=_org AND receipt_number=_receipt_number),_date,_qty_inv,_cost_inv,round(_qty_inv*_cost_inv,6)) ON CONFLICT(organization_id,goods_receipt_id,variant_id) DO NOTHING;
  SELECT acquisition_cost_policy INTO v_pol FROM public.purchasing_settings WHERE organization_id=_org;
  IF v_pol IS NULL THEN v_pol:='LAST_PURCHASE'; END IF;
  IF _variant IS NULL THEN RETURN; END IF;
  IF v_pol='AVERAGE' THEN
    SELECT sum(quantity*unit_cost)/nullif(sum(quantity),0) INTO v_avg FROM public.purchase_receipt_costs WHERE organization_id=_org AND variant_id=_variant;
    _cost_inv:=coalesce(v_avg,_cost_inv);
  END IF;
  IF v_pol IN ('LAST_PURCHASE','AVERAGE') AND _inv_unit IS NOT NULL THEN
    SELECT max(version)+1,max(effective_from) INTO v_ver,v_last FROM public.material_cost_versions WHERE organization_id=_org AND variant_id=_variant;
    SELECT unit_cost INTO v_cur FROM public.material_cost_versions WHERE organization_id=_org AND variant_id=_variant AND status='ACTIVE' LIMIT 1;
    IF v_cur IS DISTINCT FROM _cost_inv AND (v_last IS NULL OR _date>v_last) THEN
      UPDATE public.material_cost_versions SET status='SUPERSEDED',effective_to=_date WHERE organization_id=_org AND variant_id=_variant AND status='ACTIVE';
      INSERT INTO public.material_cost_versions(organization_id,variant_id,version,unit_of_measure_id,unit_cost,effective_from,source_type,source_reference,created_by,status)
      VALUES(_org,_variant,coalesce(v_ver,1),_inv_unit,_cost_inv,_date,'PURCHASE',_receipt_number,auth.uid(),'ACTIVE');
      UPDATE public.supplier_products sp SET last_price=(SELECT pu.unit_price FROM public.purchase_order_items pu WHERE pu.variant_id=_variant AND pu.purchase_order_id=(SELECT purchase_order_id FROM public.goods_receipts WHERE organization_id=_org AND receipt_number=_receipt_number) ORDER BY pu.created_at DESC LIMIT 1),last_price_date=_date
      WHERE sp.organization_id=_org AND sp.variant_id=_variant;
    END IF;
  END IF;
END;
$$;

-- =====================================================================
-- 21. RPCs: Recebimento de mercadorias.
-- =====================================================================
CREATE FUNCTION public.po_receive(_org uuid,_po_id uuid,_data jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v uuid; v_po public.purchase_orders; it jsonb; v_item record; v_qty numeric; v_unit numeric; v_unit_cost numeric; v_line numeric;
  v_req_qty numeric;
BEGIN
  PERFORM public.purchasing_require(_org,'goods_receipts.create');
  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_po FROM public.purchase_orders WHERE id=_po_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF v_po.status NOT IN ('APPROVED','SENT','RECEIVING') THEN RAISE EXCEPTION 'Pedido não pode ser recebido no status % .',v_po.status; END IF;
  INSERT INTO public.goods_receipts(organization_id,receipt_number,purchase_order_id,supplier_id,destination_location_id,received_at,received_by,status,supplier_document_number,notes)
  VALUES(_org,'GR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.goods_receipt_seq')::text,6,'0'),_po_id,v_po.supplier_id,coalesce(nullif(_data->>'destination_location_id','')::uuid,v_po.destination_location_id),coalesce(nullif(_data->>'received_at','')::date,CURRENT_DATE),auth.uid(),'DRAFT',_data->>'supplier_document_number',_data->>'notes') RETURNING id INTO v;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_data->'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('variant_id',i.variant_id,'quantity',i.ordered_quantity-i.received_quantity)),'[]'::jsonb) FROM public.purchase_order_items i WHERE i.purchase_order_id=_po_id AND i.status IN ('OPEN','PARTIALLY_RECEIVED'))))
  LOOP
    v_req_qty:=(it->>'quantity')::numeric;
    SELECT i.*,i.ordered_quantity-i.received_quantity AS remaining INTO v_item FROM public.purchase_order_items i WHERE i.purchase_order_id=_po_id AND i.variant_id=(it->>'variant_id')::uuid AND organization_id=_org AND i.status IN ('OPEN','PARTIALLY_RECEIVED');
    IF NOT FOUND THEN RAISE EXCEPTION 'Item do pedido não encontrado para a variante fornecida.'; END IF;
    IF v_req_qty IS NULL OR v_req_qty<=0 THEN RAISE EXCEPTION 'Quantidade inválida para recebimento.'; END IF;
    IF v_req_qty > v_item.remaining THEN
      IF (SELECT over_receipt_policy FROM public.purchasing_settings WHERE organization_id=_org)='BLOCK' AND NOT public.has_permission(_org,'purchase_exceptions.resolve') THEN
        v_req_qty:=v_item.remaining;
      END IF;
    END IF;
    v_unit_cost:=v_item.unit_price; v_line:=round(v_req_qty*v_unit_cost,6);
    INSERT INTO public.goods_receipt_items(organization_id,goods_receipt_id,purchase_order_item_id,variant_id,received_quantity,accepted_quantity,inventory_unit_id,purchase_unit_id,conversion_factor,unit_cost,line_total,status)
    VALUES(_org,v,v_item.id,v_item.variant_id,v_req_qty,v_req_qty,v_item.inventory_unit_id,v_item.purchase_unit_id,coalesce(v_item.conversion_factor,1),v_unit_cost,v_line,'ACCEPTED');
  END LOOP;
  UPDATE public.goods_receipts SET total_received=coalesce((SELECT sum(received_quantity) FROM public.goods_receipt_items WHERE goods_receipt_id=v),0),
    total_accepted=coalesce((SELECT sum(accepted_quantity) FROM public.goods_receipt_items WHERE goods_receipt_id=v),0) WHERE id=v;
  UPDATE public.purchase_orders SET status='RECEIVING',updated_at=now() WHERE id=_po_id;
  PERFORM public.purchasing_audit(_org,'purchasing.purchase_order.receive','goods_receipts',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.receipt_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r public.goods_receipts; it jsonb; v_item record; v_remaining numeric; v_cap numeric; v_allowed boolean;
  v_pool numeric; v_extra numeric; v_pol text; v_cf numeric; v_qty_inv numeric; v_money numeric; v_cost_inv numeric; v_unit text:='un';
  v_po_status text; v_events int:=0;
  v_placed integer:=0;
  v_polpay text;
  po public.purchase_orders;
BEGIN
  IF _action NOT IN ('inspect','post','cancel') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  PERFORM public.purchasing_require(_org,CASE _action WHEN 'post' THEN 'goods_receipts.post' WHEN 'cancel' THEN 'goods_receipts.cancel' ELSE 'goods_receipts.inspect' END);
  PERFORM public.inventory_lock(_org);
  SELECT * INTO r FROM public.goods_receipts WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento não encontrado.'; END IF;

  IF _action='inspect' THEN
    IF r.status NOT IN ('DRAFT','UNDER_INSPECTION') THEN RAISE EXCEPTION 'Somente recebimentos pendentes de inspeção podem ser inspecionados.'; END IF;
    SELECT over_receipt_policy INTO v_pol FROM public.purchasing_settings WHERE organization_id=_org;
    IF v_pol IS NULL THEN v_pol:='BLOCK'; END IF;
    v_allowed:=v_pol<>'BLOCK' OR public.has_permission(_org,'purchase_exceptions.resolve');
    FOR it IN SELECT * FROM jsonb_array_elements(_data->'items')
    LOOP
      SELECT * INTO v_item FROM public.goods_receipt_items WHERE id=(it->>'item_id')::uuid AND goods_receipt_id=_id AND organization_id=_org FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Item de recebimento não encontrado.'; END IF;
      v_cap:=coalesce((it->>'accepted_quantity')::numeric,v_item.received_quantity);
      IF v_cap<0 THEN RAISE EXCEPTION 'Quantidade aceita negativa.'; END IF;
      IF v_cap>v_item.received_quantity THEN RAISE EXCEPTION 'Quantidade aceita não pode exceder a recebida.'; END IF;
      SELECT i.ordered_quantity-i.received_quantity INTO v_remaining
        FROM public.purchase_order_items i WHERE i.id=v_item.purchase_order_item_id AND i.organization_id=_org;
      IF v_cap>v_remaining AND NOT v_allowed THEN
        v_cap:=v_remaining;
        INSERT INTO public.purchase_exceptions(organization_id,exception_type,severity,status,purchase_order_id,purchase_order_item_id,goods_receipt_id,variant_id,message,details)
        VALUES(_org,'OVER_RECEIPT','WARNING','OPEN',r.purchase_order_id,v_item.purchase_order_item_id,_id,v_item.variant_id,'Quantidade recebida acima do pedido foi limitada automaticamente.',jsonb_build_object('requested',coalesce((it->>'accepted_quantity')::numeric,v_item.received_quantity),'capped',v_remaining));
      ELSIF v_cap>v_remaining THEN
        INSERT INTO public.purchase_exceptions(organization_id,exception_type,severity,status,purchase_order_id,purchase_order_item_id,goods_receipt_id,variant_id,message,details)
        VALUES(_org,'OVER_RECEIPT','WARNING','OPEN',r.purchase_order_id,v_item.purchase_order_item_id,_id,v_item.variant_id,'Excesso de recebimento em relação ao pedido autorizado.',jsonb_build_object('requested',v_cap,'ordered',v_remaining));
      END IF;
      UPDATE public.goods_receipt_items SET accepted_quantity=v_cap,
        rejected_quantity=greatest(0,v_item.received_quantity-v_cap),
        reason=coalesce((it->>'reason')::text,reason),
        status=CASE WHEN v_cap>0 THEN 'ACCEPTED' ELSE 'REJECTED' END,
        line_total=round(v_cap*unit_cost,6) WHERE id=v_item.id;
    END LOOP;
    UPDATE public.goods_receipts SET total_accepted=coalesce((SELECT sum(accepted_quantity) FROM public.goods_receipt_items WHERE goods_receipt_id=_id),0),
      total_rejected=coalesce((SELECT sum(rejected_quantity) FROM public.goods_receipt_items WHERE goods_receipt_id=_id),0),
      total_received=coalesce((SELECT sum(received_quantity) FROM public.goods_receipt_items WHERE goods_receipt_id=_id),0),
      status=CASE WHEN coalesce((SELECT sum(accepted_quantity) FROM public.goods_receipt_items WHERE goods_receipt_id=_id),0)>0 THEN 'ACCEPTED' ELSE 'REJECTED' END,
      updated_at=now() WHERE id=_id;
    PERFORM public.purchasing_audit(_org,'purchasing.goods_receipt.inspect','goods_receipts',_id,_data);
    RETURN jsonb_build_object('id',_id,'status',CASE WHEN EXISTS(SELECT 1 FROM public.goods_receipt_items WHERE goods_receipt_id=_id AND accepted_quantity>0) THEN 'ACCEPTED' ELSE 'REJECTED' END);

  ELSIF _action='post' THEN
    IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE organization_id=_org AND reference_type='GOODS_RECEIPT' AND reference_id=_id) THEN RAISE EXCEPTION 'Recebimento já postado.'; END IF;
    IF r.status NOT IN ('ACCEPTED','REJECTED') THEN RAISE EXCEPTION 'Recebimento precisa ser inspecionado antes da postagem.'; END IF;
    SELECT * INTO po FROM public.purchase_orders WHERE id=r.purchase_order_id AND organization_id=_org;
    SELECT sum(accepted_quantity*unit_cost) INTO v_pool FROM public.goods_receipt_items WHERE goods_receipt_id=_id;
    SELECT freight_policy,payable_on INTO v_pol,v_polpay FROM public.purchasing_settings WHERE organization_id=_org;
    IF v_pol IS NULL THEN v_pol:='EXPENSE_SEPARATELY'; END IF;
    IF v_polpay IS NULL THEN v_polpay:='GOODS_RECEIPT'; END IF;
    v_extra:=CASE WHEN v_pol='INCLUDE_IN_INVENTORY_COST' THEN po.freight_amount ELSE 0 END;
    IF coalesce(r.destination_location_id,po.destination_location_id) IS NULL THEN RAISE EXCEPTION 'Informe a localização de destino do recebimento.'; END IF;
    FOR v_item IN SELECT gi.*,i.variant_id vid FROM public.goods_receipt_items gi JOIN public.purchase_order_items i ON i.id=gi.purchase_order_item_id WHERE gi.goods_receipt_id=_id
    LOOP
      IF v_item.accepted_quantity<=0 THEN CONTINUE; END IF;
      v_cf:=coalesce(v_item.conversion_factor,1);
      v_qty_inv:=round(v_item.accepted_quantity*v_cf,3);
      v_money:=round(v_item.accepted_quantity*v_item.unit_cost + CASE WHEN v_pool>0 AND v_extra>0 THEN v_extra*(v_item.accepted_quantity*v_item.unit_cost)/v_pool ELSE 0 END,6);
      v_cost_inv:=round(v_money/v_qty_inv,6);
      v_unit:='un';
      INSERT INTO public.inventory_movements(organization_id,variant_id,location_id,batch_id,movement_type,direction,quantity,unit,reference_type,reference_id,reason,occurred_at,created_by,status,idempotency_key,source)
      VALUES(_org,v_item.vid,coalesce(r.destination_location_id,po.destination_location_id),v_item.batch_id,'PURCHASE_RECEIPT','IN',v_qty_inv,v_unit,'GOODS_RECEIPT',_id,CASE WHEN v_item.status='REJECTED' THEN 'Item recebido e rejeitado na inspeção' ELSE 'Recebimento de compra' END,now(),auth.uid(),'POSTED','PURCHASING:GR:'||_id||':'||v_item.id::text,'PURCHASING');
      PERFORM public.purchasing_apply_cost_policy(_org,v_item.vid,v_item.inventory_unit_id,r.received_at,v_qty_inv,v_cost_inv,r.receipt_number);
      UPDATE public.purchase_order_items SET received_quantity=received_quantity+v_item.accepted_quantity,
        status=CASE WHEN received_quantity+v_item.accepted_quantity>=ordered_quantity THEN 'RECEIVED' ELSE 'PARTIALLY_RECEIVED' END
        WHERE id=v_item.purchase_order_item_id;
    END LOOP;
    UPDATE public.goods_receipts SET status='POSTED',posted_by=auth.uid(),posted_at=now(),updated_at=now() WHERE id=_id;
    IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=r.purchase_order_id AND status IN ('OPEN','PARTIALLY_RECEIVED')) THEN
      UPDATE public.purchase_orders SET status='COMPLETED',completed_at=now(),updated_at=now() WHERE id=r.purchase_order_id;
      IF po.purchase_request_id IS NOT NULL THEN
        UPDATE public.purchase_request_items SET status='CANCELLED' WHERE purchase_request_id=po.purchase_request_id AND status='ORDERED' AND variant_id IN (SELECT variant_id FROM public.purchase_order_items WHERE purchase_order_id=r.purchase_order_id AND status='RECEIVED');
      END IF;
    ELSE
      UPDATE public.purchase_orders SET status='RECEIVING',updated_at=now() WHERE id=r.purchase_order_id;
    END IF;
    IF v_polpay='GOODS_RECEIPT' AND public.purchasing_po_payable_total(_org,r.purchase_order_id)=0 THEN PERFORM public.purchasing_create_payables(_org,r.purchase_order_id); END IF;
    IF public.has_permission(_org,'purchasing.read') THEN
      INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload)
      VALUES(_org,'purchasing.receipt.posted','PURCHASING','purchasing:receipt:'||_id::text,jsonb_build_object('receipt_id',_id,'purchase_order_id',r.purchase_order_id,'total_accepted',r.total_accepted))
      ON CONFLICT DO NOTHING;
    END IF;
    PERFORM public.purchasing_audit(_org,'purchasing.goods_receipt.post','goods_receipts',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','POSTED');

  ELSE -- cancel
    IF r.status IN ('POSTED','CANCELED') THEN RAISE EXCEPTION 'Recebimento postado/cancelado não pode ser cancelado.'; END IF;
    UPDATE public.goods_receipts SET status='CANCELED',updated_at=now() WHERE id=_id;
    IF NOT EXISTS(SELECT 1 FROM public.goods_receipts WHERE purchase_order_id=r.purchase_order_id AND status NOT IN ('CANCELED')) THEN
      UPDATE public.purchase_orders SET status=CASE WHEN sent_at IS NOT NULL THEN 'SENT' ELSE 'APPROVED' END,updated_at=now() WHERE id=r.purchase_order_id;
    END IF;
    PERFORM public.purchasing_audit(_org,'purchasing.goods_receipt.cancel','goods_receipts',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','CANCELED');
  END IF;
END;
$$;

CREATE FUNCTION public.receipt_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); st text:=coalesce(_filters->>'status',''); v_id uuid;
BEGIN
  PERFORM public.purchasing_require(_org,'goods_receipts.read');
  IF _kind='receipts' THEN
    WITH rows AS MATERIALIZED(
      SELECT gr.id,gr.receipt_number,gr.purchase_order_id,gr.supplier_id,gr.status,gr.received_at,gr.total_received,gr.total_accepted,gr.total_rejected,gr.supplier_document_number,
        po.order_number,c.legal_name supplier_name,
        (SELECT count(*) FROM public.goods_receipt_items i WHERE i.goods_receipt_id=gr.id) items
      FROM public.goods_receipts gr JOIN public.purchase_orders po ON po.id=gr.purchase_order_id JOIN public.supplier_profiles sp ON sp.id=gr.supplier_id JOIN public.companies c ON c.id=sp.company_id
      WHERE gr.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(concat_ws(' ',receipt_number,order_number,supplier_name)),query)>0) AND (st='' OR "status"=st) ORDER BY received_at DESC,receipt_number DESC LIMIT 50 OFFSET (_page-1)*50) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='receipt' THEN
    v_id:=(_filters->>'id')::uuid;
    result:=jsonb_build_object(
      'receipt',(SELECT to_jsonb(gr) FROM public.goods_receipts gr WHERE gr.id=v_id AND gr.organization_id=_org),
      'order',(SELECT to_jsonb(po) FROM public.purchase_orders po WHERE po.id=(SELECT purchase_order_id FROM public.goods_receipts WHERE id=v_id)),
      'items',(SELECT coalesce(jsonb_agg(i),'[]'::jsonb) FROM (SELECT gi.*,v.sku,pr.name product_name,CASE WHEN gi.accepted_quantity>0 THEN round(gi.line_total/gi.accepted_quantity,6) ELSE gi.unit_cost END effective_unit_cost FROM public.goods_receipt_items gi JOIN public.product_variants v ON v.id=gi.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE gi.goods_receipt_id=v_id ORDER BY v.sku) i));
    IF result->'receipt'='null' THEN RAISE EXCEPTION 'Recebimento não encontrado.'; END IF;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 22. RPCs: Devolução a fornecedor.
-- =====================================================================
CREATE FUNCTION public.return_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid()); it jsonb; v_qty numeric;
BEGIN
  PERFORM public.purchasing_require(_org,'supplier_returns.create');
  IF _data->'items' IS NULL OR jsonb_array_length(_data->'items')=0 THEN RAISE EXCEPTION 'Informe ao menos um item.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.supplier_profiles WHERE id=(_data->>'supplier_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Fornecedor não encontrado.'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.supplier_returns(organization_id,return_number,supplier_id,goods_receipt_id,source_location_id,status,return_date,reason,created_by)
    VALUES(_org,'RET-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.supplier_return_seq')::text,6,'0'),(_data->>'supplier_id')::uuid,nullif(_data->>'goods_receipt_id','')::uuid,nullif(_data->>'source_location_id','')::uuid,'DRAFT',coalesce(nullif(_data->>'return_date','')::date,CURRENT_DATE),_data->>'reason',auth.uid()) RETURNING id INTO v;
  ELSE
    UPDATE public.supplier_returns SET return_date=coalesce(nullif(_data->>'return_date','')::date,return_date),reason=coalesce(_data->>'reason',reason),updated_at=now() WHERE id=v AND organization_id=_org AND status='DRAFT';
    IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada ou já encerrada.'; END IF;
    DELETE FROM public.supplier_return_items WHERE supplier_return_id=v;
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_data->'items')
  LOOP
    IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=(it->>'variant_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Item inválido.'; END IF;
    v_qty:=(it->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty<=0 THEN RAISE EXCEPTION 'Quantidade de devolução inválida.'; END IF;
    INSERT INTO public.supplier_return_items(organization_id,supplier_return_id,variant_id,quantity,batch_id,reason)
    VALUES(_org,v,(it->>'variant_id')::uuid,v_qty,nullif(it->>'batch_id','')::uuid,it->>'reason');
  END LOOP;
  PERFORM public.purchasing_audit(_org,CASE WHEN _id IS NULL THEN 'purchasing.supplier_return.create' ELSE 'purchasing.supplier_return.update' END,'supplier_returns',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.return_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.supplier_returns; it record; v_bal numeric; v_unit text:='un';
BEGIN
  IF _action NOT IN ('post','cancel') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  PERFORM public.purchasing_require(_org,CASE WHEN _action='post' THEN 'supplier_returns.post' ELSE 'supplier_returns.cancel' END);
  PERFORM public.inventory_lock(_org);
  SELECT * INTO r FROM public.supplier_returns WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada.'; END IF;
  IF _action='post' THEN
    IF r.status<>'DRAFT' THEN RAISE EXCEPTION 'Somente devoluções em rascunho podem ser postadas.'; END IF;
    IF r.source_location_id IS NULL THEN RAISE EXCEPTION 'Informe a localização de origem.'; END IF;
    FOR it IN SELECT * FROM public.supplier_return_items sri WHERE sri.supplier_return_id=_id
    LOOP
      v_bal:=public.inventory_get_balance(_org,it.variant_id,r.source_location_id,it.batch_id,auth.uid());
      IF v_bal IS NULL THEN RAISE EXCEPTION 'Sem acesso ao saldo de estoque.'; END IF;
      IF v_bal < it.quantity THEN RAISE EXCEPTION 'Saldo insuficiente para devolução da variante.'; END IF;
      v_unit:='un';
      INSERT INTO public.inventory_movements(organization_id,variant_id,location_id,batch_id,movement_type,direction,quantity,unit,reference_type,reference_id,reason,occurred_at,created_by,status,idempotency_key,source)
      VALUES(_org,it.variant_id,r.source_location_id,it.batch_id,'PURCHASE_RETURN','OUT',it.quantity,v_unit,'SUPPLIER_RETURN',_id,coalesce(nullif(it.reason,''),'Devolução a fornecedor'),now(),auth.uid(),'POSTED','PURCHASING:SR:'||_id||':'||it.id::text,'PURCHASING');
    END LOOP;
    UPDATE public.supplier_returns SET status='POSTED',posted_by=auth.uid(),posted_at=now(),updated_at=now() WHERE id=_id;
    IF r.goods_receipt_id IS NOT NULL AND public.has_permission(_org,'purchasing.read') THEN
      INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload)
      VALUES(_org,'purchasing.return.posted','PURCHASING','purchasing:return:'||_id::text,jsonb_build_object('return_id',_id,'goods_receipt_id',r.goods_receipt_id))
      ON CONFLICT DO NOTHING;
    END IF;
    PERFORM public.purchasing_audit(_org,'purchasing.supplier_return.post','supplier_returns',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','POSTED');
  ELSE
    IF r.status='POSTED' THEN RAISE EXCEPTION 'Devolução postada não pode ser cancelada.'; END IF;
    UPDATE public.supplier_returns SET status='CANCELED',updated_at=now() WHERE id=_id;
    PERFORM public.purchasing_audit(_org,'purchasing.supplier_return.cancel','supplier_returns',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','CANCELED');
  END IF;
END;
$$;

CREATE FUNCTION public.return_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); st text:=coalesce(_filters->>'status',''); v_id uuid;
BEGIN
  PERFORM public.purchasing_require(_org,'supplier_returns.read');
  IF _kind='returns' THEN
    WITH rows AS MATERIALIZED(
      SELECT sr.id,sr.return_number,sr.supplier_id,sr.status,sr.return_date,sr.goods_receipt_id,sr.source_location_id,sr.reason,
        c.legal_name supplier_name,gr.receipt_number,
        (SELECT count(*) FROM public.supplier_return_items i WHERE i.supplier_return_id=sr.id) items,
        (SELECT coalesce(sum(i.quantity),0) FROM public.supplier_return_items i WHERE i.supplier_return_id=sr.id) total_qty
      FROM public.supplier_returns sr JOIN public.supplier_profiles sp ON sp.id=sr.supplier_id JOIN public.companies c ON c.id=sp.company_id LEFT JOIN public.goods_receipts gr ON gr.id=sr.goods_receipt_id
      WHERE sr.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(concat_ws(' ',return_number,supplier_name)),query)>0) AND (st='' OR "status"=st) ORDER BY return_date DESC,return_number DESC LIMIT 50 OFFSET (_page-1)*50) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='return' THEN
    v_id:=(_filters->>'id')::uuid;
    result:=jsonb_build_object('return',(SELECT to_jsonb(sr) FROM public.supplier_returns sr WHERE sr.id=v_id AND sr.organization_id=_org),
      'items',(SELECT coalesce(jsonb_agg(i),'[]'::jsonb) FROM (SELECT sri.*,v.sku,pr.name product_name FROM public.supplier_return_items sri JOIN public.product_variants v ON v.id=sri.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE sri.supplier_return_id=v_id ORDER BY v.sku) i));
    IF result->'return'='null' THEN RAISE EXCEPTION 'Devolução não encontrada.'; END IF;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 23. RPCs: Documentos de fornecedor e o 3-way match.
-- =====================================================================
CREATE FUNCTION public.document_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid());
BEGIN
  PERFORM public.purchasing_require(_org,'supplier_documents.create');
  IF NOT EXISTS(SELECT 1 FROM public.supplier_profiles WHERE id=(_data->>'supplier_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Fornecedor não encontrado.'; END IF;
  IF nullif(trim(_data->>'document_number'),'') IS NULL THEN RAISE EXCEPTION 'Número do documento obrigatório.'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.supplier_documents(organization_id,supplier_id,document_type,document_number,issue_date,total_amount,quantity,purchase_order_id,goods_receipt_id,status,storage_path,notes,created_by)
    VALUES(_org,(_data->>'supplier_id')::uuid,coalesce(_data->>'document_type','INVOICE'),trim(_data->>'document_number'),coalesce(nullif(_data->>'issue_date','')::date,CURRENT_DATE),coalesce((_data->>'total_amount')::numeric,0),nullif((_data->>'quantity')::numeric,NULL),nullif(_data->>'purchase_order_id','')::uuid,nullif(_data->>'goods_receipt_id','')::uuid,'DRAFT',_data->>'storage_path',_data->>'notes',auth.uid()) RETURNING id INTO v;
  ELSE
    UPDATE public.supplier_documents SET issue_date=coalesce(nullif(_data->>'issue_date','')::date,issue_date),total_amount=coalesce((_data->>'total_amount')::numeric,total_amount),quantity=coalesce(nullif((_data->>'quantity')::numeric,NULL),quantity),purchase_order_id=coalesce(nullif(_data->>'purchase_order_id','')::uuid,purchase_order_id),goods_receipt_id=coalesce(nullif(_data->>'goods_receipt_id','')::uuid,goods_receipt_id),storage_path=coalesce(_data->>'storage_path',storage_path),notes=coalesce(_data->>'notes',notes),updated_at=now() WHERE id=v AND organization_id=_org AND status IN ('DRAFT','EXCEPTION');
    IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado ou já conciliado.'; END IF;
  END IF;
  PERFORM public.purchasing_audit(_org,CASE WHEN _id IS NULL THEN 'purchasing.supplier_document.create' ELSE 'purchasing.supplier_document.update' END,'supplier_documents',v,_data);
  RETURN v;
END;
$$;

CREATE FUNCTION public.document_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.supplier_documents; v_po uuid; v_base numeric; v_qty_rec numeric; v_qty_doc numeric;
  v_ratio numeric; v_blocking boolean:=false; v_pay_on text; v_exist numeric;
BEGIN
  IF _action NOT IN ('match','process','cancel') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  PERFORM public.purchasing_require(_org,CASE _action WHEN 'process' THEN 'supplier_documents.process' WHEN 'cancel' THEN 'supplier_documents.cancel' ELSE 'supplier_documents.create' END);
  PERFORM public.inventory_lock(_org);
  SELECT * INTO r FROM public.supplier_documents WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;

  IF _action='match' THEN
    IF r.status NOT IN ('DRAFT','EXCEPTION') THEN RAISE EXCEPTION 'Documento precisa estar como rascunho para conciliação.'; END IF;
    v_po:=r.purchase_order_id;
    IF v_po IS NULL AND r.goods_receipt_id IS NOT NULL THEN
      SELECT purchase_order_id INTO v_po FROM public.goods_receipts WHERE id=r.goods_receipt_id AND organization_id=_org;
    END IF;
    IF v_po IS NULL THEN RAISE EXCEPTION 'Documento sem pedido de compra não pode ser conciliado.'; END IF;
    SELECT total_amount INTO v_base FROM public.purchase_orders WHERE id=v_po AND organization_id=_org;
    v_base:=coalesce(v_base,0);
    SELECT coalesce(sum(accepted_quantity),0) INTO v_qty_rec
      FROM public.goods_receipt_items gi JOIN public.goods_receipts gr ON gr.id=gi.goods_receipt_id
      WHERE gr.purchase_order_id=v_po AND gi.organization_id=_org AND gr.status='POSTED';
    v_qty_doc:=coalesce(r.quantity, v_qty_rec);
    IF v_qty_doc IS NOT NULL AND abs(v_qty_doc-v_qty_rec)>greatest(1e-9, v_qty_rec*0.0001) THEN
      INSERT INTO public.purchase_exceptions(organization_id,exception_type,severity,status,purchase_order_id,purchase_order_item_id,goods_receipt_id,supplier_document_id,variant_id,message,details)
      VALUES(_org,'QUANTITY_VARIANCE','WARNING','OPEN',v_po,NULL,r.goods_receipt_id,_id,NULL,'Divergência de quantidade entre documento e recebimento.',jsonb_build_object('document',v_qty_doc,'received',v_qty_rec));
    END IF;
    IF v_base>0 THEN
      v_ratio:=abs(r.total_amount-v_base)/v_base;
      IF v_ratio>0.005 THEN
        v_blocking:=true;
        INSERT INTO public.purchase_exceptions(organization_id,exception_type,severity,status,purchase_order_id,purchase_order_item_id,goods_receipt_id,supplier_document_id,variant_id,message,details)
        VALUES(_org,'PRICE_VARIANCE','BLOCKING','OPEN',v_po,NULL,r.goods_receipt_id,_id,NULL,'Diferença significativa entre fatura e pedido.',jsonb_build_object('document_amount',r.total_amount,'po_amount',v_base,'delta',round(r.total_amount-v_base,2)));
      ELSIF v_ratio>0 THEN
        INSERT INTO public.purchase_exceptions(organization_id,exception_type,severity,status,purchase_order_id,purchase_order_item_id,goods_receipt_id,supplier_document_id,variant_id,message,details)
        VALUES(_org,'PRICE_VARIANCE','WARNING','OPEN',v_po,NULL,r.goods_receipt_id,_id,NULL,'Pequena diferença entre fatura e pedido.',jsonb_build_object('document_amount',r.total_amount,'po_amount',v_base,'delta',round(r.total_amount-v_base,2)));
      END IF;
    END IF;
    UPDATE public.supplier_documents SET purchase_order_id=v_po,status=CASE WHEN EXISTS(SELECT 1 FROM public.purchase_exceptions WHERE supplier_document_id=_id AND severity='BLOCKING' AND status IN ('OPEN','IN_REVIEW')) THEN 'EXCEPTION' ELSE 'MATCHED' END,updated_at=now() WHERE id=_id;
    PERFORM public.purchasing_audit(_org,'purchasing.supplier_document.match','supplier_documents',_id,_data);
    RETURN jsonb_build_object('id',_id,'status',CASE WHEN EXISTS(SELECT 1 FROM public.purchase_exceptions WHERE supplier_document_id=_id AND severity='BLOCKING' AND status IN ('OPEN','IN_REVIEW')) THEN 'EXCEPTION' ELSE 'MATCHED' END);

  ELSIF _action='process' THEN
    IF r.status<>'MATCHED' THEN RAISE EXCEPTION 'Documento precisa estar conciliado para processamento (resolva exceções bloqueantes).'; END IF;
    IF r.purchase_order_id IS NOT NULL THEN
      v_exist:=public.purchasing_po_payable_total(_org,r.purchase_order_id);
      IF v_exist=0 THEN
        PERFORM public.purchasing_create_payables(_org,r.purchase_order_id,r.total_amount);
      ELSIF abs(v_exist-r.total_amount)>greatest(1e-2,v_exist*0.005) THEN
        INSERT INTO public.purchase_exceptions(organization_id,exception_type,severity,status,purchase_order_id,goods_receipt_id,supplier_document_id,message,details)
        VALUES(_org,'PRICE_VARIANCE','WARNING','OPEN',r.purchase_order_id,r.goods_receipt_id,_id,'Fatura diverge do valor já contabilizado.',jsonb_build_object('payable',v_exist,'document',r.total_amount));
      END IF;
    ELSE
      PERFORM public.purchasing_create_payable_doc(_org,_id);
    END IF;
    UPDATE public.supplier_documents SET status='PROCESSED',processed_at=now(),updated_at=now() WHERE id=_id;
    IF public.has_permission(_org,'purchasing.read') THEN
      INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload)
      VALUES(_org,'purchasing.document.processed','PURCHASING','purchasing:document:'||_id::text,jsonb_build_object('document_id',_id,'total_amount',r.total_amount))
      ON CONFLICT DO NOTHING;
    END IF;
    PERFORM public.purchasing_audit(_org,'purchasing.supplier_document.process','supplier_documents',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','PROCESSED');

  ELSE
    IF r.status IN ('PROCESSED','CANCELED') THEN RAISE EXCEPTION 'Documento já processado/cancelado.'; END IF;
    UPDATE public.supplier_documents SET status='CANCELED',updated_at=now() WHERE id=_id;
    PERFORM public.purchasing_audit(_org,'purchasing.supplier_document.cancel','supplier_documents',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','CANCELED');
  END IF;
END;
$$;

CREATE FUNCTION public.document_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; query text:=lower(coalesce(_filters->>'query','')); st text:=coalesce(_filters->>'status',''); v_id uuid;
BEGIN
  PERFORM public.purchasing_require(_org,'supplier_documents.read');
  IF _kind='documents' THEN
    WITH rows AS MATERIALIZED(
      SELECT sd.id,sd.supplier_id,sd.document_type,sd.document_number,sd.issue_date,sd.total_amount,sd.quantity,sd.purchase_order_id,sd.goods_receipt_id,sd.status,
        c.legal_name supplier_name,po.order_number,
        (SELECT count(*) FROM public.purchase_exceptions ex WHERE ex.supplier_document_id=sd.id AND ex.status IN ('OPEN','IN_REVIEW')) open_exceptions
      FROM public.supplier_documents sd JOIN public.supplier_profiles sp ON sp.id=sd.supplier_id JOIN public.companies c ON c.id=sp.company_id LEFT JOIN public.purchase_orders po ON po.id=sd.purchase_order_id
      WHERE sd.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(concat_ws(' ',document_number,supplier_name,order_number)),query)>0) AND (st='' OR "status"=st) ORDER BY issue_date DESC,document_number DESC LIMIT 50 OFFSET (_page-1)*50) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='document' THEN
    v_id:=(_filters->>'id')::uuid;
    result:=jsonb_build_object('document',(SELECT to_jsonb(sd) FROM public.supplier_documents sd WHERE sd.id=v_id AND sd.organization_id=_org),
      'exceptions',(SELECT coalesce(jsonb_agg(ex),'[]'::jsonb) FROM (SELECT ex.* FROM public.purchase_exceptions ex WHERE ex.supplier_document_id=v_id ORDER BY ex.created_at) ex));
    IF result->'document'='null' THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 24. RPCs: Central de exceções.
-- =====================================================================
CREATE FUNCTION public.exception_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.purchase_exceptions;
BEGIN
  IF _action NOT IN ('resolve','ignore','reopen') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  PERFORM public.purchasing_require(_org,'purchase_exceptions.resolve');
  SELECT * INTO r FROM public.purchase_exceptions WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exceção não encontrada.'; END IF;
  IF _action='reopen' THEN
    IF r.status NOT IN ('RESOLVED','IGNORED_WITH_AUTHORIZATION') THEN RAISE EXCEPTION 'Somente exceções resolvidas podem ser reabertas.'; END IF;
    UPDATE public.purchase_exceptions SET status='OPEN',resolved_by=NULL,resolved_at=NULL,resolution_notes=NULL,updated_at=now() WHERE id=_id;
    PERFORM public.purchasing_audit(_org,'purchasing.exception.reopen','purchase_exceptions',_id,_data);
    RETURN jsonb_build_object('id',_id,'status','OPEN');
  ELSE
    IF r.status NOT IN ('OPEN','IN_REVIEW') THEN RAISE EXCEPTION 'Exceção já resolvida/fechada.'; END IF;
    IF _action='resolve' THEN
      IF nullif(trim(_data->>'resolution_notes'),'') IS NULL THEN RAISE EXCEPTION 'Notas de resolução obrigatórias.'; END IF;
      UPDATE public.purchase_exceptions SET status='RESOLVED',resolved_by=auth.uid(),resolved_at=now(),resolution_notes=_data->>'resolution_notes',updated_at=now() WHERE id=_id;
      IF r.supplier_document_id IS NOT NULL AND r.severity='BLOCKING' AND NOT EXISTS(SELECT 1 FROM public.purchase_exceptions WHERE supplier_document_id=r.supplier_document_id AND severity='BLOCKING' AND status IN ('OPEN','IN_REVIEW')) THEN
        UPDATE public.supplier_documents SET status='MATCHED',updated_at=now() WHERE id=r.supplier_document_id;
      END IF;
      PERFORM public.purchasing_audit(_org,'purchasing.exception.resolve','purchase_exceptions',_id,_data);
      RETURN jsonb_build_object('id',_id,'status','RESOLVED');
    ELSE
      UPDATE public.purchase_exceptions SET status='IGNORED_WITH_AUTHORIZATION',resolved_by=auth.uid(),resolved_at=now(),resolution_notes=coalesce(_data->>'resolution_notes','Ignorado com autorização.'),updated_at=now() WHERE id=_id;
      PERFORM public.purchasing_audit(_org,'purchasing.exception.ignore','purchase_exceptions',_id,_data);
      RETURN jsonb_build_object('id',_id,'status','IGNORED_WITH_AUTHORIZATION');
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.exception_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; st text:=coalesce(_filters->>'status',''); etype text:=coalesce(_filters->>'exception_type','');
BEGIN
  PERFORM public.purchasing_require(_org,'purchase_exceptions.read');
  IF _kind='exceptions' THEN
    WITH rows AS MATERIALIZED(
      SELECT ex.id,ex.exception_type,ex.severity,ex.status,ex.purchase_order_id,ex.purchase_order_item_id,ex.goods_receipt_id,ex.supplier_document_id,ex.variant_id,ex.message,ex.created_at,
        po.order_number,gr.receipt_number,sd.document_number,v.sku
      FROM public.purchase_exceptions ex
      LEFT JOIN public.purchase_orders po ON po.id=ex.purchase_order_id LEFT JOIN public.goods_receipts gr ON gr.id=ex.goods_receipt_id
      LEFT JOIN public.supplier_documents sd ON sd.id=ex.supplier_document_id LEFT JOIN public.product_variants v ON v.id=ex.variant_id
      WHERE ex.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows WHERE (st='' OR "status"=st) AND (etype='' OR exception_type=etype) ORDER BY created_at DESC LIMIT 100 OFFSET (_page-1)*100) q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='open' THEN
    SELECT jsonb_build_object('count',(SELECT count(*) FROM public.purchase_exceptions WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW')),
      'blocking',(SELECT count(*) FROM public.purchase_exceptions WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW') AND severity='BLOCKING')) INTO result;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

-- =====================================================================
-- 25. RPC: Reposição (sugestões de compra).
-- =====================================================================
CREATE FUNCTION public.replenishment_query(_org uuid,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; v_months int:=greatest(1,coalesce((nullif(_filters->>'months',''))::int,3));
BEGIN
  PERFORM public.purchasing_require(_org,'purchase_requests.read');
  WITH cfg AS MATERIALIZED(
    SELECT v.id variant_id,v.sku,pr.name product_name,v.minimum_stock,v.reorder_point,v.target_stock,v.replenishment_policy,
      coalesce(public.inventory_get_balance(v.organization_id,v.id,NULL,NULL,auth.uid()),0) available,
      coalesce((SELECT sum(poi.ordered_quantity-poi.received_quantity) FROM public.purchase_order_items poi WHERE poi.variant_id=v.id AND poi.organization_id=_org AND poi.status IN ('OPEN','PARTIALLY_RECEIVED')),0) open_qty,
      coalesce((SELECT sum(pri.quantity) FROM public.purchase_request_items pri WHERE pri.variant_id=v.id AND pri.organization_id=_org AND pri.status='PENDING'),0) pending_req,
      coalesce((SELECT sum(m.quantity) FROM public.inventory_movements m WHERE m.variant_id=v.id AND m.organization_id=_org AND m.status='POSTED' AND m.direction='OUT' AND m.movement_type IN ('SALE','PRODUCTION_CONSUMPTION','PARTNER_SHIPMENT','LOSS') AND m.occurred_at>=now()-make_interval(months=>v_months)),0) consumption,
      coalesce((SELECT min(sp.lead_time_days) FROM public.supplier_products sp WHERE sp.variant_id=v.id AND sp.organization_id=_org AND sp.lead_time_days IS NOT NULL),0) lead_days,
      coalesce((SELECT sp.last_price FROM public.supplier_products sp WHERE sp.variant_id=v.id AND sp.organization_id=_org AND sp.status='ACTIVE' ORDER BY sp.last_price_date DESC NULLS LAST LIMIT 1),0) last_price
    FROM public.product_variants v JOIN public.products pr ON pr.id=v.product_id
    WHERE v.organization_id=_org AND v.status='ACTIVE' AND v.replenishment_policy<>'MANUAL')
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT variant_id,sku,product_name,replenishment_policy,minimum_stock,reorder_point,target_stock,available,
      open_qty,pending_req,round(consumption/v_months,3) monthly_pace,lead_days,last_price,
      suggested_quantity,CASE WHEN lead_days>0 AND consumption>0 THEN ceil((consumption/v_months)*lead_days/30.0) ELSE 0 END lead_buffer,
      round((suggested_quantity+(CASE WHEN lead_days>0 AND consumption>0 THEN ceil((consumption/v_months)*lead_days/30.0) ELSE 0 END))*last_price,2) estimated_cost,
      (suggested_quantity + CASE WHEN lead_days>0 AND consumption>0 THEN ceil((consumption/v_months)*lead_days/30.0) ELSE 0 END)>0 recommend_order
    FROM (
      SELECT cfg.*,
        CASE cfg.replenishment_policy
          WHEN 'TARGET_STOCK' THEN greatest(0,coalesce(cfg.target_stock,0)-(cfg.available+cfg.open_qty+cfg.pending_req))
          WHEN 'REORDER_POINT' THEN CASE WHEN (cfg.available+cfg.open_qty+cfg.pending_req)<=coalesce(cfg.reorder_point,cfg.minimum_stock,0)
              THEN greatest(0,coalesce(cfg.minimum_stock,cfg.reorder_point,0)-(cfg.available+cfg.open_qty+cfg.pending_req)) ELSE 0 END
          ELSE 0 END suggested_quantity
      FROM cfg
    ) x ORDER BY recommend_order DESC,product_name LIMIT 200 OFFSET (_page-1)*200) x),'[]'::jsonb),
    'total',(SELECT count(*) FROM cfg)) INTO result;
  RETURN result;
END;
$$;

-- =====================================================================
-- 26. RPCs: visão geral e configurações.
-- =====================================================================
CREATE FUNCTION public.purchasing_query(_org uuid,_kind text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.purchasing_require(_org,'purchasing.dashboard');
  IF _kind='dashboard' THEN
    SELECT jsonb_build_object(
      'active_suppliers',(SELECT count(*) FROM public.supplier_profiles WHERE organization_id=_org AND status='ACTIVE'),
      'open_requests',(SELECT count(*) FROM public.purchase_requests WHERE organization_id=_org AND status='SUBMITTED'),
      'pending_approval',(SELECT count(*) FROM public.purchase_orders WHERE organization_id=_org AND status='PENDING_APPROVAL'),
      'open_orders',(SELECT count(*) FROM public.purchase_orders WHERE organization_id=_org AND status IN ('APPROVED','SENT','RECEIVING')),
      'orders_amount',(SELECT coalesce(sum(total_amount),0) FROM public.purchase_orders WHERE organization_id=_org AND status IN ('APPROVED','SENT','RECEIVING')),
      'receipts_today',(SELECT count(*) FROM public.goods_receipts WHERE organization_id=_org AND received_at=CURRENT_DATE AND status<>'CANCELED'),
      'open_exceptions',(SELECT count(*) FROM public.purchase_exceptions WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW')),
      'replenishment_candidates',(SELECT count(*) FROM public.product_variants v WHERE v.organization_id=_org AND v.status='ACTIVE' AND v.replenishment_policy<>'MANUAL' AND v.minimum_stock>0 AND inventory_get_balance(v.organization_id,v.id,NULL,NULL)<v.minimum_stock)) INTO result;
  ELSIF _kind='settings' THEN
    PERFORM public.purchasing_ensure_settings(_org);
    SELECT jsonb_build_object('settings',to_jsonb(s)) INTO result FROM public.purchasing_settings s WHERE s.organization_id=_org;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.purchasing_settings_save(_org uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.purchasing_require(_org,'suppliers.manage');
  PERFORM public.purchasing_ensure_settings(_org);
  UPDATE public.purchasing_settings SET
    acquisition_cost_policy=coalesce(_data->>'acquisition_cost_policy',acquisition_cost_policy),
    freight_policy=coalesce(_data->>'freight_policy',freight_policy),
    over_receipt_policy=coalesce(_data->>'over_receipt_policy',over_receipt_policy),
    payable_on=coalesce(_data->>'payable_on',payable_on),
    approval_segregation=coalesce((_data->>'approval_segregation')::boolean,approval_segregation),
    updated_by=auth.uid(),updated_at=now()
    WHERE organization_id=_org;
  PERFORM public.purchasing_audit(_org,'purchasing.settings.update','purchasing_settings',_org,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('updated',true);
END;
$$;

-- =====================================================================
-- 27. Triggers de integridade dos dados de compra.
-- =====================================================================
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['supplier_profiles','supplier_products','purchase_requests','purchase_request_items','quotations','quotation_suppliers','quotation_supplier_items','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items','supplier_returns','supplier_return_items','supplier_documents','purchase_exceptions'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS purchasing_guard_relations ON public.%I',t);
  EXECUTE format('CREATE TRIGGER purchasing_guard_relations BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.purchasing_guard_relations()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['purchase_orders','goods_receipts','goods_receipt_items','supplier_returns','supplier_documents'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS purchasing_immutable ON public.%I',t);
  EXECUTE format('CREATE TRIGGER purchasing_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.purchasing_immutable()',t);
 END LOOP;
END $$;

-- =====================================================================
-- 28. Libera as RPCs para o cliente autenticado.
-- =====================================================================
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['supplier_save_company','supplier_product_save','supplier_query','request_save','request_action','request_query',
  'quotation_save','quotation_award','quotation_query','po_save','po_action','po_query','purchasing_create_payables','purchasing_create_payable_doc',
  'purchasing_apply_cost_policy','purchasing_po_payable_total','po_receive','receipt_action','receipt_query',
  'return_save','return_action','return_query','document_save','document_action','document_query',
  'exception_action','exception_query','replenishment_query','purchasing_query','purchasing_settings_save','purchasing_ensure_settings',
  'purchasing_split_terms','purchasing_audit','purchasing_require','purchasing_guard_relations','purchasing_immutable','purchasing_find_factor'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC,anon',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO authenticated,service_role',f);
 END LOOP;
END $$;

COMMIT;