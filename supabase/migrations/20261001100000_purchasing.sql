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

--@@@PART_B