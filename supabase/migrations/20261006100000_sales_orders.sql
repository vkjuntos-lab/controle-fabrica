-- MASTER 013: Pedidos de venda, reserva de estoque, separacao, expedicao e
-- devolucoes de cliente.
--
-- Principios que esta migration NAO quebra:
--   * Proposta nao e pedido. O pedido nasce aqui, nunca de um aceite implicit.
--   * Pedido nao e venda concluida. A venda só se concretiza com a expedicao.
--   * Reserva nao e movimentacao fisica. Reserva nao cria linha no ledger.
--   * Separacao nao e expedicao. Picking nao baixa o ledger.
--   * Expedicao nao e entrega. Despatched nunca significa DELIVERED.
--   * Expedicao nao e recebimento financeiro. A obrigacao financeira tem
--     politica propria (sales_order_settings.receivable_trigger).
--   * Remessa em consignacao NAO e venda direta. PartnerShipment continua
--     intacto no MASTER 006 e nunca vira SalesOrder.
--
-- O saldo fisico continua vindo exclusivamente do Inventory Ledger do
-- MASTER 003. Aqui nao existe coluna de saldo: disponibilidade e derivada
-- (saldo fisico - reservas ativas) e sempre calculada.
BEGIN;

-- =====================================================================
-- 1. Permissoes do modulo.
-- =====================================================================
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['admin','gestor']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
 'sales_orders.read','sales_orders.create','sales_orders.update','sales_orders.approve','sales_orders.cancel',
 'reservations.read','reservations.create','reservations.release',
 'fulfillment.read','fulfillment.manage',
 'picking.execute','picking.confirm',
 'packing.manage',
 'shipments.read','shipments.create','shipments.dispatch','shipments.confirm_delivery',
 'returns.read','returns.create','returns.approve','returns.receive',
 'logistics.export',
 'sales.configure','carriers.manage','sales_credit.read']) p ON CONFLICT DO NOTHING;

-- Comercial: opera a cadeia comercial e a expedicao, mas nao aprova sozinho
-- quando a segregacao de funcoes esta ativa (o servidor decide).
INSERT INTO public.role_permissions(role,permission)
SELECT 'comercial',p FROM unnest(ARRAY[
 'sales_orders.read','sales_orders.create','sales_orders.update','sales_orders.cancel',
 'reservations.read','reservations.create',
 'fulfillment.read','picking.execute',
 'shipments.read','shipments.create','shipments.confirm_delivery',
 'returns.read','returns.create',
 'sales_credit.read','carriers.manage']) p ON CONFLICT DO NOTHING;

-- Estoque: executa o fisico (reserva, separacao, embalagem, expedicao) e
-- pode ajustar estoque, necessario para a baixa oficial de SALE.
INSERT INTO public.role_permissions(role,permission)
SELECT 'estoque',p FROM unnest(ARRAY[
 'sales_orders.read',
 'reservations.read','reservations.create','reservations.release',
 'fulfillment.read','fulfillment.manage',
 'picking.execute','picking.confirm','packing.manage',
 'shipments.read','shipments.create','shipments.dispatch',
 'returns.read','returns.receive',
 'logistics.export']) p ON CONFLICT DO NOTHING;

-- Financeiro: leitura da cadeia comercial e das devolucoes para estorno.
INSERT INTO public.role_permissions(role,permission)
SELECT 'financeiro',p FROM unnest(ARRAY[
 'sales_orders.read','sales_credit.read',
 'shipments.read','returns.read','returns.approve']) p ON CONFLICT DO NOTHING;

-- Producao: le pedidos aprovados para reconhecer demanda sob encomenda.
INSERT INTO public.role_permissions(role,permission)
SELECT 'producao','sales_orders.read' ON CONFLICT DO NOTHING;

