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
    (direction = 'IN'  AND movement_type IN (
      'OPENING_BALANCE','PURCHASE_RECEIPT','PRODUCTION_OUTPUT','SALE_RETURN',
      'PARTNER_SHIPMENT','PARTNER_RETURN','TRANSFER_IN','ADJUSTMENT_IN','MANUAL_CORRECTION','REVERSAL'))
    OR
    (direction = 'OUT' AND movement_type IN (
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
SELECT r,p FROM unnest(ARRAY['admin','gestor']) r CROSS JOIN unnest(ARRAY[
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
SELECT r,p FROM unnest(ARRAY['comercial']) r CROSS JOIN unnest(ARRAY[
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
SELECT r,p FROM unnest(ARRAY['estoque']) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard',
  'suppliers.read',
  'purchase_requests.read','purchase_orders.read',
  'goods_receipts.read','goods_receipts.create','goods_receipts.inspect','goods_receipts.post','goods_receipts.cancel',
  'supplier_returns.read','supplier_returns.create','supplier_returns.post',
  'supplier_documents.read','purchase_exceptions.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['financeiro']) r CROSS JOIN unnest(ARRAY[
  'purchasing.read','purchasing.dashboard','suppliers.read','purchase_requests.read','purchase_orders.read',
  'goods_receipts.read','supplier_documents.read','purchase_exceptions.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['producao','marketplace']) r CROSS JOIN unnest(ARRAY[
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
    WHEN 'supplier_profiles' THEN ARRAY[['company_id','companies']]
    WHEN 'supplier_products' THEN ARRAY[['supplier_id','supplier_profiles'],['variant_id','product_variants'],['purchase_unit_id','units_of_measure'],['inventory_unit_id','units_of_measure']]
    WHEN 'purchase_requests' THEN ARRAY[['cost_center_id','cost_centers']]
    WHEN 'purchase_request_items' THEN ARRAY[['variant_id','product_variants'],['unit_of_measure_id','units_of_measure']]
    WHEN 'quotations' THEN ARRAY[['purchase_request_id','purchase_requests']]
    WHEN 'quotation_suppliers' THEN ARRAY[['quotation_id','quotations'],['supplier_id','supplier_profiles']]
    WHEN 'quotation_supplier_items' THEN ARRAY[['quotation_id','quotations'],['supplier_id','supplier_profiles'],['variant_id','product_variants'],['unit_of_measure_id','units_of_measure']]
    WHEN 'purchase_orders' THEN ARRAY[['supplier_id','supplier_profiles'],['quotation_id','quotations'],['purchase_request_id','purchase_requests'],['destination_location_id','inventory_locations'],['financial_category_id','financial_categories'],['cost_center_id','cost_centers']]
    WHEN 'purchase_order_items' THEN ARRAY[['purchase_order_id','purchase_orders'],['variant_id','product_variants'],['purchase_unit_id','units_of_measure'],['inventory_unit_id','units_of_measure']]
    WHEN 'goods_receipts' THEN ARRAY[['purchase_order_id','purchase_orders'],['supplier_id','supplier_profiles'],['destination_location_id','inventory_locations']]
    WHEN 'goods_receipt_items' THEN ARRAY[['goods_receipt_id','goods_receipts'],['purchase_order_item_id','purchase_order_items'],['variant_id','product_variants'],['purchase_unit_id','units_of_measure'],['inventory_unit_id','units_of_measure'],['batch_id','inventory_batches']]
    WHEN 'supplier_returns' THEN ARRAY[['supplier_id','supplier_profiles'],['goods_receipt_id','goods_receipts'],['source_location_id','inventory_locations']]
    WHEN 'supplier_return_items' THEN ARRAY[['supplier_return_id','supplier_returns'],['variant_id','product_variants'],['batch_id','inventory_batches']]
    WHEN 'supplier_documents' THEN ARRAY[['supplier_id','supplier_profiles'],['purchase_order_id','purchase_orders'],['goods_receipt_id','goods_receipts']]
    WHEN 'purchase_exceptions' THEN ARRAY[['purchase_order_id','purchase_orders'],['purchase_order_item_id','purchase_order_items'],['goods_receipt_id','goods_receipts'],['supplier_document_id','supplier_documents'],['variant_id','product_variants']]
    ELSE ARRAY[]::text[]
  END
  LOOP
    v_id:=(v_data->>v_pair[1])::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
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
        nullif(regexp_replace(_data->>'delivery_days'||'', '[^0-9]','','g'),'')::int,nullif(it->>'delivery_days',''),it->>'payment_terms',nullif(it->>'valid_until','')::date,it->>'notes');
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
      SELECT q.id,q.quotation_number,q.status,q.deadline,q.created_at,q.purchase_request_id,pr.request_number,
        (SELECT count(DISTINCT supplier_id) FROM public.quotation_supplier_items i WHERE i.quotation_id=q.id) suppliers,
        (SELECT count(DISTINCT variant_id) FROM public.quotation_supplier_items i WHERE i.quotation_id=q.id) variants
      FROM public.quotations q LEFT JOIN public.purchase_requests pr ON pr.id=q.purchase_request_id WHERE q.organization_id=_org)
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q2)) FROM (SELECT * FROM rows WHERE (query='' OR strpos(lower(quotation_number),query)>0) AND (status='' OR status=status) ORDER BY created_at DESC LIMIT 50 OFFSET (_page-1)*50) q2),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
  ELSIF _kind='quotation' THEN
    SELECT jsonb_build_object('quotation',(SELECT to_jsonb(q) FROM public.quotations q WHERE q.id=(_filters->>'id')::uuid AND q.organization_id=_org),
      'suppliers',(SELECT coalesce(jsonb_agg(s),'[]'::jsonb) FROM (SELECT qs.id,qs.supplier_id,qs.notes,c.legal_name supplier_name FROM public.quotation_suppliers qs JOIN public.supplier_profiles sp ON sp.id=qs.supplier_id JOIN public.companies c ON c.id=sp.company_id WHERE qs.quotation_id=(_filters->>'id')::uuid ORDER BY c.legal_name) s),
      'items',(SELECT coalesce(jsonb_agg(i),'[]'::jsonb) FROM (SELECT qsi.id,qsi.supplier_id,qsi.variant_id,qsi.quantity,qsi.unit_price,qsi.discount_amount,qsi.freight_amount,qsi.tax_amount,qsi.other_amount,qsi.total_amount,qsi.delivery_days,qsi.payment_terms,qsi.valid_until,qsi.awarded,qsi.award_reason,c.legal_name supplier_name,v.sku,pr.name product_name FROM public.quotation_supplier_items qsi JOIN public.supplier_profiles sp ON sp.id=qsi.supplier_id JOIN public.companies c ON c.id=sp.company_id JOIN public.product_variants v ON v.id=qsi.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE qsi.quotation_id=(_filters->>'id')::uuid ORDER BY v.sku,c.legal_name) i)) INTO result;
  ELSE RAISE EXCEPTION 'Consulta inválida.'; END IF;
  RETURN result;
END;
$$;

--@@@PART_C