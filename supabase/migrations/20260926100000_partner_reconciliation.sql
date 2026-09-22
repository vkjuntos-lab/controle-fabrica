-- MASTER 007: Reconciliação de Parceiros, Vendas, Estoque e preparação do Fechamento.
-- Remessa (MASTER 006) ≠ venda; venda importada não é automaticamente reconciliada;
-- uma venda reconciliada gera NO MÁXIMO uma baixa (idempotência + índice único);
-- fechamento CLOSED é histórico/imutável; MASTER 007 termina no fechamento comercial.
-- Nenhum dado financeiro/cobrança/fiscal é criado aqui (próximo domínio).
BEGIN;

-- =====================================================================
-- 1. Marketplace: infraestrutura mínima de domínio (lojas, vendas, mapping,
--    imports). O pipeline completo de upload/importação é o MASTER 005, que
--    não existe neste checkout; estas tabelas são a camada de dados que o
--    MASTER 007 exige para funcionar de verdade e ficam rastreáveis
--    (MarketplaceSale -> Import -> Arquivo via import_id/import_key).
-- =====================================================================
CREATE TABLE public.marketplace_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  name text NOT NULL CHECK(length(trim(name))>0),
  marketplace text NOT NULL DEFAULT 'MERCADO_LIVRE' CHECK(length(trim(marketplace))>0),
  marketplace_store_id text,
  ownership_type text NOT NULL DEFAULT 'PARTNER' CHECK(ownership_type IN ('FACTORY','OWN','PARTNER')),
  partner_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','BLOCKED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  updated_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,code),
  UNIQUE(organization_id,id),
  UNIQUE NULLS NOT DISTINCT(organization_id,marketplace_store_id),
  CHECK(ownership_type<>'PARTNER' OR partner_id IS NOT NULL),
  FOREIGN KEY(organization_id,partner_id) REFERENCES public.partner_profiles(organization_id,id)
);
CREATE INDEX marketplace_stores_partner ON public.marketplace_stores(organization_id,partner_id) WHERE partner_id IS NOT NULL;

CREATE TABLE public.marketplace_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  provider text NOT NULL CHECK(length(trim(provider))>0),
  file_name text,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','VALIDATED','PARTIAL','FAILED','CANCELED')),
  total_rows integer NOT NULL DEFAULT 0 CHECK(total_rows>=0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK(valid_rows>=0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK(invalid_rows>=0),
  notes text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),UNIQUE(organization_id,provider,file_name)
);

CREATE TABLE public.marketplace_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  import_id uuid NOT NULL,
  row_number integer NOT NULL CHECK(row_number>0),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IMPORTED','SKIPPED','ERROR')),
  error_message text,
  marketplace_sale_id uuid,
  UNIQUE(organization_id,id),UNIQUE(organization_id,import_id,row_number),
  FOREIGN KEY(organization_id,import_id) REFERENCES public.marketplace_imports(organization_id,id)
);

CREATE TABLE public.marketplace_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  store_id uuid NOT NULL,
  sale_date date NOT NULL,
  external_order_id text NOT NULL CHECK(length(trim(external_order_id))>0),
  external_sku text NOT NULL CHECK(length(trim(external_sku))>0),
  external_event_id text,
  variant_id uuid,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<100000000000),
  gross_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(gross_amount>=0),
  shipping_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK(shipping_fee>=0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  platform_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK(platform_fee>=0),
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'IMPORTED' CHECK(status IN ('IMPORTED','VALIDATED','RECONCILED','CANCELED','EXCEPTION')),
  import_key text,
  import_id uuid,
  source text NOT NULL DEFAULT 'MANUAL',
  reconciliation_item_id uuid,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  UNIQUE NULLS NOT DISTINCT(organization_id,store_id,external_event_id),
  CHECK(quantity>0),
  FOREIGN KEY(organization_id,store_id) REFERENCES public.marketplace_stores(organization_id,id)
);
CREATE INDEX marketplace_sales_org_date ON public.marketplace_sales(organization_id,sale_date DESC,id);
CREATE INDEX marketplace_sales_store ON public.marketplace_sales(organization_id,store_id,status);
CREATE INDEX marketplace_sales_status ON public.marketplace_sales(organization_id,status,variant_id);

CREATE TABLE public.external_sku_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  store_id uuid,
  external_sku text NOT NULL CHECK(length(trim(external_sku))>0),
  variant_id uuid NOT NULL,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  UNIQUE NULLS NOT DISTINCT(organization_id,store_id,external_sku)
);

-- =====================================================================
-- 2. Tabelas de preço (regra comercial vence; DECIMAL, nunca float).
-- =====================================================================
CREATE TABLE public.price_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  name text NOT NULL CHECK(length(trim(name))>0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  notes text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code),UNIQUE(organization_id,id),
  CHECK(valid_to IS NULL OR valid_to>=valid_from)
);
CREATE TABLE public.price_table_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  price_table_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  unit_price numeric(14,2) NOT NULL CHECK(unit_price>0),
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  UNIQUE(organization_id,id),
  UNIQUE NULLS NOT DISTINCT(organization_id,price_table_id,variant_id),
  CHECK(valid_to IS NULL OR valid_to>=valid_from),
  FOREIGN KEY(organization_id,price_table_id) REFERENCES public.price_tables(organization_id,id)
);
CREATE TABLE public.partner_price_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  partner_id uuid NOT NULL,
  price_table_id uuid NOT NULL,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  notes text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,partner_id),
  CHECK(valid_to IS NULL OR valid_to>=valid_from),
  FOREIGN KEY(organization_id,partner_id) REFERENCES public.partner_profiles(organization_id,id),
  FOREIGN KEY(organization_id,price_table_id) REFERENCES public.price_tables(organization_id,id)
);

-- =====================================================================
-- 3. Reconciliação de parceiros (fechamento comercial).
-- =====================================================================
CREATE TABLE public.partner_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  partner_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  frequency text NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('WEEKLY','BIWEEKLY','MONTHLY','CUSTOM')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN
    ('DRAFT','PROCESSING','REVIEW_REQUIRED','READY_TO_CLOSE','CLOSED','REOPENED','CANCELED')),
  sales_count integer NOT NULL DEFAULT 0 CHECK(sales_count>=0),
  units_sold numeric(14,3) NOT NULL DEFAULT 0 CHECK(units_sold>=0),
  gross_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(gross_amount>=0),
  billable_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(billable_amount>=0),
  exceptions_count integer NOT NULL DEFAULT 0 CHECK(exceptions_count>=0),
  cutoff_at timestamptz,
  notes text,
  snapshot jsonb,
  created_by uuid REFERENCES public.profiles,
  reviewed_by uuid REFERENCES public.profiles,
  reviewed_at timestamptz,
  closed_by uuid REFERENCES public.profiles,
  closed_at timestamptz,
  reopened_by uuid REFERENCES public.profiles,
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),CHECK(period_start<=period_end),
  FOREIGN KEY(organization_id,partner_id) REFERENCES public.partner_profiles(organization_id,id)
);
CREATE INDEX partner_reconcil_org_status ON public.partner_reconciliations(organization_id,status,period_start DESC);
CREATE INDEX partner_reconcil_partner ON public.partner_reconciliations(organization_id,partner_id,period_start DESC);

CREATE TABLE public.partner_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  reconciliation_id uuid NOT NULL,
  marketplace_sale_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  store_id uuid NOT NULL,
  variant_id uuid,
  quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<100000000000),
  gross_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(gross_amount>=0),
  unit_reference_value numeric(14,2),
  billable_amount numeric(14,2),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VALIDATED','RECONCILED','EXCEPTION','REVERSED','CANCELED')),
  exception_status text CHECK(exception_status IN ('PARTNER_NOT_MAPPED','PARTNER_LOCATION_NOT_CONFIGURED','SKU_NOT_MAPPED',
    'INSUFFICIENT_PARTNER_STOCK','PRICE_NOT_FOUND','DUPLICATE_SALE','STORE_PARTNER_MISMATCH','INVENTORY_EFFECT_FAILED','OTHER')),
  inventory_effect_status text NOT NULL DEFAULT 'NONE' CHECK(inventory_effect_status IN ('NONE','APPLIED','FAILED','REVERSED')),
  inventory_movement_id uuid,
  reversed_movement_id uuid,
  price_snapshot jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  UNIQUE NULLS NOT DISTINCT(organization_id,marketplace_sale_id),
  FOREIGN KEY(organization_id,reconciliation_id) REFERENCES public.partner_reconciliations(organization_id,id),
  FOREIGN KEY(organization_id,partner_id) REFERENCES public.partner_profiles(organization_id,id),
  FOREIGN KEY(organization_id,store_id) REFERENCES public.marketplace_stores(organization_id,id),
  CHECK(quantity>0)
);
CREATE INDEX partner_reconcil_item_reconcil ON public.partner_reconciliation_items(organization_id,reconciliation_id,status);

CREATE TABLE public.reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  reconciliation_id uuid,
  item_id uuid,
  marketplace_sale_id uuid,
  partner_id uuid,
  store_id uuid,
  variant_id uuid,
  exception_type text NOT NULL CHECK(exception_type IN ('PARTNER_NOT_MAPPED','PARTNER_LOCATION_NOT_CONFIGURED','SKU_NOT_MAPPED',
    'INSUFFICIENT_PARTNER_STOCK','PRICE_NOT_FOUND','DUPLICATE_SALE','ALREADY_RECONCILED','INVALID_QUANTITY','INVALID_DATE',
    'STORE_PARTNER_MISMATCH','INVENTORY_EFFECT_FAILED','COMMERCIAL_RULE_ERROR','LATE_SALE_AFTER_CLOSING')),
  severity text NOT NULL DEFAULT 'ERROR' CHECK(severity IN ('INFO','WARNING','ERROR','BLOCKING')),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','IGNORED_WITH_AUTHORIZATION')),
  message text NOT NULL CHECK(length(trim(message))>0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_type text CHECK(resolution_type IN ('MANUAL','SUPPLY_MOVEMENT','REPROCESS','IGNORED_BY_ADMIN')),
  resolution_notes text,
  resolved_by uuid REFERENCES public.profiles,
  resolved_at timestamptz,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id)
);
CREATE INDEX recon_exceptions_status ON public.reconciliation_exceptions(organization_id,status,severity);
CREATE INDEX recon_exceptions_reconcil ON public.reconciliation_exceptions(reconciliation_id);