-- =====================================================================
-- 2. Politicas operacionais por organizacao.
-- =====================================================================
CREATE TABLE public.sales_order_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations UNIQUE,
 -- FULL_ONLY: reserva exige a quantidade inteira; ALLOW_PARTIAL: reserva o
 -- disponivel e deixa o saldo pendente; ALLOW_NEGATIVE_AVAILABLE: permite
 --書沒 disponivel negativo na reserva (o saldo fisico continua bloqueado).
 reservation_policy text NOT NULL DEFAULT 'ALLOW_PARTIAL'
   CHECK(reservation_policy IN ('FULL_ONLY','ALLOW_PARTIAL','ALLOW_NEGATIVE_AVAILABLE')),
 reservation_expiry_hours integer NOT NULL DEFAULT 72 CHECK(reservation_expiry_hours>0),
 -- Permite classificar o saldo sem estoque como MAKE_TO_ORDER.
 make_to_order_enabled boolean NOT NULL DEFAULT true,
 -- Exposicao de credito considerada na aprovacao.
 credit_exposure_policy text NOT NULL DEFAULT 'OPEN_RECEIVABLES_PLUS_OPEN_ORDERS'
   CHECK(credit_exposure_policy IN ('OPEN_RECEIVABLES_ONLY','OPEN_RECEIVABLES_PLUS_OPEN_ORDERS')),
 -- Impede o aprovador de aprovar o proprio pedido.
 approval_segregation boolean NOT NULL DEFAULT true,
 -- Desconto maximo sem autorizacao especifica. NULL = usa a alcada do
 -- commercial_discount_authorities do MASTER 012.
 max_discount_percent numeric(5,2) CHECK(max_discount_percent BETWEEN 0 AND 100),
 -- Preco abaixo do minimo da tabela vigente.
 price_override_policy text NOT NULL DEFAULT 'BLOCK'
   CHECK(price_override_policy IN ('BLOCK','ALLOW_WITH_AUTHORIZATION')),
 -- Obrigacao financeira. ON_DISPATCH e o unico gatilho que nao duplica a
 -- mesma venda (expedicao e o fato comercial elegivel). NONE nao gera titulo.
 receivable_trigger text NOT NULL DEFAULT 'ON_DISPATCH'
   CHECK(receivable_trigger IN ('NONE','ON_APPROVAL','ON_DISPATCH')),
 allow_partial_fulfillment boolean NOT NULL DEFAULT true,
 -- Expedicao exige conferencia integral do que foi separado.
 shipment_requires_full_confirmation boolean NOT NULL DEFAULT true,
 -- Origem da informacao de rastreio. Sem integracao real, MANUAL.
 tracking_mode text NOT NULL DEFAULT 'MANUAL' CHECK(tracking_mode IN ('MANUAL','WEBHOOK')),
 -- Endereco de entrega obrigatorio na aprovacao.
 require_shipping_address boolean NOT NULL DEFAULT true,
 updated_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. Pedido de venda.
-- =====================================================================
CREATE TABLE public.sales_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 order_number text NOT NULL,
 company_id uuid NOT NULL,
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
 customer_profile_id uuid,
  FOREIGN KEY(organization_id,customer_profile_id) REFERENCES public.customer_profiles(organization_id,id),
 -- Vinculo permanente com a proposta e a versao aceita. O indice unico abaixo
 -- e a garantia de banco de que a mesma proposta nao vira dois pedidos.
 sales_quote_id uuid,
  FOREIGN KEY(organization_id,sales_quote_id) REFERENCES public.sales_quotes(organization_id,id),
 sales_quote_version integer CHECK(sales_quote_version>0),
 sales_opportunity_id uuid,
  FOREIGN KEY(organization_id,sales_opportunity_id) REFERENCES public.sales_opportunities(organization_id,id),
 representative_id uuid,
  FOREIGN KEY(organization_id,representative_id) REFERENCES public.sales_representatives(organization_id,id),
 price_table_id uuid,
  FOREIGN KEY(organization_id,price_table_id) REFERENCES public.price_tables(organization_id,id),
 source_type text NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('QUOTE_CONVERSION','MANUAL')),
 order_date date NOT NULL DEFAULT current_date,
 expected_delivery_date date,
 payment_terms_id uuid,
  FOREIGN KEY(organization_id,payment_terms_id) REFERENCES public.commercial_payment_terms(organization_id,id),
 -- Condicao comercial congelada: o texto vigente na negociacao.
 payment_terms_snapshot text,
 shipping_address_id uuid,
  FOREIGN KEY(organization_id,shipping_address_id) REFERENCES public.company_addresses(organization_id,id),
 billing_address_id uuid,
  FOREIGN KEY(organization_id,billing_address_id) REFERENCES public.company_addresses(organization_id,id),
 -- Endereco como existia no aceite, para nao reconstituir historico pelo catalogo.
 address_snapshot jsonb NOT NULL DEFAULT '{}',
 company_snapshot jsonb NOT NULL DEFAULT '{}',
 price_snapshot jsonb NOT NULL DEFAULT '{}',
 currency text NOT NULL DEFAULT 'BRL',
 subtotal numeric(16,2) NOT NULL DEFAULT 0 CHECK(subtotal>=0),
 discount_total numeric(16,2) NOT NULL DEFAULT 0 CHECK(discount_total>=0),
 freight_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(freight_amount>=0),
 tax_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
 total_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(total_amount>=0),
 -- Estado comercial. Unico campo que a maquina de estados governa.
 status text NOT NULL DEFAULT 'DRAFT'
   CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT',
                    'PARTIALLY_FULFILLED','FULFILLED','CLOSED','CANCELED')),
 -- Situacao do estoque e do atendimento, derivadas, nunca editaveis a mao.
 stock_status text NOT NULL DEFAULT 'NOT_EVALUATED'
   CHECK(stock_status IN ('NOT_EVALUATED','SUFFICIENT','INSUFFICIENT','PARTIAL','RESERVED','MAKE_TO_ORDER')),
 fulfillment_status text NOT NULL DEFAULT 'NOT_STARTED'
   CHECK(fulfillment_status IN ('NOT_STARTED','IN_PROGRESS','PARTIAL','COMPLETE')),
 commercial_notes text,
 internal_notes text,
 -- CreditCheckResult congelado no momento da aprovacao.
 credit_check_result jsonb,
 credit_checked_at timestamptz,
 approved_by uuid REFERENCES public.profiles,
 approved_at timestamptz,
 -- Politica efetivamente aplicada na aprovacao (alcada, overrides, credito).
 approval_policy jsonb NOT NULL DEFAULT '{}',
 submitted_at timestamptz,
 availability_checked_at timestamptz,
 canceled_at timestamptz,
 cancel_reason text,
 closed_at timestamptz,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,order_number),
 UNIQUE(organization_id,id),
 CHECK(expected_delivery_date IS NULL OR expected_delivery_date>=order_date)
);
CREATE UNIQUE INDEX sales_orders_quote_once ON public.sales_orders(organization_id,sales_quote_id)
  WHERE sales_quote_id IS NOT NULL;
CREATE INDEX sales_orders_tenant ON public.sales_orders(organization_id,created_at DESC);
CREATE INDEX sales_orders_status ON public.sales_orders(organization_id,status,order_date DESC);
CREATE INDEX sales_orders_company ON public.sales_orders(organization_id,company_id,created_at DESC);

CREATE TABLE public.sales_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 product_variant_id uuid NOT NULL REFERENCES public.product_variants,
 -- Identificacao e descricao como estavam na negociacao. O catalogo muda;
 -- o pedido ja怪异 no precisa mudar.
 sku_snapshot text NOT NULL,
 description_snapshot text NOT NULL,
 unit_snapshot text,
 price_snapshot jsonb NOT NULL DEFAULT '{}',
 ordered_quantity numeric(14,3) NOT NULL CHECK(ordered_quantity>0),
 approved_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(approved_quantity>=0),
 reserved_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(reserved_quantity>=0),
 picked_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(picked_quantity>=0),
 fulfilled_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(fulfilled_quantity>=0),
 delivered_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(delivered_quantity>=0),
 returned_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(returned_quantity>=0),
 unit_price numeric(16,4) NOT NULL CHECK(unit_price>=0),
 discount_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
 tax_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
 line_total numeric(16,2) NOT NULL CHECK(line_total>=0),
 expected_delivery_date date,
 -- STOCK: atende de estoque existente. MAKE_TO_ORDER: depende de producao
 -- (MASTER 011) e NAO cria ordem de producao sozinho.
 sourcing_type text NOT NULL DEFAULT 'STOCK' CHECK(sourcing_type IN ('STOCK','MAKE_TO_ORDER')),
 production_order_id uuid,
 status text NOT NULL DEFAULT 'OPEN'
   CHECK(status IN ('OPEN','PARTIALLY_FULFILLED','FULFILLED','CANCELED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,sales_order_id,product_variant_id),
 CHECK(approved_quantity<=ordered_quantity),
 CHECK(fulfilled_quantity<=approved_quantity OR approved_quantity=0),
 CHECK(delivered_quantity<=fulfilled_quantity),
 CHECK(reserved_quantity<=approved_quantity OR approved_quantity=0)
);
CREATE INDEX sales_order_items_tenant ON public.sales_order_items(organization_id,sales_order_id);
CREATE INDEX sales_order_items_variant ON public.sales_order_items(organization_id,product_variant_id);

CREATE TABLE public.sales_order_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 previous_status text, new_status text NOT NULL, reason text, details jsonb NOT NULL DEFAULT '{}',
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX sales_order_history_tenant ON public.sales_order_status_history(organization_id,sales_order_id,created_at);

-- Chave de operacao: repeticao acidental devolve o mesmo resultado.
CREATE TABLE public.sales_order_operation_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 operation_key uuid NOT NULL, operation text NOT NULL, payload jsonb NOT NULL,
 result jsonb NOT NULL, created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,operation_key), UNIQUE(organization_id,id)
);