CREATE TABLE public.partner_reconciliation_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  reconciliation_id uuid NOT NULL,
  adjustment_type text NOT NULL CHECK(adjustment_type IN ('CREDIT','DEBIT')),
  amount numeric(14,2) NOT NULL CHECK(amount>=0),
  reason text NOT NULL CHECK(length(trim(reason))>0),
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,reconciliation_id) REFERENCES public.partner_reconciliations(organization_id,id)
);

-- Evento de domínio (outbox) para o próximo domínio (financeiro/cobrança).
CREATE TABLE public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  event_type text NOT NULL CHECK(length(trim(event_type))>0),
  event_source text NOT NULL DEFAULT 'RECONCILIATION',
  event_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),UNIQUE(organization_id,event_key)
);

CREATE INDEX partner_reconciliation_items_org_variant ON public.partner_reconciliation_items(organization_id,variant_id);

-- =====================================================================
-- 4. RLS + grants: leitura por permissão; escrita somente via RPC.
-- =====================================================================
DO $$ DECLARE t text; perm text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketplace_stores','marketplace_imports','marketplace_import_rows','marketplace_sales','external_sku_mappings'] LOOP
  perm:='marketplace.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['partner_reconciliations','partner_reconciliation_items','reconciliation_exceptions','partner_reconciliation_adjustments','domain_events'] LOOP
  perm:='reconciliation.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['price_tables','price_table_items','partner_price_links'] LOOP
  perm:='partner_pricing.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
END $$;

-- =====================================================================
-- 5. Permissões novas do MASTER 007.
-- =====================================================================
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor','estoque','comercial','financeiro','marketplace','producao']) r
 CROSS JOIN unnest(ARRAY['reconciliation.read','marketplace.read','partner_pricing.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor','estoque']) r CROSS JOIN unnest(ARRAY[
 'reconciliation.create','reconciliation.process','reconciliation.review','reconciliation.resolve_exception',
 'reconciliation.close','reconciliation.reopen','reconciliation.reverse','partner_pricing.manage','marketplace.manage']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['financeiro']) r CROSS JOIN unnest(ARRAY[
 'reconciliation.review','reconciliation.close']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['marketplace']) r CROSS JOIN unnest(ARRAY[
 'marketplace.manage','reconciliation.create','reconciliation.process']) p ON CONFLICT DO NOTHING;

-- =====================================================================
-- 6. Guards de integridade e imutabilidade (padrão partners/inventory).
-- =====================================================================
CREATE FUNCTION public.reconciliation_require(_org uuid,_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Sem permissão: %.',_permission; END IF; END;
$$;
CREATE FUNCTION public.reconciliation_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context) VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;