-- Resultado da consulta de credito, congelado na aprovacao.
CREATE TABLE public.sales_credit_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 sales_order_id uuid,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 company_id uuid NOT NULL,
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
 evaluated_amount numeric(16,2) NOT NULL CHECK(evaluated_amount>=0),
 credit_limit numeric(16,2),
 open_receivables numeric(16,2) NOT NULL DEFAULT 0,
 overdue_amount numeric(16,2) NOT NULL DEFAULT 0,
 open_order_exposure numeric(16,2) NOT NULL DEFAULT 0,
 credit_available numeric(16,2),
 exposure_policy text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('APPROVED','WARNING','BLOCKED','OVERRIDDEN')),
 blocked_reasons text[] NOT NULL DEFAULT '{}',
 overrides jsonb NOT NULL DEFAULT '{}',
 result jsonb NOT NULL DEFAULT '{}',
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX sales_credit_checks_tenant ON public.sales_credit_checks(organization_id,sales_order_id,created_at DESC);

-- Demanda confirmada para o planejamento (MASTER 011). A tabela registra o
-- que o pedido exige; o consumo pelo motor MRP e integracao pendente e esta
-- documentada como nao implementada.
CREATE TABLE public.sales_demands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 sales_order_item_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_item_id) REFERENCES public.sales_order_items(organization_id,id),
 variant_id uuid NOT NULL REFERENCES public.product_variants,
 requested_quantity numeric(14,3) NOT NULL CHECK(requested_quantity>0),
 fulfilled_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(fulfilled_quantity>=0),
 pending_quantity numeric(14,3) GENERATED ALWAYS AS (greatest(0,requested_quantity-fulfilled_quantity)) STORED,
 required_date date NOT NULL,
 -- Stated para localizar a origem e evitar dupla contagem no planejamento.
 source_type text NOT NULL DEFAULT 'SALES_ORDER'
   CHECK(source_type IN ('SALES_ORDER','MAKE_TO_ORDER')),
 -- True quando a mesma demanda ja estava representada por oportunidade ou
 -- previsao comercial. O planejamento nao pode somar as duas.
 already_in_forecast boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','PARTIAL','CLOSED','CANCELED')),
 -- Preenchido quando o planejamento absorve a linha. Evita dupla contagem.
 consumed_by_planning_run_id uuid,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,sales_order_item_id)
);
CREATE INDEX sales_demands_tenant ON public.sales_demands(organization_id,status,required_date);

-- =====================================================================
-- 4. Reserva de estoque: afeta o disponivel, nunca o saldo fisico.
-- =====================================================================
CREATE TABLE public.inventory_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 sales_order_item_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_item_id) REFERENCES public.sales_order_items(organization_id,id),
 variant_id uuid NOT NULL REFERENCES public.product_variants,
 inventory_location_id uuid NOT NULL,
  FOREIGN KEY(organization_id,inventory_location_id) REFERENCES public.inventory_locations(organization_id,id),
 batch_id uuid,
 -- Saldo ainda livre desta reserva: quantity - fulfilled - released.
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 fulfilled_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(fulfilled_quantity>=0),
 released_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(released_quantity>=0),
 status text NOT NULL DEFAULT 'ACTIVE'
   CHECK(status IN ('ACTIVE','PARTIALLY_CONSUMED','CONSUMED','RELEASED','EXPIRED','CANCELED')),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 consumed_at timestamptz, released_at timestamptz,
 release_reason text,
 idempotency_key text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,idempotency_key),
 CHECK(fulfilled_quantity+released_quantity<=quantity)
);
CREATE INDEX inventory_reservations_active
  ON public.inventory_reservations(organization_id,variant_id,inventory_location_id)
  WHERE status IN ('ACTIVE','PARTIALLY_CONSUMED');
CREATE INDEX inventory_reservations_order ON public.inventory_reservations(organization_id,sales_order_id);

-- =====================================================================
-- 5. Atendimento: separacao, conferencia, embalagem.
-- =====================================================================
CREATE TABLE public.fulfillment_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 fulfillment_number text NOT NULL,
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 -- Localizacao de atendimento. Local de parceiro NAO pode atender venda direta.
 source_location_id uuid NOT NULL,
  FOREIGN KEY(organization_id,source_location_id) REFERENCES public.inventory_locations(organization_id,id),
 status text NOT NULL DEFAULT 'DRAFT'
   CHECK(status IN ('DRAFT','READY_FOR_PICKING','PICKING','PICKED','PACKING','READY_FOR_SHIPMENT','SHIPPED','CANCELED')),
 priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
 planned_date date,
 assigned_user_id uuid REFERENCES public.profiles,
 -- Guarda de transicao, para o historico nao depender de log.
 cancel_reason text,
 completed_at timestamptz,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,fulfillment_number), UNIQUE(organization_id,id)
);
CREATE INDEX fulfillment_orders_tenant ON public.fulfillment_orders(organization_id,status,planned_date);

CREATE TABLE public.picking_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 fulfillment_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,fulfillment_order_id) REFERENCES public.fulfillment_orders(organization_id,id),
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 location_id uuid,
  FOREIGN KEY(organization_id,location_id) REFERENCES public.inventory_locations(organization_id,id),
 status text NOT NULL DEFAULT 'PENDING'
   CHECK(status IN ('PENDING','IN_PROGRESS','PICKED','CONFIRMED','CANCELED')),
 assigned_user_id uuid REFERENCES public.profiles,
 started_at timestamptz, picked_at timestamptz,
 confirmed_by uuid REFERENCES public.profiles, confirmed_at timestamptz,
 notes text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX picking_tasks_tenant ON public.picking_tasks(organization_id,status,created_at DESC);

CREATE TABLE public.picking_task_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 picking_task_id uuid NOT NULL,
  FOREIGN KEY(organization_id,picking_task_id) REFERENCES public.picking_tasks(organization_id,id),
 sales_order_item_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_item_id) REFERENCES public.sales_order_items(organization_id,id),
 variant_id uuid NOT NULL REFERENCES public.product_variants,
 sku_snapshot text NOT NULL, description_snapshot text NOT NULL,
 barcode_snapshot text,
 -- As quatro referencias da conferencia (ver MASTER 013 secao 24).
 requested_quantity numeric(14,3) NOT NULL CHECK(requested_quantity>0),
 reserved_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(reserved_quantity>=0),
 picked_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(picked_quantity>=0),
 confirmed_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(confirmed_quantity>=0),
 location_id uuid,
  FOREIGN KEY(organization_id,location_id) REFERENCES public.inventory_locations(organization_id,id),
 batch_id uuid,
  FOREIGN KEY(organization_id,batch_id) REFERENCES public.inventory_batches(organization_id,id),
 -- Divergencia entre o separado e o conferido. Vazio = conferido.
 difference_reason text CHECK(difference_reason IS NULL OR difference_reason IN
   ('SHORT_PICK','OVER_PICK','WRONG_ITEM','WRONG_BATCH','DAMAGED','OTHER')),
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX picking_task_items_task ON public.picking_task_items(organization_id,picking_task_id);
CREATE INDEX picking_task_items_variant ON public.picking_task_items(organization_id,variant_id);

CREATE TABLE public.packing_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 fulfillment_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,fulfillment_order_id) REFERENCES public.fulfillment_orders(organization_id,id),
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 packed_by uuid REFERENCES public.profiles,
 packed_at timestamptz NOT NULL DEFAULT now(),
 -- Peso e dimensao sao INFORMADOS. O sistema nunca estima valor inexistente.
 gross_weight_kg numeric(14,3) CHECK(gross_weight_kg IS NULL OR gross_weight_kg>0),
 weight_informed boolean NOT NULL DEFAULT false,
 length_cm numeric(12,2) CHECK(length_cm IS NULL OR length_cm>0),
 width_cm numeric(12,2) CHECK(width_cm IS NULL OR width_cm>0),
 height_cm numeric(12,2) CHECK(height_cm IS NULL OR height_cm>0),
 volume_count integer NOT NULL DEFAULT 1 CHECK(volume_count>0),
 notes text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX packing_records_tenant ON public.packing_records(organization_id,fulfillment_order_id);