CREATE FUNCTION public.reconciliation_guard_relations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_data jsonb:=to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico não pode ser excluído.'; END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY CASE TG_TABLE_NAME
    WHEN 'marketplace_stores' THEN ARRAY[['partner_id','partner_profiles']]
    WHEN 'marketplace_sales' THEN ARRAY[['store_id','marketplace_stores'],['variant_id','product_variants'],['import_id','marketplace_imports'],['reconciliation_item_id','partner_reconciliation_items']]
    WHEN 'marketplace_import_rows' THEN ARRAY[['import_id','marketplace_imports'],['marketplace_sale_id','marketplace_sales']]
    WHEN 'external_sku_mappings' THEN ARRAY[['store_id','marketplace_stores'],['variant_id','product_variants']]
    WHEN 'partner_reconciliations' THEN ARRAY[['partner_id','partner_profiles']]
    WHEN 'partner_reconciliation_items' THEN ARRAY[['reconciliation_id','partner_reconciliations'],['marketplace_sale_id','marketplace_sales'],['partner_id','partner_profiles'],['store_id','marketplace_stores'],['variant_id','product_variants'],['inventory_movement_id','inventory_movements'],['reversed_movement_id','inventory_movements']]
    WHEN 'reconciliation_exceptions' THEN ARRAY[['reconciliation_id','partner_reconciliations'],['item_id','partner_reconciliation_items'],['marketplace_sale_id','marketplace_sales'],['partner_id','partner_profiles'],['store_id','marketplace_stores'],['variant_id','product_variants']]
    WHEN 'partner_reconciliation_adjustments' THEN ARRAY[['reconciliation_id','partner_reconciliations']]
    WHEN 'price_table_items' THEN ARRAY[['price_table_id','price_tables'],['variant_id','product_variants']]
    WHEN 'partner_price_links' THEN ARRAY[['partner_id','partner_profiles'],['price_table_id','price_tables']]
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
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketplace_stores','marketplace_sales','marketplace_imports','marketplace_import_rows','external_sku_mappings',
  'price_tables','price_table_items','partner_price_links','partner_reconciliations','partner_reconciliation_items',
  'reconciliation_exceptions','partner_reconciliation_adjustments','domain_events'] LOOP
  EXECUTE format('CREATE TRIGGER reconciliation_tenant_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reconciliation_guard_relations()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.reconciliation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW); jold jsonb:=to_jsonb(OLD);
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico não pode ser excluído.'; END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  IF TG_TABLE_NAME='marketplace_sales' THEN
    IF OLD.status='RECONCILED' THEN RAISE EXCEPTION 'Venda reconcileida consolidada: corrija pelo estorno da reconciliação.'; END IF;
    IF NEW.status='RECONCILED' AND NEW.reconciliation_item_id IS NOT NULL THEN
      IF (j-'status'-'reconciliation_item_id'-'updated_at')<>(jold-'status'-'reconciliation_item_id'-'updated_at') THEN RAISE EXCEPTION 'Somente status e item na reconciliação.'; END IF;
    ELSIF (j-'status'-'variant_id'-'updated_at')<>(jold-'status'-'variant_id'-'updated_at') THEN RAISE EXCEPTION 'Campos de venda imutáveis.'; END IF;
  ELSIF TG_TABLE_NAME='partner_reconciliations' THEN
    IF OLD.status='CLOSED' AND NEW.status<>'REOPENED' THEN RAISE EXCEPTION 'Fechamento CLOSED é histórico.'; END IF;
    IF OLD.status='CLOSED' AND NEW.status='REOPENED' THEN
      IF (j-'status'-'reopened_by'-'reopened_at'-'updated_at')<>(jold-'status'-'reopened_by'-'reopened_at'-'updated_at') THEN RAISE EXCEPTION 'Reabertura só muda status e dados de reabertura.'; END IF;
    ELSE
      IF (j-'status'-'cutoff_at'-'notes'-'reviewed_by'-'reviewed_at'-'closed_by'-'closed_at'-'reopened_by'-'reopened_at'
          -'sales_count'-'units_sold'-'gross_amount'-'billable_amount'-'exceptions_count'-'snapshot'-'updated_at')
         <>(jold-'status'-'cutoff_at'-'notes'-'reviewed_by'-'reviewed_at'-'closed_by'-'closed_at'-'reopened_by'-'reopened_at'
          -'sales_count'-'units_sold'-'gross_amount'-'billable_amount'-'exceptions_count'-'snapshot'-'updated_at')
         THEN RAISE EXCEPTION 'Dados do fechamento imutáveis fora do RPC.'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='partner_reconciliation_items' THEN
    IF EXISTS(SELECT 1 FROM public.partner_reconciliations WHERE id=OLD.reconciliation_id AND status='CLOSED')
      THEN RAISE EXCEPTION 'Item de fechamento CLOSED é imutável.'; END IF;
    IF NEW.status<>OLD.status AND NEW.status NOT IN ('PENDING','VALIDATED','RECONCILED','EXCEPTION','REVERSED','CANCELED') AND OLD.status<>'NEW' THEN NULL; END IF;
    IF (j-'status'-'unit_reference_value'-'billable_amount'-'price_snapshot'-'exception_status'-'inventory_effect_status'
        -'inventory_movement_id'-'reversed_movement_id'-'error_message'-'updated_at')
       <>(jold-'status'-'unit_reference_value'-'billable_amount'-'price_snapshot'-'exception_status'-'inventory_effect_status'
        -'inventory_movement_id'-'reversed_movement_id'-'error_message'-'updated_at') THEN RAISE EXCEPTION 'Item somente via RPC de reconciliação.'; END IF;
  ELSIF TG_TABLE_NAME='reconciliation_exceptions' THEN
    IF EXISTS(SELECT 1 FROM public.partner_reconciliations WHERE id=OLD.reconciliation_id AND status='CLOSED')
      THEN RAISE EXCEPTION 'Exceção de fechamento CLOSED é imutável.'; END IF;
    IF (j-'status'-'resolution_type'-'resolution_notes'-'resolved_by'-'resolved_at'-'assigned_to'-'updated_at')
       <>(jold-'status'-'resolution_type'-'resolution_notes'-'resolved_by'-'resolved_at'-'assigned_to'-'updated_at') THEN RAISE EXCEPTION 'Exceção somente via RPC.'; END IF;
  ELSIF TG_TABLE_NAME='partner_reconciliation_adjustments' THEN
    IF EXISTS(SELECT 1 FROM public.partner_reconciliations WHERE id=OLD.reconciliation_id AND status='CLOSED')
      THEN RAISE EXCEPTION 'Ajuste de fechamento CLOSED é imutável.'; END IF;
    IF (j-'updated_at')<>(jold-'updated_at') THEN RAISE EXCEPTION 'Ajuste imutável.'; END IF;
  ELSIF TG_TABLE_NAME='domain_events' THEN
    IF (j-'status'-'attempts'-'published_at'-'updated_at')<>(jold-'status'-'attempts'-'published_at'-'updated_at') THEN RAISE EXCEPTION 'Evento de domínio imutável.'; END IF;
  ELSIF TG_TABLE_NAME IN ('partner_price_links','price_tables','price_table_items') THEN
    IF TG_TABLE_NAME='partner_price_links' AND (j-'valid_to'-'updated_at')<>(jold-'valid_to'-'updated_at') THEN RAISE EXCEPTION 'Vínculo imutável fora do RPC.'; END IF;
    IF TG_TABLE_NAME='price_tables' AND (j-'status'-'name'-'valid_to'-'notes'-'updated_at')<>(jold-'status'-'name'-'valid_to'-'notes'-'updated_at') THEN RAISE EXCEPTION 'Tabela imutável fora do RPC.'; END IF;
    IF TG_TABLE_NAME='price_table_items' AND (j-'unit_price'-'valid_to'-'status'-'updated_at')<>(jold-'unit_price'-'valid_to'-'status'-'updated_at') THEN RAISE EXCEPTION 'Item de preço imutável fora do RPC.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketplace_stores','marketplace_imports','marketplace_import_rows','marketplace_sales','external_sku_mappings',
  'price_tables','price_table_items','partner_price_links','partner_reconciliations','partner_reconciliation_items',
  'reconciliation_exceptions','partner_reconciliation_adjustments','domain_events'] LOOP
  EXECUTE format('CREATE TRIGGER reconciliation_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reconciliation_guard()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.reconciliation_require(uuid,text),public.reconciliation_audit(uuid,text,text,uuid,jsonb),public.reconciliation_guard_relations(),public.reconciliation_guard() FROM PUBLIC,anon,authenticated;

-- =====================================================================
-- 7. Núcleo auxiliar (uso interno da reconciliação).
-- =====================================================================
-- Saldo "as of" do parceiro (posição histórica, ponto no tempo).
CREATE FUNCTION public.rec_balance_asof(_org uuid,_variant uuid,_location uuid,_asof timestamptz)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(sum(CASE direction WHEN 'IN' THEN quantity ELSE -quantity END),0)
  FROM public.inventory_movements
  WHERE organization_id=_org AND variant_id=_variant AND location_id=_location
    AND status='POSTED' AND occurred_at<_asof;
$$;
-- Preço de referência na data: regra comercial (price_link -> price_table_item) vence.
CREATE FUNCTION public.rec_resolve_price(_org uuid,_variant uuid,_partner uuid,_on date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.unit_price FROM public.partner_price_links l
  JOIN public.price_tables t ON t.id=l.price_table_id AND t.organization_id=_org AND t.status='ACTIVE'
    AND _on>=t.valid_from AND (t.valid_to IS NULL OR _on<=t.valid_to)
  JOIN public.price_table_items i ON i.price_table_id=t.id AND i.organization_id=_org AND i.variant_id=_variant
    AND i.status='ACTIVE' AND _on>=i.valid_from AND (i.valid_to IS NULL OR _on<=i.valid_to)
  WHERE l.organization_id=_org AND l.partner_id=_partner
    AND _on>=l.valid_from AND (l.valid_to IS NULL OR _on<=l.valid_to)
  ORDER BY i.unit_price LIMIT 1;
$$;
-- Valor líquido do pedido (recebível de referência: bruto - descontos - taxa + frete).
CREATE FUNCTION public.rec_sale_net(_gross numeric,_discount numeric,_fee numeric,_shipping numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round(_gross - coalesce(_discount,0) - coalesce(_fee,0) + coalesce(_shipping,0),2);
$$;

-- =====================================================================
-- 8. RPC: registro/cancelamento de vendas do marketplace.
-- =====================================================================
CREATE FUNCTION public.marketplace_save_store(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.reconciliation_require(_org,'marketplace.manage');
  PERFORM public.inventory_lock(_org);
  IF _id IS NULL THEN
    INSERT INTO public.marketplace_stores(organization_id,code,name,marketplace,marketplace_store_id,ownership_type,partner_id,status,notes,created_by,updated_by)
    VALUES (_org,trim(_data->>'code'),trim(_data->>'name'),coalesce(nullif(trim(_data->>'marketplace'),''),'MERCADO_LIVRE'),
      nullif(trim(_data->>'marketplace_store_id'),''),coalesce(_data->>'ownership_type','PARTNER'),
      nullif((_data->>'partner_id')::uuid::text,'')::uuid,coalesce(_data->>'status','ACTIVE'),nullif(_data->>'notes',''),auth.uid(),auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.marketplace_stores SET code=COALESCE(nullif(trim(_data->>'code'),''),code),
      name=COALESCE(nullif(trim(_data->>'name'),''),name),
      marketplace=COALESCE(nullif(trim(_data->>'marketplace'),''),marketplace),
      marketplace_store_id=COALESCE(nullif(_data->>'marketplace_store_id',''),marketplace_store_id),
      ownership_type=COALESCE(_data->>'ownership_type',ownership_type),
      partner_id=COALESCE(nullif((_data->>'partner_id')::uuid::text,'')::uuid,partner_id),
      status=COALESCE(_data->>'status',status),notes=COALESCE(_data->>'notes',notes),updated_by=auth.uid()
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Loja não encontrada nesta organização.'; END IF;
  END IF;
  PERFORM public.reconciliation_audit(_org,'marketplace.store.save','marketplace_stores',v_id,jsonb_build_object('id',_id,'data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.marketplace_save_mapping(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.reconciliation_require(_org,'marketplace.manage');
  IF (_data->>'external_sku') IS NULL OR (_data->>'variant_id') IS NULL THEN RAISE EXCEPTION 'SKU externo e variante obrigatórios.'; END IF;
  UPDATE public.external_sku_mappings SET variant_id=(_data->>'variant_id')::uuid,updated_at=now()
  WHERE organization_id=_org AND store_id IS NOT DISTINCT FROM (nullif(_data->>'store_id','')::uuid) AND external_sku=trim(_data->>'external_sku')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.external_sku_mappings(organization_id,store_id,external_sku,variant_id,created_by)
    VALUES (_org,nullif(_data->>'store_id','')::uuid,trim(_data->>'external_sku'),(_data->>'variant_id')::uuid,auth.uid())
    RETURNING id INTO v_id;
  END IF;
  -- backfill: vendas não reconciliadas do mesmo SKU passam a VALIDATED (resolução de mapping).
  UPDATE public.marketplace_sales SET variant_id=esm.variant_id,status='VALIDATED',updated_at=now()
  FROM external_sku_mappings esm WHERE esm.id=v_id AND marketplace_sales.organization_id=_org
    AND marketplace_sales.external_sku=esm.external_sku
    AND (esm.store_id IS NULL OR marketplace_sales.store_id=esm.store_id)
    AND marketplace_sales.status IN ('IMPORTED','EXCEPTION') AND marketplace_sales.reconciliation_item_id IS NULL;
  UPDATE public.reconciliation_exceptions SET status='RESOLVED',resolution_type='REPROCESS',resolution_notes='SKU mapeado automaticamente',
    resolved_by=auth.uid(),resolved_at=now(),updated_at=now()
  WHERE organization_id=_org AND exception_type='SKU_NOT_MAPPED' AND status IN ('OPEN','IN_REVIEW');
  PERFORM public.reconciliation_audit(_org,'marketplace.mapping.save','external_sku_mappings',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.marketplace_register_sale(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale uuid; v_variant uuid; v_status text; v_store_id uuid:=(_data->>'store_id')::uuid; v_event text:=nullif(trim(_data->>'external_event_id'),'');
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'marketplace.manage');
  PERFORM public.inventory_lock(_org);
  IF NOT EXISTS(SELECT 1 FROM public.marketplace_stores WHERE id=v_store_id AND organization_id=_org) THEN
    RAISE EXCEPTION 'Loja não encontrada nesta organização.'; END IF;
  IF (_data->>'quantity') IS NULL OR (_data->>'quantity')::numeric<=0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
  IF nullif(trim(_data->>'external_order_id'),'') IS NULL THEN RAISE EXCEPTION 'Pedido externo obrigatório.'; END IF;
  IF nullif(trim(_data->>'external_sku'),'') IS NULL THEN RAISE EXCEPTION 'SKU externo obrigatório.'; END IF;
  IF v_event IS NOT NULL THEN
    SELECT id INTO v_sale FROM public.marketplace_sales WHERE organization_id=_org AND store_id=v_store_id AND external_event_id=v_event LIMIT 1;
    IF v_sale IS NOT NULL THEN
      RETURN jsonb_build_object('id',v_sale,'deduped',true,'sale',(SELECT to_jsonb(marketplace_sales.*) FROM public.marketplace_sales WHERE id=v_sale));
    END IF;
  END IF;
  SELECT variant_id INTO v_variant FROM public.external_sku_mappings
    WHERE organization_id=_org AND external_sku=trim(_data->>'external_sku') AND (store_id IS NULL OR store_id=v_store_id) LIMIT 1;
  v_status:=CASE WHEN v_variant IS NULL THEN 'IMPORTED' ELSE 'VALIDATED' END;
  INSERT INTO public.marketplace_sales(organization_id,store_id,sale_date,external_order_id,external_sku,external_event_id,variant_id,
    quantity,gross_amount,shipping_fee,discount_amount,platform_fee,currency,status,import_key,import_id,source,created_by)
  VALUES (_org,v_store_id,(_data->>'sale_date')::date,trim(_data->>'external_order_id'),trim(_data->>'external_sku'),v_event,v_variant,
    (_data->>'quantity')::numeric,coalesce(round((_data->>'gross_amount')::numeric,2),0),coalesce(round((_data->>'shipping_fee')::numeric,2),0),
    coalesce(round((_data->>'discount_amount')::numeric,2),0),coalesce(round((_data->>'platform_fee')::numeric,2),0),
    coalesce(_data->>'currency','BRL'),v_status,nullif(_data->>'import_key',''),nullif((_data->>'import_id')::uuid::text,'')::uuid,
    coalesce(_data->>'source','MANUAL'),_user_id)
  RETURNING id INTO v_sale;
  -- Venda dentro de período já CLOSED é venda tardia: registra e sinaliza exceção.
  IF EXISTS(SELECT 1 FROM public.partner_reconciliations r JOIN public.marketplace_stores st2 ON st2.id=v_store_id
    WHERE r.organization_id=_org AND r.partner_id=st2.partner_id AND r.status='CLOSED'
    AND r.period_start<=(_data->>'sale_date')::date AND r.period_end>=(_data->>'sale_date')::date) THEN
    INSERT INTO public.reconciliation_exceptions(organization_id,marketplace_sale_id,store_id,partner_id,exception_type,severity,status,message,created_by)
    SELECT _org,v_sale,v_store_id,st2.partner_id,'LATE_SALE_AFTER_CLOSING','WARNING','OPEN',
      'Venda com data dentro de fechamento CLOSED: reabra o período para reconciliá-la.',auth.uid()
    FROM public.marketplace_stores st2 WHERE st2.id=v_store_id;
  END IF;
  PERFORM public.reconciliation_audit(_org,'marketplace.sale.register','marketplace_sales',v_sale,jsonb_build_object('data',_data,'deduped',false));
  RETURN jsonb_build_object('id',v_sale,'deduped',false,
    'sale',(SELECT to_jsonb(marketplace_sales.*) FROM public.marketplace_sales WHERE id=v_sale));
END;
$$;

CREATE FUNCTION public.marketplace_cancel_sale(_org uuid,_sale_id uuid,_reason text,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'marketplace.manage');
  PERFORM public.inventory_lock(_org);
  UPDATE public.marketplace_sales SET status='CANCELED',updated_at=now()
  WHERE id=_sale_id AND organization_id=_org AND status<>'RECONCILED' AND status<>'CANCELED' AND reconciliation_item_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não cancelável (consolidada ou inexistente).'; END IF;
  UPDATE public.reconciliation_exceptions SET status='RESOLVED',resolution_type='REPROCESS',resolution_notes=COALESCE(nullif(trim(_reason),''),'Venda cancelada'),
    resolved_by=auth.uid(),resolved_at=now(),updated_at=now()
  WHERE organization_id=_org AND marketplace_sale_id=_sale_id AND status IN ('OPEN','IN_REVIEW');
  PERFORM public.reconciliation_audit(_org,'marketplace.sale.cancel','marketplace_sales',_sale_id,jsonb_build_object('reason',_reason));
  RETURN jsonb_build_object('id',_sale_id,'status','CANCELED');
END;
$$;

-- =====================================================================
-- 9. RPC: tabelas de preço.
-- =====================================================================
CREATE FUNCTION public.price_save_table(_org uuid,_data jsonb,_id uuid DEFAULT NULL,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'partner_pricing.manage');
  IF _id IS NULL THEN
    INSERT INTO public.price_tables(organization_id,code,name,status,valid_from,valid_to,notes,created_by)
    VALUES (_org,trim(_data->>'code'),trim(_data->>'name'),coalesce(_data->>'status','ACTIVE'),
      coalesce(nullif(_data->>'valid_from','')::date,current_date),nullif(_data->>'valid_to','')::date,nullif(_data->>'notes',''),_user_id)
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Tabela duplicada/Código em uso.'; END IF;
  ELSE
    UPDATE public.price_tables SET name=COALESCE(nullif(trim(_data->>'name'),''),name),status=COALESCE(_data->>'status',status),
      valid_from=COALESCE(nullif(_data->>'valid_from','')::date,valid_from),valid_to=COALESCE(nullif(_data->>'valid_to','')::date,valid_to),
      notes=COALESCE(_data->>'notes',notes)
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Tabela não encontrada.'; END IF;
  END IF;
  PERFORM public.reconciliation_audit(_org,'pricing.table.save','price_tables',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.price_save_item(_org uuid,_id_required boolean DEFAULT true,_data jsonb DEFAULT '{}'::jsonb,_item_id uuid DEFAULT NULL,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item_id uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'partner_pricing.manage');
  IF _item_id IS NULL THEN
    INSERT INTO public.price_table_items(organization_id,price_table_id,variant_id,unit_price,valid_from,valid_to,status)
    VALUES (_org,(_data->>'price_table_id')::uuid,(_data->>'variant_id')::uuid,round((_data->>'unit_price')::numeric,2),
      coalesce(nullif(_data->>'valid_from','')::date,current_date),nullif(_data->>'valid_to','')::date,coalesce(_data->>'status','ACTIVE'))
    RETURNING id INTO v_item_id;
  ELSE
    UPDATE public.price_table_items SET unit_price=COALESCE(round((_data->>'unit_price')::numeric,2),unit_price),
      valid_from=COALESCE(nullif(_data->>'valid_from','')::date,valid_from),valid_to=COALESCE(nullif(_data->>'valid_to','')::date,valid_to),
      status=COALESCE(_data->>'status',status)
    WHERE id=_item_id AND organization_id=_org RETURNING id INTO v_item_id;
    IF v_item_id IS NULL THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
  END IF;
  PERFORM public.reconciliation_audit(_org,'pricing.item.save','price_table_items',v_item_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_item_id);
END;
$$;

CREATE FUNCTION public.price_link_partner(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_partner uuid:=(_data->>'partner_id')::uuid; v_table uuid:=(_data->>'price_table_id')::uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'partner_pricing.manage');
  INSERT INTO public.partner_price_links(organization_id,partner_id,price_table_id,valid_from,valid_to,notes,created_by)
  VALUES (_org,v_partner,v_table,coalesce(nullif(_data->>'valid_from','')::date,current_date),nullif(_data->>'valid_to','')::date,nullif(_data->>'notes',''),_user_id)
  ON CONFLICT(organization_id,partner_id) DO UPDATE SET price_table_id=excluded.price_table_id,
    valid_from=excluded.valid_from,valid_to=excluded.valid_to,notes=excluded.notes,updated_at=now()
  RETURNING id INTO v_id;
  PERFORM public.reconciliation_audit(_org,'pricing.link.partner','partner_price_links',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

-- =====================================================================
-- 10. RPC: criar reconciliação (fechamento comercial DRAFT) e prévia.
-- =====================================================================
CREATE FUNCTION public.rec_eligible_sales(_org uuid,_partner uuid,_from date,_to date)
RETURNS TABLE(id uuid,store_id uuid,sale_date date,external_order_id text,external_sku text,variant_id uuid,
  quantity numeric,gross_amount numeric,shipping_fee numeric,discount_amount numeric,platform_fee numeric,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.id,s.store_id,s.sale_date,s.external_order_id,s.external_sku,s.variant_id,s.quantity,s.gross_amount,
         s.shipping_fee,s.discount_amount,s.platform_fee,s.status
  FROM public.marketplace_sales s JOIN public.marketplace_stores st ON st.id=s.store_id AND st.organization_id=_org
  WHERE s.organization_id=_org AND s.sale_date>=_from AND s.sale_date<=_to AND st.ownership_type='PARTNER'
    AND st.partner_id=_partner AND s.status IN ('IMPORTED','VALIDATED','EXCEPTION') AND s.reconciliation_item_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.partner_reconciliation_items i JOIN public.partner_reconciliations r ON r.id=i.reconciliation_id
      WHERE i.marketplace_sale_id=s.id AND r.organization_id=_org AND r.status<>'CANCELED');
$$;

CREATE FUNCTION public.rec_preview(_org uuid,_partner uuid,_from date,_to date,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.read');
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM public.rec_eligible_sales(_org,_partner,_from,_to) ORDER BY sale_date,external_order_id) q),'[]'::jsonb),
    'sales',(SELECT count(*)::int FROM public.rec_eligible_sales(_org,_partner,_from,_to)),
    'units',(SELECT coalesce(sum(quantity),0) FROM public.rec_eligible_sales(_org,_partner,_from,_to)),
    'gross',(SELECT coalesce(sum(gross_amount),0) FROM public.rec_eligible_sales(_org,_partner,_from,_to))) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.rec_create(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner uuid:=(_data->>'partner_id')::uuid; v_start date:=(_data->>'period_start')::date; v_end date:=(_data->>'period_end')::date;
  v_rec uuid; v_count int:=0; v_units numeric:=0; v_gross numeric:=0; v_area text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.create');
  PERFORM public.inventory_lock(_org);
  IF v_partner IS NULL OR v_start IS NULL OR v_end IS NULL OR v_end<v_start THEN
    RAISE EXCEPTION 'Parceiro e período (igual ou maior) obrigatórios.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=v_partner AND organization_id=_org AND operational_status='ACTIVE') THEN
    RAISE EXCEPTION 'Parceiro inativo ou fora da organização.'; END IF;
  IF EXISTS(SELECT 1 FROM public.partner_reconciliations WHERE organization_id=_org AND partner_id=v_partner AND status='CLOSED'
    AND period_start<=v_end AND period_end>=v_start) THEN
    RAISE EXCEPTION 'Período sobreposto a fechamento CLOSED. Reabra-o antes de criar novo.'; END IF;
  INSERT INTO public.partner_reconciliations(organization_id,partner_id,period_start,period_end,frequency,status,created_by)
  VALUES (_org,v_partner,v_start,v_end,coalesce(_data->>'frequency',
    (SELECT settlement_frequency FROM public.partner_profiles WHERE id=v_partner)),'DRAFT',_user_id)
  RETURNING id INTO v_rec;
  -- Vendas elegíveis viram itens PENDING (uma venda -> no máximo um item, índice único).
  INSERT INTO public.partner_reconciliation_items(organization_id,reconciliation_id,marketplace_sale_id,partner_id,store_id,variant_id,
    quantity,gross_amount)
  SELECT _org,v_rec,s.id,s.store_id,v_partner,s.variant_id,s.quantity,s.gross_amount
  FROM public.rec_eligible_sales(_org,v_partner,v_start,v_end) s
  ON CONFLICT(organization_id,marketplace_sale_id) DO NOTHING;
  SELECT count(*),coalesce(sum(quantity),0),coalesce(sum(gross_amount),0) INTO v_count,v_units,v_gross
  FROM public.partner_reconciliation_items WHERE reconciliation_id=v_rec;
  UPDATE public.partner_reconciliations SET sales_count=v_count,units_sold=v_units,gross_amount=v_gross WHERE id=v_rec;
  PERFORM public.reconciliation_audit(_org,'reconciliation.create','partner_reconciliations',v_rec,
    jsonb_build_object('partner_id',v_partner,'period_start',v_start,'period_end',v_end,'sales',v_count));
  RETURN jsonb_build_object('id',v_rec,'reconciliation_id',v_rec,'sales',v_count,'units',v_units,'gross',v_gross);
END;
$$;

-- =====================================================================
-- 11. RPC: processar item (validação + baixa SALE). Núcleo compartilhado.
--     Nunca levanta exceção de negócio: desvio vira exceção controlada.
-- =====================================================================
CREATE FUNCTION public.rec_process_item(_org uuid,_reconciliation_id uuid,_item_id uuid,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_item record; v_rec record; v_partner uuid; v_location uuid; v_variant uuid; v_price numeric; v_balance numeric;
  v_occurred timestamptz; v_net numeric; v_billable numeric; v_price_json jsonb; v_move uuid; v_dup uuid;
  v_exception_type text; v_severity text; v_message text; v_exc uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.process');
  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_rec FROM public.partner_reconciliations WHERE id=_reconciliation_id AND organization_id=_org FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Reconciliação não encontrada.'; END IF;
  IF v_rec.status='CLOSED' THEN RAISE EXCEPTION 'Fechamento CLOSED imutável.'; END IF;
  SELECT * INTO v_item FROM public.partner_reconciliation_items WHERE id=_item_id AND reconciliation_id=_reconciliation_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
  IF v_item.status='RECONCILED' AND v_item.inventory_effect_status='APPLIED' THEN
    RETURN jsonb_build_object('item_id',v_item.id,'status','RECONCILED','already',true,'movement_id',v_item.inventory_movement_id);
  END IF;
  -- 1) Loja/parceiro (STORE_PARTNER_MISMATCH).
  IF NOT EXISTS(SELECT 1 FROM public.marketplace_stores WHERE organization_id=_org AND id=v_item.store_id) THEN
    RETURN jsonb_build_object('item_id',v_item.id,'status','EXCEPTION','exception_type','STORE_PARTNER_MISMATCH');
  END IF;
  IF (SELECT ownership_type FROM public.marketplace_stores WHERE organization_id=_org AND id=v_item.store_id)<>'PARTNER'
    OR (SELECT partner_id FROM public.marketplace_stores WHERE organization_id=_org AND id=v_item.store_id) IS DISTINCT FROM v_item.partner_id THEN
    PERFORM public.reconciliation_insert_exception(_org,v_rec.id,v_item.id,v_item.marketplace_sale_id,v_item.partner_id,v_item.store_id,v_item.variant_id,
      'STORE_PARTNER_MISMATCH','WARNING','Loja não pertence ao parceiro deste fechamento.',NULL);
    UPDATE public.partner_reconciliation_items SET status='CANCELED',error_message='Loja fora do escopo de parceiros',updated_at=now() WHERE id=_item_id;
    RETURN jsonb_build_object('item_id',v_item.id,'status','CANCELED');
  END IF;
  SELECT default_inventory_location_id INTO v_location FROM public.partner_profiles WHERE id=v_item.partner_id AND organization_id=_org;
  IF v_location IS NULL THEN
    PERFORM public.reconciliation_insert_exception(_org,v_rec.id,v_item.id,v_item.marketplace_sale_id,v_item.partner_id,v_item.store_id,v_item.variant_id,
      'PARTNER_LOCATION_NOT_CONFIGURED','BLOCKING','Parceiro sem inventário de localização PARTNER.',NULL);
    UPDATE public.partner_reconciliation_items SET status='EXCEPTION',exception_status='PARTNER_LOCATION_NOT_CONFIGURED',updated_at=now() WHERE id=_item_id;
    RETURN jsonb_build_object('item_id',v_item.id,'status','EXCEPTION','exception_type','PARTNER_LOCATION_NOT_CONFIGURED');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=v_location AND organization_id=_org AND type='PARTNER' AND status='ACTIVE') THEN
    PERFORM public.reconciliation_insert_exception(_org,v_rec.id,v_item.id,v_item.marketplace_sale_id,v_item.partner_id,v_item.store_id,v_item.variant_id,
      'PARTNER_LOCATION_NOT_CONFIGURED','BLOCKING','Localização padrão inválida do parceiro.',NULL);
    UPDATE public.partner_reconciliation_items SET status='EXCEPTION',exception_status='PARTNER_LOCATION_NOT_CONFIGURED',updated_at=now() WHERE id=_item_id;
    RETURN jsonb_build_object('item_id',v_item.id,'status','EXCEPTION','exception_type','PARTNER_LOCATION_NOT_CONFIGURED');
  END IF;
  -- 2) SKU mapeado.
  SELECT s.variant_id INTO v_variant FROM public.marketplace_sales s WHERE s.id=v_item.marketplace_sale_id;
  IF v_variant IS NULL THEN
    PERFORM public.reconciliation_insert_exception(_org,v_rec.id,v_item.id,v_item.marketplace_sale_id,v_item.partner_id,v_item.store_id,NULL,
      'SKU_NOT_MAPPED','BLOCKING','SKU externo sem mapeamento de variante.',NULL);
    UPDATE public.partner_reconciliation_items SET status='EXCEPTION',exception_status='SKU_NOT_MAPPED',updated_at=now() WHERE id=_item_id;
    RETURN jsonb_build_object('item_id',v_item.id,'status','EXCEPTION','exception_type','SKU_NOT_MAPPED');
  END IF;
  -- 3) Preço: regra comercial vence; senão referência do pedido.
  v_price:=public.rec_resolve_price(_org,v_variant,v_item.partner_id,(SELECT sale_date FROM public.marketplace_sales WHERE id=v_item.marketplace_sale_id));
  IF v_price IS NULL THEN
    PERFORM public.reconciliation_insert_exception(_org,v_rec.id,v_item.id,v_item.marketplace_sale_id,v_item.partner_id,v_item.store_id,v_variant,
      'PRICE_NOT_FOUND','WARNING','Sem preço de referência para a SKU na data da venda.',NULL);
    UPDATE public.partner_reconciliation_items SET status='EXCEPTION',exception_status='PRICE_NOT_FOUND',updated_at=now() WHERE id=_item_id;
    RETURN jsonb_build_object('item_id',v_item.id,'status','EXCEPTION','exception_type','PRICE_NOT_FOUND');
  END IF;
  SELECT public.rec_sale_net(gross_amount,discount_amount,platform_fee,shipping_fee) INTO v_net
  FROM public.marketplace_sales WHERE id=v_item.marketplace_sale_id;
  v_billable:=round(v_price*v_item.quantity,2);
  -- 4) Estoque do parceiro na data da venda (posição histórica) + baixa atômica.
  v_occurred:=(((SELECT sale_date FROM public.marketplace_sales WHERE id=v_item.marketplace_sale_id))::timestamp AT TIME ZONE 'UTC');
  v_balance:=public.rec_balance_asof(_org,v_variant,v_location,v_occurred+interval '1 day');
  IF v_balance<v_item.quantity THEN
    PERFORM public.reconciliation_insert_exception(_org,v_rec.id,v_item.id,v_item.marketplace_sale_id,v_item.partner_id,v_item.store_id,v_variant,
      'INSUFFICIENT_PARTNER_STOCK','BLOCKING',format('Saldo insuficiente do parceiro na data: %.3f < %.3f.',v_balance,v_item.quantity),
      jsonb_build_object('balance',v_balance,'required',v_item.quantity));
    UPDATE public.partner_reconciliation_items SET status='EXCEPTION',exception_status='INSUFFICIENT_PARTNER_STOCK',updated_at=now() WHERE id=_item_id;
    RETURN jsonb_build_object('item_id',v_item.id,'status','EXCEPTION','exception_type','INSUFFICIENT_PARTNER_STOCK');
  END IF;
  SELECT id INTO v_dup FROM public.inventory_movements WHERE organization_id=_org
    AND idempotency_key='partner-sale:'||v_item.marketplace_sale_id||':inventory' LIMIT 1;
  IF v_dup IS NOT NULL THEN v_move:=v_dup;
  ELSE
    INSERT INTO public.inventory_movements(organization_id,variant_id,location_id,movement_type,direction,quantity,unit,
      reference_type,reference_id,reason,occurred_at,created_by,status,idempotency_key,source)
    VALUES (_org,v_variant,v_location,'SALE','OUT',v_item.quantity,'un','PARTNER_RECONCILIATION_ITEM',v_item.id,
      format('Venda %s do marketplace reconhecida no fechamento %s',v_item.marketplace_sale_id,_reconciliation_id),
      v_occurred,_user_id,'POSTED','partner-sale:'||v_item.marketplace_sale_id||':inventory','RECONCILIATION')
    RETURNING id INTO v_move;
  END IF;
  v_price_json:=jsonb_build_object('unit_price',v_price,'rule','PRICE_TABLE','net_reference',v_net);
  UPDATE public.partner_reconciliation_items SET status='RECONCILED',exception_status=NULL,unit_reference_value=v_price,
    billable_amount=v_billable,price_snapshot=v_price_json,inventory_effect_status='APPLIED',inventory_movement_id=v_move,error_message=NULL,updated_at=now()
  WHERE id=_item_id;
  UPDATE public.marketplace_sales SET status='RECONCILED',reconciliation_item_id=_item_id,updated_at=now() WHERE id=v_item.marketplace_sale_id;
  PERFORM public.reconciliation_audit(_org,'reconciliation.item.reconciled','partner_reconciliation_items',_item_id,
    jsonb_build_object('movement_id',v_move,'billable',v_billable,'price',v_price,'balance_before',v_balance));
  RETURN jsonb_build_object('item_id',_item_id,'status','RECONCILED','movement_id',v_move,'billable',v_billable);
END;
$$;

-- Exceção controlada (evita duplicar na mesma transação).
CREATE FUNCTION public.reconciliation_insert_exception(_org uuid,_rec uuid,_item uuid,_sale uuid,_partner uuid,_store uuid,_variant uuid,
  _type text,_severity text,_message text,_details jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.reconciliation_exceptions WHERE organization_id=_org AND COALESCE(reconciliation_id,('00000000-0000-0000-0000-000000000000')::uuid)=COALESCE(_rec,('00000000-0000-0000-0000-000000000000')::uuid)
    AND COALESCE(item_id,('00000000-0000-0000-0000-000000000000')::uuid)=COALESCE(_item,('00000000-0000-0000-0000-000000000000')::uuid)
    AND exception_type=_type AND status IN ('OPEN','IN_REVIEW')) THEN RETURN; END IF;
  INSERT INTO public.reconciliation_exceptions(organization_id,reconciliation_id,item_id,marketplace_sale_id,partner_id,store_id,variant_id,
    exception_type,severity,status,message,details,created_by)
  VALUES(_org,_rec,_item,_sale,_partner,_store,_variant,_type,_severity,'OPEN',_message,COALESCE(_details,'{}'::jsonb),auth.uid());
END;
$$;

CREATE FUNCTION public.rec_process(_org uuid,_reconciliation_id uuid,_limit int DEFAULT NULL,_item_ids uuid[] DEFAULT NULL,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rec record; v_item uuid; v_result jsonb; v_reconciled int:=0; v_exception int:=0; v_canceled int:=0;
  v_already int:=0; v_blocking int:=0; v_status text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.process');
  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_rec FROM public.partner_reconciliations WHERE id=_reconciliation_id AND organization_id=_org FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Reconciliação não encontrada.'; END IF;
  IF v_rec.status IN ('CLOSED','CANCELED') THEN RAISE EXCEPTION 'Reconciliação fechada/cancelada.'; END IF;
  IF v_rec.status='DRAFT' THEN UPDATE public.partner_reconciliations SET status='PROCESSING' WHERE id=_reconciliation_id; END IF;
  FOR v_item IN SELECT i.id FROM public.partner_reconciliation_items i
    WHERE i.reconciliation_id=_reconciliation_id AND i.status IN ('PENDING','EXCEPTION','VALIDATED')
    AND (_item_ids IS NULL OR i.id=ANY(_item_ids))
    ORDER BY i.id
    LIMIT coalesce(_limit,(SELECT count(*) FROM public.partner_reconciliation_items WHERE reconciliation_id=_reconciliation_id AND status IN ('PENDING','EXCEPTION','VALIDATED')))
  LOOP
    v_result:=public.rec_process_item(_org,_reconciliation_id,v_item,_user_id);
    IF (v_result->>'status')='RECONCILED' THEN
      IF (v_result->>'already')::boolean THEN v_already:=v_already+1; ELSE v_reconciled:=v_reconciled+1; END IF;
    END IF;
    IF (v_result->>'status')='EXCEPTION' THEN v_exception:=v_exception+1; END IF;
    IF (v_result->>'status')='CANCELED' THEN v_canceled:=v_canceled+1; END IF;
  END LOOP;
  SELECT count(*) INTO v_blocking FROM public.reconciliation_exceptions
    WHERE organization_id=_org AND reconciliation_id=_reconciliation_id AND severity='BLOCKING' AND status IN ('OPEN','IN_REVIEW');
  v_status:=CASE WHEN v_blocking>0 THEN 'REVIEW_REQUIRED' ELSE 'READY_TO_CLOSE' END;
  UPDATE public.partner_reconciliations SET status=v_status,
    units_sold=(SELECT coalesce(sum(quantity),0) FROM public.partner_reconciliation_items WHERE reconciliation_id=_reconciliation_id AND status='RECONCILED'),
    gross_amount=(SELECT coalesce(sum(gross_amount),0) FROM public.partner_reconciliation_items WHERE reconciliation_id=_reconciliation_id AND status='RECONCILED'),
    billable_amount=(SELECT coalesce(sum(billable_amount),0) FROM public.partner_reconciliation_items WHERE reconciliation_id=_reconciliation_id AND status='RECONCILED'),
    exceptions_count=(SELECT count(*) FROM public.reconciliation_exceptions WHERE organization_id=_org AND reconciliation_id=_reconciliation_id AND status IN ('OPEN','IN_REVIEW')),
    updated_at=now() WHERE id=_reconciliation_id;
  RETURN jsonb_build_object('reconciliation_id',_reconciliation_id,'status',v_status,
    'reconciled',v_reconciled,'already',v_already,'exceptions',v_exception,'canceled',v_canceled,'blocking_open',v_blocking);
END;
$$;

CREATE FUNCTION public.rec_reprocess_item(_org uuid,_item_id uuid,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rec uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.process');
  SELECT reconciliation_id INTO v_rec FROM public.partner_reconciliation_items WHERE id=_item_id AND organization_id=_org;
  IF v_rec IS NULL THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
  RETURN public.rec_process_item(_org,v_rec,_item_id,_user_id);
END;
$$;

CREATE FUNCTION public.rec_exception_resolve(_org uuid,_exception_id uuid,_resolution text,_notes text DEFAULT NULL,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_exc record; v_status text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  v_status:='RESOLVED';
  IF _resolution='IGNORED_BY_ADMIN' THEN PERFORM public.reconciliation_require(_org,'reconciliation.resolve_exception'); v_status:='IGNORED_WITH_AUTHORIZATION';
  ELSE PERFORM public.reconciliation_require(_org,'reconciliation.resolve_exception'); END IF;
  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_exc FROM public.reconciliation_exceptions WHERE id=_exception_id AND organization_id=_org FOR UPDATE;
  IF v_exc.id IS NULL THEN RAISE EXCEPTION 'Exceção não encontrada.'; END IF;
  IF v_exc.status IN ('RESOLVED','IGNORED_WITH_AUTHORIZATION') THEN
    RETURN jsonb_build_object('id',_exception_id,'status',v_exc.status,'already',true); END IF;
  IF _resolution='REPROCESS' AND v_exc.item_id IS NULL THEN RAISE EXCEPTION 'Reprocesso exige item vinculado.'; END IF;
  UPDATE public.reconciliation_exceptions SET status=v_status,resolution_type=_resolution,resolution_notes=_notes,
    resolved_by=_user_id,resolved_at=now(),updated_at=now() WHERE id=_exception_id;
  PERFORM public.reconciliation_audit(_org,'reconciliation.exception.resolve','reconciliation_exceptions',_exception_id,
    jsonb_build_object('resolution',_resolution,'notes',_notes));
  RETURN jsonb_build_object('id',_exception_id,'status',v_status);
END;
$$;

CREATE FUNCTION public.rec_adjustment(_org uuid,_reconciliation_id uuid,_type text,_amount numeric,_reason text,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_bill numeric;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.review');
  PERFORM public.inventory_lock(_org);
  IF NOT EXISTS(SELECT 1 FROM public.partner_reconciliations WHERE id=_reconciliation_id AND organization_id=_org AND status<>'CLOSED' AND status<>'CANCELED') THEN
    RAISE EXCEPTION 'Fechamento não alterável.'; END IF;
  IF _type NOT IN ('CREDIT','DEBIT') OR _amount<0 OR nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Ajuste inválido (CREDIT/DEBIT, valor>=0, motivo).'; END IF;
  INSERT INTO public.partner_reconciliation_adjustments(organization_id,reconciliation_id,adjustment_type,amount,reason,created_by)
  VALUES(_org,_reconciliation_id,_type,round(_amount,2),trim(_reason),_user_id) RETURNING id INTO v_id;
  SELECT ((SELECT coalesce(sum(billable_amount),0) FROM public.partner_reconciliation_items WHERE reconciliation_id=_reconciliation_id AND status='RECONCILED')
    +(SELECT coalesce(sum(CASE adjustment_type WHEN 'CREDIT' THEN amount ELSE -amount END),0) FROM public.partner_reconciliation_adjustments WHERE reconciliation_id=_reconciliation_id))
    INTO v_bill;
  UPDATE public.partner_reconciliations SET billable_amount=round(v_bill,2),updated_at=now() WHERE id=_reconciliation_id;
  PERFORM public.reconciliation_audit(_org,'reconciliation.adjustment.add','partner_reconciliation_adjustments',v_id,jsonb_build_object('type',_type,'amount',_amount));
  RETURN jsonb_build_object('id',v_id,'billable_amount',v_bill);
END;
$$;

CREATE FUNCTION public.rec_close(_org uuid,_reconciliation_id uuid,_notes text DEFAULT NULL,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rec record; v_blocking int; v_snapshot jsonb; v_domain uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.close');
  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_rec FROM public.partner_reconciliations WHERE id=_reconciliation_id AND organization_id=_org FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Reconciliação não encontrada.'; END IF;
  IF v_rec.status='CLOSED' THEN RETURN jsonb_build_object('id',v_rec.id,'status','CLOSED','already',true,'snapshot',v_rec.snapshot); END IF;
  IF v_rec.status NOT IN ('READY_TO_CLOSE','REVIEW_REQUIRED','REOPENED','PROCESSING','DRAFT') THEN RAISE EXCEPTION 'Estado não permite fechamento.'; END IF;
  SELECT count(*) INTO v_blocking FROM public.reconciliation_exceptions
    WHERE organization_id=_org AND reconciliation_id=_reconciliation_id AND severity='BLOCKING' AND status IN ('OPEN','IN_REVIEW');
  IF v_blocking>0 THEN RAISE EXCEPTION 'Exceções bloqueantes em aberto (%): resolva antes de fechar.',v_blocking; END IF;
  SELECT jsonb_build_object(
    'reconciliation_id',v_rec.id,'partner_id',v_rec.partner_id,
    'period',jsonb_build_object('start',v_rec.period_start,'end',v_rec.period_end),
    'closed_by',_user_id,'closed_at',now(),'notes',COALESCE(nullif(trim(_notes),''),v_rec.notes),
    'totals',jsonb_build_object('sales',v_rec.sales_count,'units',v_rec.units_sold,'gross',v_rec.gross_amount,
      'billable_items',(SELECT coalesce(sum(billable_amount),0) FROM public.partner_reconciliation_items WHERE reconciliation_id=v_rec.id AND status='RECONCILED'),
      'adjustments',(SELECT coalesce(sum(CASE adjustment_type WHEN 'CREDIT' THEN amount ELSE -amount END),0) FROM public.partner_reconciliation_adjustments WHERE reconciliation_id=v_rec.id),
      'net_billable',(SELECT round((SELECT coalesce(sum(billable_amount),0) FROM public.partner_reconciliation_items WHERE reconciliation_id=v_rec.id AND status='RECONCILED')
        +(SELECT coalesce(sum(CASE adjustment_type WHEN 'CREDIT' THEN amount ELSE -amount END),0) FROM public.partner_reconciliation_adjustments WHERE reconciliation_id=v_rec.id)),2)),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT i.id,i.variant_id,i.quantity,i.unit_reference_value,i.gross_amount,i.billable_amount,i.price_snapshot,
      v.sku,v.size,v.color,p.name product_name,s.external_order_id,s.external_sku,s.store_id,s.sale_date
      FROM public.partner_reconciliation_items i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=v.product_id
      JOIN public.marketplace_sales s ON s.id=i.marketplace_sale_id WHERE i.reconciliation_id=v_rec.id AND i.status='RECONCILED' ORDER BY s.sale_date,i.id) q),'[]'::jsonb),
    'adjustment_rows',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.partner_reconciliation_adjustments a WHERE a.reconciliation_id=v_rec.id ORDER BY a.created_at),'[]'::jsonb),
    'exceptions_open_at_close',coalesce((SELECT jsonb_agg(jsonb_build_object('type',e.exception_type,'severity',e.severity,'status',e.status,'message',e.message))
      FROM public.reconciliation_exceptions e WHERE e.reconciliation_id=v_rec.id AND e.status IN ('OPEN','IN_REVIEW')),'[]'::jsonb))
    INTO v_snapshot;
  UPDATE public.partner_reconciliations SET status='CLOSED',snapshot=v_snapshot,cutoff_at=now(),closed_by=_user_id,closed_at=now(),
    notes=COALESCE(nullif(trim(_notes),''),notes),exceptions_count=(SELECT count(*) FROM public.reconciliation_exceptions WHERE organization_id=_org AND reconciliation_id=v_rec.id AND status IN ('OPEN','IN_REVIEW')),
    updated_at=now() WHERE id=v_rec.id;
  INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload,status,attempts,published_at,created_at)
  VALUES(_org,'PARTNER_RECONCILIATION_CLOSED','RECONCILIATION','reconciliation:closed:'||v_rec.id::text,v_snapshot,'PUBLISHED',1,now(),now())
  ON CONFLICT(organization_id,event_key) DO UPDATE SET status='PUBLISHED',published_at=now(),attempts=domain_events.attempts+1
  RETURNING id INTO v_domain;
  PERFORM public.reconciliation_audit(_org,'reconciliation.close','partner_reconciliations',v_rec.id,jsonb_build_object('snapshot_keys',(SELECT string_agg(k,',' ORDER BY k) FROM jsonb_object_keys(v_snapshot) k)));
  RETURN jsonb_build_object('id',v_rec.id,'status','CLOSED','snapshot',v_snapshot,'domain_event_id',v_domain);
END;
$$;

CREATE FUNCTION public.rec_reopen(_org uuid,_reconciliation_id uuid,_reason text,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.reopen');
  PERFORM public.inventory_lock(_org);
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo de reabertura obrigatório.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.partner_reconciliations WHERE id=_reconciliation_id AND organization_id=_org AND status='CLOSED') THEN
    RAISE EXCEPTION 'Somente fechamento CLOSED é reabrível.'; END IF;
  UPDATE public.partner_reconciliations SET status='REOPENED',reopened_by=_user_id,reopened_at=now(),notes=COALESCE(notes||E'\nReaberto: '||trim(_reason),'Reaberto: '||trim(_reason)),
    updated_at=now() WHERE id=_reconciliation_id;
  UPDATE public.domain_events SET status='PENDING',published_at=NULL WHERE organization_id=_org AND event_key='reconciliation:closed:'||_reconciliation_id::text;
  PERFORM public.reconciliation_audit(_org,'reconciliation.reopen','partner_reconciliations',_reconciliation_id,jsonb_build_object('reason',_reason));
  RETURN jsonb_build_object('id',_reconciliation_id,'status','REOPENED');
END;
$$;

CREATE FUNCTION public.rec_reverse_item(_org uuid,_item_id uuid,_reason text,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item record; v_move uuid; v_rev uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,'reconciliation.reverse');
  PERFORM public.inventory_lock(_org);
  SELECT i.*,r.status rec_status INTO v_item FROM public.partner_reconciliation_items i
    JOIN public.partner_reconciliations r ON r.id=i.reconciliation_id WHERE i.id=_item_id AND i.organization_id=_org FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
  IF v_item.rec_status='CLOSED' OR v_item.status<>'RECONCILED' OR v_item.inventory_effect_status<>'APPLIED' OR v_item.inventory_movement_id IS NULL THEN
    RAISE EXCEPTION 'Estorno exige item reconciliado (reabra o fechamento antes).'; END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo do estorno obrigatório.'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reversal_of_id=v_item.inventory_movement_id) THEN
    RAISE EXCEPTION 'Baixa já estornada.'; END IF;
  INSERT INTO public.inventory_movements(organization_id,variant_id,location_id,movement_type,direction,quantity,unit,
    reference_type,reference_id,reason,occurred_at,created_by,status,reversal_of_id,idempotency_key,source)
  VALUES (_org,v_item.variant_id,(SELECT location_id FROM public.inventory_movements WHERE id=v_item.inventory_movement_id),
    'REVERSAL','IN',v_item.quantity,'un','PARTNER_RECONCILIATION_ITEM',v_item.id,
    'Estorno da baixa da venda: '||COALESCE(nullif(trim(_reason),''),'--'),now(),_user_id,'POSTED',v_item.inventory_movement_id,
    'partner-sale-reversal:'||v_item.marketplace_sale_id||':inventory','RECONCILIATION')
  RETURNING id,reversal_of_id INTO v_rev,v_move;
  UPDATE public.inventory_movements SET reversed_by_id=v_rev WHERE id=v_move;
  UPDATE public.partner_reconciliation_items SET status='REVERSED',inventory_effect_status='REVERSED',reversed_movement_id=v_rev,updated_at=now() WHERE id=v_item.id;
  UPDATE public.marketplace_sales SET status='EXCEPTION',updated_at=now() WHERE id=v_item.marketplace_sale_id;
  PERFORM public.reconciliation_audit(_org,'reconciliation.item.reverse','partner_reconciliation_items',_item_id,
    jsonb_build_object('original',v_move,'reversal',v_rev,'reason',_reason));
  RETURN jsonb_build_object('item_id',_item_id,'status','REVERSED','reversal_movement_id',v_rev);
END;
$$;

-- =====================================================================
-- 12. RPC: consultas de leitura (dashboard, listas, detalhes, relatórios).
-- =====================================================================
CREATE FUNCTION public.rec_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}'::jsonb,_page int DEFAULT 1,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb; v_uri text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.reconciliation_require(_org,
    CASE WHEN _kind IN ('price_tables','price_table','price_rules') THEN 'partner_pricing.read'
         WHEN _kind='dashboard' THEN 'reconciliation.read'
         ELSE 'reconciliation.read' END);
  IF _kind='dashboard' THEN
    SELECT jsonb_build_object(
      'pending_sales',(SELECT count(*) FROM public.marketplace_sales WHERE organization_id=_org AND status IN ('IMPORTED','VALIDATED','EXCEPTION') AND reconciliation_item_id IS NULL),
      'pending_units',(SELECT coalesce(sum(quantity),0) FROM public.marketplace_sales WHERE organization_id=_org AND status IN ('IMPORTED','VALIDATED','EXCEPTION') AND reconciliation_item_id IS NULL),
      'open_reconciliations',(SELECT count(*) FROM public.partner_reconciliations WHERE organization_id=_org AND status NOT IN ('CLOSED','CANCELED')),
      'ready_to_close',(SELECT count(*) FROM public.partner_reconciliations WHERE organization_id=_org AND status='READY_TO_CLOSE'),
      'open_exceptions',(SELECT count(*) FROM public.reconciliation_exceptions WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW')),
      'blocking_exceptions',(SELECT count(*) FROM public.reconciliation_exceptions WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW') AND severity='BLOCKING'),
      'unsigned_sku',(SELECT count(*) FROM public.marketplace_sales WHERE organization_id=_org AND variant_id IS NULL AND status<>'CANCELED'),
      'active_partner_stores',(SELECT count(*) FROM public.marketplace_stores WHERE organization_id=_org AND ownership_type='PARTNER' AND status='ACTIVE'),
      'closed_in_period',(SELECT count(*) FROM public.partner_reconciliations WHERE organization_id=_org AND status='CLOSED'
        AND closed_at>=COALESCE(nullif(_filters->>'from','')::timestamptz,date_trunc('month',now())))) INTO v_result;
  ELSIF _kind='reconciliations' THEN
    WITH rows AS MATERIALIZED(SELECT r.id,r.partner_id,r.period_start,r.period_end,r.status,r.frequency,r.sales_count,r.units_sold,r.gross_amount,r.billable_amount,r.exceptions_count,r.created_at,r.closed_at,c.legal_name partner_name
      FROM public.partner_reconciliations r JOIN public.partner_profiles p ON p.id=r.partner_id JOIN public.companies c ON c.id=p.company_id
      WHERE r.organization_id=_org
      AND (nullif(_filters->>'partner_id','') IS NULL OR r.partner_id=(_filters->>'partner_id')::uuid)
      AND (coalesce(_filters->>'status','')='' OR r.status=_filters->>'status')
      AND (nullif(_filters->>'from','') IS NULL OR r.period_start>=(_filters->>'from')::date)
      AND (nullif(_filters->>'to','') IS NULL OR r.period_end<=(_filters->>'to')::date)
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(c.legal_name),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY period_start DESC,id DESC LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='reconciliation' THEN
    SELECT to_jsonb(r)||jsonb_build_object('partner_name',c.legal_name,
      'items',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('sku',v.sku,'product_name',p.name,'external_order_id',s.external_order_id,'external_sku',s.external_sku,'store_name',st.name,'marketplace',st.marketplace))
        FROM public.partner_reconciliation_items i JOIN public.marketplace_sales s ON s.id=i.marketplace_sale_id JOIN public.marketplace_stores st ON st.id=i.store_id
        LEFT JOIN public.product_variants v ON v.id=i.variant_id LEFT JOIN public.products p ON p.id=v.product_id WHERE i.reconciliation_id=r.id ORDER BY s.sale_date,i.id),'[]'::jsonb),
      'exceptions',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM public.reconciliation_exceptions e WHERE e.reconciliation_id=r.id ORDER BY e.created_at),'[]'::jsonb),
      'adjustments',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.partner_reconciliation_adjustments a WHERE a.reconciliation_id=r.id ORDER BY a.created_at),'[]'::jsonb),
      'by_sku',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT v.sku,p.name product_name,count(*) items,sum(i.quantity) units,sum(i.billable_amount) billable
        FROM public.partner_reconciliation_items i LEFT JOIN public.product_variants v ON v.id=i.variant_id LEFT JOIN public.products p ON p.id=v.product_id
        WHERE i.reconciliation_id=r.id AND i.status<>'CANCELED' GROUP BY v.sku,p.name ORDER BY v.sku)q),'[]'::jsonb),
      'by_day',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT s.sale_date day,count(*) items,sum(i.quantity) units,sum(i.billable_amount) billable
        FROM public.partner_reconciliation_items i JOIN public.marketplace_sales s ON s.id=i.marketplace_sale_id WHERE i.reconciliation_id=r.id AND i.status<>'CANCELED' GROUP BY s.sale_date ORDER BY s.sale_date)q),'[]'::jsonb),
      'by_marketplace',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT st.marketplace,count(*) items,sum(i.quantity) units,sum(i.billable_amount) billable
        FROM public.partner_reconciliation_items i JOIN public.marketplace_stores st ON st.id=i.store_id WHERE i.reconciliation_id=r.id AND i.status<>'CANCELED' GROUP BY st.marketplace ORDER BY st.marketplace)q),'[]'::jsonb),
      'summary',jsonb_build_object('shipped',(SELECT coalesce(sum(quantity),0) FROM public.inventory_movements m WHERE m.organization_id=_org AND m.movement_type='PARTNER_SHIPMENT' AND m.direction='IN'
        AND m.location_id=(SELECT default_inventory_location_id FROM public.partner_profiles WHERE id=r.partner_id) AND m.occurred_at>=r.period_start::timestamp AT TIME ZONE 'UTC' AND m.occurred_at<((r.period_end+1)::timestamp AT TIME ZONE 'UTC')),
        'reconciled',r.units_sold,'on_hand',(SELECT coalesce(sum(on_hand),0) FROM public.inventory_balances b WHERE b.organization_id=_org AND b.location_id=(SELECT default_inventory_location_id FROM public.partner_profiles WHERE id=r.partner_id)))
      ) INTO v_result
    FROM public.partner_reconciliations r JOIN public.partner_profiles pp ON pp.id=r.partner_id JOIN public.companies c ON c.id=pp.company_id
    WHERE r.organization_id=_org AND r.id=(_filters->>'id')::uuid;
  ELSIF _kind IN ('exceptions','divergences') THEN
    WITH rows AS MATERIALIZED(SELECT e.*,c.legal_name partner_name,st.name store_name,v.sku FROM public.reconciliation_exceptions e
      LEFT JOIN public.partner_profiles pp ON pp.id=e.partner_id LEFT JOIN public.companies c ON c.id=pp.company_id
      LEFT JOIN public.marketplace_stores st ON st.id=e.store_id LEFT JOIN public.product_variants v ON v.id=e.variant_id
      WHERE e.organization_id=_org
      AND (coalesce(_filters->>'status','')='' OR e.status=_filters->>'status')
      AND (coalesce(_filters->>'severity','')='' OR e.severity=_filters->>'severity')
      AND (nullif(_filters->>'partner_id','') IS NULL OR e.partner_id=(_filters->>'partner_id')::uuid)
      AND (_kind='divergences' OR true))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY created_at DESC,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='sales' THEN
    WITH rows AS MATERIALIZED(SELECT s.*,st.name store_name,st.marketplace,st.ownership_type,COALESCE(c.legal_name,st.name) partner_name,st.partner_id
      FROM public.marketplace_sales s JOIN public.marketplace_stores st ON st.id=s.store_id
      LEFT JOIN public.partner_profiles pp ON pp.id=st.partner_id LEFT JOIN public.companies c ON c.id=pp.company_id
      WHERE s.organization_id=_org
      AND (nullif(_filters->>'store_id','') IS NULL OR s.store_id=(_filters->>'store_id')::uuid)
      AND (nullif(_filters->>'partner_id','') IS NULL OR st.partner_id=(_filters->>'partner_id')::uuid)
      AND (coalesce(_filters->>'status','')='' OR s.status=_filters->>'status')
      AND (nullif(_filters->>'from','') IS NULL OR s.sale_date>=(_filters->>'from')::date)
      AND (nullif(_filters->>'to','') IS NULL OR s.sale_date<=(_filters->>'to')::date)
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',s.external_order_id,s.external_sku,st.name)),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY sale_date DESC,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='stores' THEN
    WITH rows AS MATERIALIZED(SELECT st.*,COALESCE(c.legal_name,'-') partner_name FROM public.marketplace_stores st
      LEFT JOIN public.partner_profiles pp ON pp.id=st.partner_id LEFT JOIN public.companies c ON c.id=pp.company_id
      WHERE st.organization_id=_org
      AND (coalesce(_filters->>'status','')='' OR st.status=_filters->>'status')
      AND (nullif(_filters->>'partner_id','') IS NULL OR st.partner_id=(_filters->>'partner_id')::uuid)
      AND (nullif(_filters->>'ownership_type','') IS NULL OR st.ownership_type=(_filters->>'ownership_type')::text)
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',st.code,st.name)),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY name LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='mappings' THEN
    WITH rows AS MATERIALIZED(SELECT m.*,st.name store_name,v.sku FROM public.external_sku_mappings m
      LEFT JOIN public.marketplace_stores st ON st.id=m.store_id LEFT JOIN public.product_variants v ON v.id=m.variant_id
      WHERE m.organization_id=_org
      AND (nullif(_filters->>'store_id','') IS NULL OR m.store_id=(_filters->>'store_id')::uuid)
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',m.external_sku,v.sku)),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY external_sku LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='price_tables' THEN
    WITH rows AS MATERIALIZED(SELECT t.*,COALESCE((SELECT count(*) FROM public.price_table_items i WHERE i.price_table_id=t.id),0) items_count,
      COALESCE((SELECT count(*) FROM public.partner_price_links l WHERE l.price_table_id=t.id),0) partners_count
      FROM public.price_tables t WHERE t.organization_id=_org
      AND (coalesce(_filters->>'status','')='' OR t.status=_filters->>'status')
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',t.code,t.name)),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY created_at DESC LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='price_table' THEN
    SELECT to_jsonb(t)||jsonb_build_object(
      'items',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('sku',v.sku,'product_name',p.name)) FROM public.price_table_items i
        LEFT JOIN public.product_variants v ON v.id=i.variant_id LEFT JOIN public.products p ON p.id=v.product_id WHERE i.price_table_id=t.id ORDER BY v.sku),'[]'::jsonb),
      'partners',coalesce((SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('partner_name',c.legal_name)) FROM public.partner_price_links l
        JOIN public.partner_profiles pp ON pp.id=l.partner_id JOIN public.companies c ON c.id=pp.company_id WHERE l.price_table_id=t.id),'[]'::jsonb)) INTO v_result
    FROM public.price_tables t WHERE t.organization_id=_org AND t.id=(_filters->>'id')::uuid;
  ELSIF _kind='price_rules' THEN
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT l.valid_from,l.valid_to,l.notes,t.code table_code,t.name table_name,t.valid_from table_from,t.valid_to table_to
      FROM public.partner_price_links l JOIN public.price_tables t ON t.id=l.price_table_id WHERE l.organization_id=_org
      AND (nullif(_filters->>'partner_id','') IS NULL OR l.partner_id=(_filters->>'partner_id')::uuid))q),'[]'::jsonb) INTO v_result;
  ELSIF _kind='history' THEN
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT action,created_at,user_id,context FROM public.audit_log WHERE organization_id=_org AND resource_id=_filters->>'id' ORDER BY created_at DESC LIMIT 100)q),'[]'::jsonb) INTO v_result;
  END IF;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Consulta/recurso não encontrado.'; END IF;
  RETURN v_result;
END;
$$;

-- =====================================================================
-- 13. Grants/REVOKEs finais.
-- =====================================================================
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
   'marketplace_save_store','marketplace_save_mapping','marketplace_register_sale','marketplace_cancel_sale',
   'price_save_table','price_save_item','price_link_partner',
   'rec_create','rec_preview','rec_process','rec_reprocess_item','rec_exception_resolve','rec_adjustment','rec_close','rec_reopen','rec_reverse_item','rec_query') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
   'rec_eligible_sales','rec_balance_asof','rec_resolve_price','rec_sale_net','reconciliation_insert_exception') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;

COMMIT;