CREATE TABLE public.packing_record_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 packing_record_id uuid NOT NULL,
  FOREIGN KEY(organization_id,packing_record_id) REFERENCES public.packing_records(organization_id,id),
 sales_order_item_id uuid,
  FOREIGN KEY(organization_id,sales_order_item_id) REFERENCES public.sales_order_items(organization_id,id),
 variant_id uuid NOT NULL REFERENCES public.product_variants,
 sku_snapshot text NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 batch_id uuid, UNIQUE(organization_id,id)
);

CREATE TABLE public.packing_record_volumes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 packing_record_id uuid NOT NULL,
  FOREIGN KEY(organization_id,packing_record_id) REFERENCES public.packing_records(organization_id,id),
 volume_number text NOT NULL,
 gross_weight_kg numeric(14,3) CHECK(gross_weight_kg IS NULL OR gross_weight_kg>0),
 weight_informed boolean NOT NULL DEFAULT false,
 length_cm numeric(12,2) CHECK(length_cm IS NULL OR length_cm>0),
 width_cm numeric(12,2) CHECK(width_cm IS NULL OR width_cm>0),
 height_cm numeric(12,2) CHECK(height_cm IS NULL OR height_cm>0),
 notes text,
 UNIQUE(organization_id,packing_record_id,volume_number), UNIQUE(organization_id,id)
);

-- =====================================================================
-- 6. Expedicao. Despatched nao e entregue.
-- =====================================================================
CREATE TABLE public.carriers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0),
 document_type text CHECK(document_type IS NULL OR document_type IN ('CNPJ','CPF','OTHER')),
 document_number text,
 contact_name text, contact_email text, contact_phone text,
 modality text NOT NULL DEFAULT 'COURIER'
   CHECK(modality IN ('ROAD','AIR','SEA','COURIER','OWN_FLEET','OTHER')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 notes text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,name),
 UNIQUE(organization_id,document_type,document_number)
);
CREATE INDEX carriers_tenant ON public.carriers(organization_id,status);

CREATE TABLE public.shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 shipment_number text NOT NULL,
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 fulfillment_order_id uuid,
  FOREIGN KEY(organization_id,fulfillment_order_id) REFERENCES public.fulfillment_orders(organization_id,id),
 picking_task_id uuid,
  FOREIGN KEY(organization_id,picking_task_id) REFERENCES public.picking_tasks(organization_id,id),
 source_location_id uuid NOT NULL,
  FOREIGN KEY(organization_id,source_location_id) REFERENCES public.inventory_locations(organization_id,id),
 destination_address_id uuid,
  FOREIGN KEY(organization_id,destination_address_id) REFERENCES public.company_addresses(organization_id,id),
 address_snapshot jsonb NOT NULL DEFAULT '{}',
 carrier_id uuid,
  FOREIGN KEY(organization_id,carrier_id) REFERENCES public.carriers(organization_id,id),
 tracking_code text,
 -- De onde vem a informacao de rastreio. Sem provedor real, MANUAL.
 tracking_source text NOT NULL DEFAULT 'MANUAL' CHECK(tracking_source IN ('MANUAL','CARRIER_WEBHOOK')),
 shipping_method text NOT NULL DEFAULT 'STANDARD'
   CHECK(shipping_method IN ('STANDARD','EXPRESS','RETIRE','OWN_TRANSPORT','OTHER')),
 status text NOT NULL DEFAULT 'DRAFT'
   CHECK(status IN ('DRAFT','READY','DISPATCHED','IN_TRANSIT','DELIVERED','PARTIALLY_DELIVERED',
                    'DELIVERY_EXCEPTION','RETURNED','CANCELED')),
 dispatched_at timestamptz, shipped_at timestamptz,
 expected_delivery_at timestamptz, delivered_at timestamptz,
 -- Soma das quantidades entregues. Expedir nao preenche este campo.
 delivered_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(delivered_quantity>=0),
 exception_notes text,
 cancel_reason text,
 -- Chave idempotente da baixa oficial no ledger.
 dispatch_key text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,shipment_number), UNIQUE(organization_id,id)
);
CREATE INDEX shipments_tenant ON public.shipments(organization_id,status,created_at DESC);
CREATE INDEX shipments_order ON public.shipments(organization_id,sales_order_id);
CREATE INDEX shipments_due ON public.shipments(organization_id,expected_delivery_at)
  WHERE status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED');

CREATE TABLE public.shipment_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 shipment_id uuid NOT NULL,
  FOREIGN KEY(organization_id,shipment_id) REFERENCES public.shipments(organization_id,id),
 sales_order_item_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_item_id) REFERENCES public.sales_order_items(organization_id,id),
 variant_id uuid NOT NULL REFERENCES public.product_variants,
 sku_snapshot text NOT NULL, description_snapshot text NOT NULL,
 -- Quantidade efetivamente expedida (nao a confirmada, nao a entregue).
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 delivered_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(delivered_quantity>=0),
 returned_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(returned_quantity>=0),
 batch_id uuid,
  FOREIGN KEY(organization_id,batch_id) REFERENCES public.inventory_batches(organization_id,id),
 -- Baixa oficial correspondente. Garante "nunca duas baixas".
 inventory_movement_id uuid,
 reservation_id uuid,
  FOREIGN KEY(organization_id,reservation_id) REFERENCES public.inventory_reservations(organization_id,id),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,shipment_id,sales_order_item_id,coalesce(batch_id,'00000000-0000-0000-0000-000000000000'::uuid)),
 CHECK(delivered_quantity<=quantity)
);
CREATE INDEX shipment_items_shipment ON public.shipment_items(organization_id,shipment_id);

CREATE TABLE public.shipment_volumes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 shipment_id uuid NOT NULL,
  FOREIGN KEY(organization_id,shipment_id) REFERENCES public.shipments(organization_id,id),
 packing_volume_id uuid,
  FOREIGN KEY(organization_id,packing_volume_id) REFERENCES public.packing_record_volumes(organization_id,id),
 volume_number text NOT NULL,
 gross_weight_kg numeric(14,3) CHECK(gross_weight_kg IS NULL OR gross_weight_kg>0),
 weight_informed boolean NOT NULL DEFAULT false,
 carrier_tracking_code text, notes text,
 UNIQUE(organization_id,shipment_id,volume_number), UNIQUE(organization_id,id)
);

-- Comprovante de entrega. Storage privado; caminho e validado pelo servidor.
CREATE TABLE public.shipment_delivery_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 shipment_id uuid NOT NULL,
  FOREIGN KEY(organization_id,shipment_id) REFERENCES public.shipments(organization_id,id),
 proof_type text NOT NULL DEFAULT 'NOTE'
   CHECK(proof_type IN ('RECEIPT','SIGNATURE','DOCUMENT','PHOTO','NOTE')),
 file_path text, file_name text, mime_type text,
 signature_name text, received_by text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 notes text, occurrences text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX shipment_proofs_tenant ON public.shipment_delivery_proofs(organization_id,shipment_id);

-- =====================================================================
-- 7. Devolucao de cliente. Nao reutiliza PartnerReturn nem SupplierReturn.
-- =====================================================================
CREATE TABLE public.customer_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 return_number text NOT NULL,
 company_id uuid NOT NULL,
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
 sales_order_id uuid NOT NULL,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 shipment_id uuid,
  FOREIGN KEY(organization_id,shipment_id) REFERENCES public.shipments(organization_id,id),
 reason text NOT NULL CHECK(length(trim(reason))>0), reason_detail text,
 status text NOT NULL DEFAULT 'DRAFT'
   CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','RECEIVING','RECEIVED','INSPECTED',
                    'COMPLETED','REJECTED','CANCELED')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES public.profiles,
 approved_at timestamptz,
 -- Solicitacao NAO devolve estoque. Somente o recebimento fisico move o ledger.
 received_at timestamptz, received_by uuid REFERENCES public.profiles,
 -- Destino do recebimento. Mercadoria danificada exige QUARANTINE/INSPECTION.
 destination_location_id uuid,
  FOREIGN KEY(organization_id,destination_location_id) REFERENCES public.inventory_locations(organization_id,id),
 -- Pedido de ajuste financeiro. O MASTER 013 NAO executa o estorno: registra a
 -- solicitacao para o MASTER 008/014 tratar conforme regra e aprovacao.
 financial_action text NOT NULL DEFAULT 'NONE'
   CHECK(financial_action IN ('NONE','CREDIT_NOTE','AR_ADJUSTMENT','REVERSAL','REFUND')),
 financial_requested_at timestamptz, financial_reference text, financial_notes text,
 notes text,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,return_number), UNIQUE(organization_id,id)
);
CREATE INDEX customer_returns_tenant ON public.customer_returns(organization_id,status,created_at DESC);
CREATE INDEX customer_returns_order ON public.customer_returns(organization_id,sales_order_id);

CREATE TABLE public.customer_return_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 customer_return_id uuid NOT NULL,
  FOREIGN KEY(organization_id,customer_return_id) REFERENCES public.customer_returns(organization_id,id),
 sales_order_item_id uuid,
  FOREIGN KEY(organization_id,sales_order_item_id) REFERENCES public.sales_order_items(organization_id,id),
 -- Referencia a expedicao original: a devolucao sempre aponta para um fato.
 shipment_item_id uuid,
  FOREIGN KEY(organization_id,shipment_item_id) REFERENCES public.shipment_items(organization_id,id),
 variant_id uuid NOT NULL REFERENCES public.product_variants,
 sku_snapshot text NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 -- Quantidade que realmente entrou no estoque apos inspecao.
 received_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
 condition text NOT NULL DEFAULT 'UNOPENED'
   CHECK(condition IN ('UNOPENED','RESELLABLE','DAMAGED','DEFECTIVE','OTHER')),
 -- Onde a unidade foi parar. Nada volta a vendavel por padrao.
 destination text NOT NULL DEFAULT 'PENDING'
   CHECK(destination IN ('PENDING','SELLABLE','QUARANTINE','SCRAP')),
 reason text, batch_id uuid, notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX customer_return_items_tenant ON public.customer_return_items(organization_id,customer_return_id);

-- =====================================================================
-- 8. Central de excecoes operacionais.
-- =====================================================================
CREATE TABLE public.logistics_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations,
 exception_type text NOT NULL CHECK(exception_type IN
   ('INSUFFICIENT_STOCK','RESERVATION_CONFLICT','INVALID_SKU','WRONG_BATCH','PICKING_DIFFERENCE',
    'PACKING_DIFFERENCE','SHIPMENT_DUPLICATE','DELIVERY_DELAY','DELIVERY_FAILURE','DAMAGED_GOODS',
    'CUSTOMER_REFUSAL')),
 severity text NOT NULL DEFAULT 'WARNING' CHECK(severity IN ('INFO','WARNING','ERROR','BLOCKING')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','IGNORED')),
 sales_order_id uuid,
  FOREIGN KEY(organization_id,sales_order_id) REFERENCES public.sales_orders(organization_id,id),
 sales_order_item_id uuid,
 fulfillment_order_id uuid,
  FOREIGN KEY(organization_id,fulfillment_order_id) REFERENCES public.fulfillment_orders(organization_id,id),
 shipment_id uuid,
  FOREIGN KEY(organization_id,shipment_id) REFERENCES public.shipments(organization_id,id),
 customer_return_id uuid,
  FOREIGN KEY(organization_id,customer_return_id) REFERENCES public.customer_returns(organization_id,id),
 picking_task_id uuid,
  FOREIGN KEY(organization_id,picking_task_id) REFERENCES public.picking_tasks(organization_id,id),
 reservation_id uuid,
  FOREIGN KEY(organization_id,reservation_id) REFERENCES public.inventory_reservations(organization_id,id),
 variant_id uuid REFERENCES public.product_variants,
 message text NOT NULL CHECK(length(trim(message))>0),
 details jsonb NOT NULL DEFAULT '{}',
 assigned_to uuid REFERENCES public.profiles,
 resolution text, resolved_at timestamptz, resolved_by uuid REFERENCES public.profiles,
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX logistics_exceptions_tenant ON public.logistics_exceptions(organization_id,status,created_at DESC);
CREATE INDEX logistics_exceptions_type ON public.logistics_exceptions(organization_id,exception_type,status);
-- Uma excecao do mesmo tipo sobre o mesmo fato nao duplica.
CREATE UNIQUE INDEX logistics_exceptions_dedupe
  ON public.logistics_exceptions(organization_id,exception_type,shipment_id,picking_task_id,sales_order_item_id)
  WHERE shipment_id IS NOT NULL OR picking_task_id IS NOT NULL OR sales_order_item_id IS NOT NULL;
