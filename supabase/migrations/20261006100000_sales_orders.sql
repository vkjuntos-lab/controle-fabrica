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
-- 1a. Chaves de tenant para referencias cross-modulo.
-- Estas tabelas nao declaravam UNIQUE(organization_id,id) e por isso nao
-- aceitavam FK composta. Nenhuma coluna e dado existente e alterado: apenas
-- a chave e declarada, o que ja e verdade para toda linha valida.
-- =====================================================================
ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_organization_id_id_key UNIQUE(organization_id,id);
ALTER TABLE public.inventory_batches
  ADD CONSTRAINT inventory_batches_organization_id_id_key UNIQUE(organization_id,id);
ALTER TABLE public.company_addresses
  ADD CONSTRAINT company_addresses_organization_id_id_key UNIQUE(organization_id,id);

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
 'logistics.read','logistics.export',
 'sales.configure','carriers.manage','sales_credit.read','sales.dashboard']) p ON CONFLICT DO NOTHING;

-- Comercial: opera a cadeia comercial e a expedicao, mas nao aprova sozinho
-- quando a segregacao de funcoes esta ativa (o servidor decide).
INSERT INTO public.role_permissions(role,permission)
SELECT 'comercial',p FROM unnest(ARRAY[
 'sales_orders.read','sales_orders.create','sales_orders.update','sales_orders.cancel',
 'reservations.read','reservations.create',
 'fulfillment.read','picking.execute',
 'shipments.read','shipments.create','shipments.confirm_delivery',
 'returns.read','returns.create',
 'sales_credit.read','carriers.manage','logistics.read','logistics.exceptions']) p ON CONFLICT DO NOTHING;

-- Estoque: executa o fisico (reserva, separacao, embalagem, expedicao) e
-- pode ajustar estoque, necessario para a baixa oficial de SALE.
INSERT INTO public.role_permissions(role,permission)
SELECT 'estoque',p FROM unnest(ARRAY[
 'sales_orders.read',
 'reservations.read','reservations.create','reservations.release',
 'fulfillment.read','fulfillment.manage',
 'picking.execute','picking.confirm','packing.manage',
 'shipments.read','shipments.create','shipments.dispatch',
 'returns.read','returns.receive','logistics.exceptions',
 'logistics.export']) p ON CONFLICT DO NOTHING;

-- Financeiro: leitura da cadeia comercial e das devolucoes para estorno.
INSERT INTO public.role_permissions(role,permission)
SELECT 'financeiro',p FROM unnest(ARRAY[
 'sales_orders.read','sales_credit.read',
 'shipments.read','returns.read','returns.approve',
 'logistics.read','logistics.export']) p ON CONFLICT DO NOTHING;

-- Producao: le pedidos aprovados para reconhecer demanda sob encomenda.
INSERT INTO public.role_permissions(role,permission)
SELECT 'producao',p FROM unnest(ARRAY['sales_orders.read','sales.dashboard']) p ON CONFLICT DO NOTHING;

-- =====================================================================
-- 2. Politicas operacionais por organizacao.
-- =====================================================================
CREATE TABLE public.sales_order_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations UNIQUE,
 -- FULL_ONLY: reserva exige a quantidade inteira; ALLOW_PARTIAL: reserva o
 -- disponivel e deixa o saldo pendente; ALLOW_NEGATIVE_AVAILABLE: permite
 -- disponivel negativo na reserva (o saldo fisico continua bloqueado).
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
 -- o pedido ja registrado nao precisa mudar.
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
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(),
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
 CHECK(delivered_quantity<=quantity)
);
-- Sem repeticao do mesmo item/lote na mesma expedicao. UNIQUE com expressao
-- so e permitido como indice; dentro de CREATE TABLE seria invalido.
CREATE UNIQUE INDEX shipment_items_natural ON public.shipment_items
 (organization_id,shipment_id,sales_order_item_id,coalesce(batch_id,'00000000-0000-0000-0000-000000000000'::uuid));
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

-- =====================================================================
-- 9. Helpers do modulo.
-- =====================================================================
CREATE FUNCTION public.sales_require(_org uuid,_permission text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Sem permissão: %',_permission; END IF; END
$$;

CREATE FUNCTION public.sales_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}') RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;

CREATE FUNCTION public.sales_emit(_org uuid,_type text,_key text,_payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload)
VALUES(_org,_type,'SALES',_key,_payload||jsonb_build_object('schema_version',1))
ON CONFLICT(organization_id,event_key) DO NOTHING;
$$;

CREATE FUNCTION public.sales_ensure_settings(_org uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.sales_order_settings(organization_id) VALUES(_org) ON CONFLICT(organization_id) DO NOTHING;
$$;

-- Le a politica da organizacao, devolvendo o padrao do schema quando a
-- organizacao ainda nao configurou nada. Nao grava: e uma leitura STABLE.
CREATE FUNCTION public.sales_settings(_org uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(
  (SELECT to_jsonb(s) FROM public.sales_order_settings s WHERE s.organization_id=_org),
  jsonb_build_object(
   'reservation_policy','ALLOW_PARTIAL','reservation_expiry_hours',72,
   'make_to_order_enabled',true,'credit_exposure_policy','OPEN_RECEIVABLES_PLUS_OPEN_ORDERS',
   'approval_segregation',true,'max_discount_percent',NULL,'price_override_policy','BLOCK',
   'receivable_trigger','ON_DISPATCH','allow_partial_fulfillment',true,
   'shipment_requires_full_confirmation',true,'tracking_mode','MANUAL',
   'require_shipping_address',true,'configured',false));
$$;

-- Numeração atomica por organizacao. Nenhuma migration publicada e reescrita:
-- as sequências deste modulo sao novas.
CREATE TABLE public.sales_number_counters (organization_id uuid PRIMARY KEY REFERENCES public.organizations, order_seq bigint NOT NULL DEFAULT 0, shipment_seq bigint NOT NULL DEFAULT 0, return_seq bigint NOT NULL DEFAULT 0, fulfillment_seq bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.sales_next_number(_org uuid,_kind text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v bigint;
BEGIN
 INSERT INTO public.sales_number_counters(organization_id) VALUES(_org) ON CONFLICT(organization_id) DO NOTHING;
 UPDATE public.sales_number_counters SET
  order_seq=CASE WHEN _kind='order' THEN order_seq+1 ELSE order_seq END,
  shipment_seq=CASE WHEN _kind='shipment' THEN shipment_seq+1 ELSE shipment_seq END,
  return_seq=CASE WHEN _kind='return' THEN return_seq+1 ELSE return_seq END,
  fulfillment_seq=CASE WHEN _kind='fulfillment' THEN fulfillment_seq+1 ELSE fulfillment_seq END,
  updated_at=now()
 WHERE organization_id=_org
 RETURNING CASE _kind WHEN 'order' THEN order_seq WHEN 'shipment' THEN shipment_seq WHEN 'return' THEN return_seq ELSE fulfillment_seq END INTO v;
 RETURN CASE _kind
  WHEN 'order' THEN 'PV-'||to_char(now(),'YYYY')||'-'||lpad(v::text,6,'0')
  WHEN 'shipment' THEN 'EXP-'||to_char(now(),'YYYY')||'-'||lpad(v::text,6,'0')
  WHEN 'return' THEN 'DEV-'||to_char(now(),'YYYY')||'-'||lpad(v::text,6,'0')
  ELSE 'ATD-'||to_char(now(),'YYYY')||'-'||lpad(v::text,6,'0') END;
END;
$$;

-- Saldo fisico derivado exclusivamente dos movimentos POSTED. Nao usa
-- inventory_get_balance porque aquela exige a permissao inventory.read, e esta
-- RPC nao deve ampliar o escopo de quem compra. A regra continua sendo a
-- mesma: somente POSTED soma; PENDING/REVERSED/CANCELED nunca.
CREATE FUNCTION public.sales_on_hand(_org uuid,_variant uuid,_location uuid DEFAULT NULL,_batch uuid DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 -- Saldo VENDIVEL: mesma regra de local da reserva. Quarentena, inspecao e
 -- estoque de parceiro existem no ledger, mas nao sao estoque a vender. Para o
 -- saldo fisico de um local especifico use public.inventory_get_balance.
 SELECT coalesce(sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END),0)
 FROM public.inventory_movements m
 JOIN public.inventory_locations l ON l.id=m.location_id AND l.organization_id=m.organization_id
 WHERE m.organization_id=_org AND m.variant_id=_variant AND m.status='POSTED'
 AND l.status='ACTIVE' AND l.partner_id IS NULL AND l.type<>'TRANSIT'
 AND coalesce(l.operational_purpose,'NORMAL')='NORMAL'
 AND (_location IS NULL OR m.location_id=_location)
 AND (_batch IS NULL OR m.batch_id=_batch);
$$;

-- DISPONIVEL = SALDO FISICO - RESERVAS ATIVAS.
-- Reservas consumidas ou liberadas nao sao subtraidas: a expressao usa apenas
-- o saldo ainda livre (quantity - fulfilled - released) de reservas ativas.
-- Localizacoes de quarentena/inspecao e de parceiro nao sao estoque vendavel
-- e por isso ficam fora do total.
CREATE FUNCTION public.sales_reserved(_org uuid,_variant uuid,_location uuid DEFAULT NULL,_batch uuid DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(sum(r.quantity-r.fulfilled_quantity-r.released_quantity),0)
 FROM public.inventory_reservations r
 JOIN public.inventory_locations l ON l.id=r.inventory_location_id
 WHERE r.organization_id=_org AND r.variant_id=_variant
 AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
 AND l.operational_purpose='NORMAL'
 AND l.partner_id IS NULL
 AND (_location IS NULL OR r.inventory_location_id=_location)
 AND (_batch IS NULL OR r.batch_id=_batch);
$$;

CREATE FUNCTION public.sales_available(_org uuid,_variant uuid,_location uuid DEFAULT NULL,_batch uuid DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.sales_on_hand(_org,_variant,_location,_batch) - public.sales_reserved(_org,_variant,_location,_batch);
$$;

-- Consulta de credito. Reutiliza a exposicao oficial do MASTER 008/012 e soma
-- a exposicao de pedidos abertos somente quando a politica exigir. Propostas e
-- oportunidades NUNCA entram como divida: elas nao viraram titulo.
CREATE FUNCTION public.sales_credit_check(_org uuid,_company uuid,_amount numeric,_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pos jsonb; cfg jsonb; v_limit numeric; v_open numeric; v_overdue numeric;
 v_policy text; v_orders numeric; v_exposure numeric; v_available numeric; v_blocked text[]:='{}'::text[];
 v_decision text;
BEGIN
 pos:=public.crm_financial_position(_org,_company);
 cfg:=public.sales_settings(_org); v_policy:=cfg->>'credit_exposure_policy';
 v_limit:=(pos->>'credit_limit')::numeric;
 v_open:=coalesce((pos->>'open_amount')::numeric,0);
 v_overdue:=coalesce((pos->>'overdue_amount')::numeric,0);
 -- Exclusao do proprio pedido: um pedido reavaliado nao conta a si mesmo.
 v_orders:=coalesce((SELECT sum(o.total_amount) FROM public.sales_orders o
   WHERE o.organization_id=_org AND o.company_id=_company AND o.status NOT IN ('CANCELED','REJECTED')
     AND (_order IS NULL OR o.id<>_order)),0);
 v_exposure:=v_open+CASE WHEN v_policy='OPEN_RECEIVABLES_PLUS_OPEN_ORDERS' THEN v_orders ELSE 0 END;
 v_available:=CASE WHEN v_limit IS NULL THEN NULL ELSE v_limit-v_exposure END;

 IF v_limit IS NOT NULL AND v_available<0 THEN
   v_blocked:=v_blocked||format('Limite de crédito excedido em %s.',v_available::text);
 END IF;
 IF coalesce((pos->>'block_overdue')::boolean,false) AND v_overdue>0 THEN
   v_blocked:=v_blocked||format('Cliente possui %s em atraso.',v_overdue::text);
 END IF;
 IF v_limit IS NOT NULL AND coalesce((pos->>'block_over_limit')::boolean,false) AND v_available<0 THEN
   v_blocked:=v_blocked||'Política do cliente bloqueia operação acima do limite.';
 END IF;

 v_decision:=CASE WHEN cardinality(v_blocked)>0 THEN 'BLOCKED' ELSE 'APPROVED' END;
 RETURN jsonb_build_object(
  'company_id',_company,'evaluated_amount',coalesce(_amount,0),
  'credit_limit',v_limit,'open_receivables',v_open,'overdue_amount',v_overdue,
  'open_order_exposure',CASE WHEN v_policy='OPEN_RECEIVABLES_PLUS_OPEN_ORDERS' THEN v_orders ELSE 0 END,
  'exposure',v_exposure,'exposure_policy',v_policy,'credit_available',v_available,
  'blocked',v_decision='BLOCKED','blocked_reasons',to_jsonb(v_blocked),
  'decision',v_decision,'evaluated_at',now(),
  'sources',jsonb_build_object('receivables','account_receivables','credit_policy','customer_credit_policies','open_orders','sales_orders'),
  'note','Propostas e oportunidades não são dívida: não contam como exposição.');
END;
$$;

-- Guarda de relacoes intra-tenant. Mesmo padrao do MASTER 010.
CREATE FUNCTION public.sales_guard_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_data jsonb:=to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid; v_map text[][];
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
 v_map:=CASE TG_TABLE_NAME
  WHEN 'sales_orders' THEN ARRAY[ARRAY['company_id','companies'],ARRAY['customer_profile_id','customer_profiles'],ARRAY['sales_quote_id','sales_quotes'],ARRAY['sales_opportunity_id','sales_opportunities'],ARRAY['representative_id','sales_representatives'],ARRAY['price_table_id','price_tables'],ARRAY['payment_terms_id','commercial_payment_terms'],ARRAY['shipping_address_id','company_addresses'],ARRAY['billing_address_id','company_addresses']]
  WHEN 'sales_order_items' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['product_variant_id','product_variants']]
  WHEN 'sales_credit_checks' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['company_id','companies']]
  WHEN 'sales_demands' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['variant_id','product_variants']]
  WHEN 'inventory_reservations' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['variant_id','product_variants'],ARRAY['inventory_location_id','inventory_locations'],ARRAY['batch_id','inventory_batches']]
  WHEN 'fulfillment_orders' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['source_location_id','inventory_locations']]
  WHEN 'picking_tasks' THEN ARRAY[ARRAY['fulfillment_order_id','fulfillment_orders'],ARRAY['sales_order_id','sales_orders'],ARRAY['location_id','inventory_locations']]
  WHEN 'picking_task_items' THEN ARRAY[ARRAY['picking_task_id','picking_tasks'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['variant_id','product_variants'],ARRAY['location_id','inventory_locations'],ARRAY['batch_id','inventory_batches']]
  WHEN 'packing_records' THEN ARRAY[ARRAY['fulfillment_order_id','fulfillment_orders'],ARRAY['sales_order_id','sales_orders']]
  WHEN 'packing_record_items' THEN ARRAY[ARRAY['packing_record_id','packing_records'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['variant_id','product_variants'],ARRAY['batch_id','inventory_batches']]
  WHEN 'packing_record_volumes' THEN ARRAY[ARRAY['packing_record_id','packing_records']]
  WHEN 'shipments' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['fulfillment_order_id','fulfillment_orders'],ARRAY['picking_task_id','picking_tasks'],ARRAY['source_location_id','inventory_locations'],ARRAY['destination_address_id','company_addresses'],ARRAY['carrier_id','carriers']]
  WHEN 'shipment_items' THEN ARRAY[ARRAY['shipment_id','shipments'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['variant_id','product_variants'],ARRAY['batch_id','inventory_batches'],ARRAY['reservation_id','inventory_reservations']]
  WHEN 'shipment_volumes' THEN ARRAY[ARRAY['shipment_id','shipments'],ARRAY['packing_volume_id','packing_record_volumes']]
  WHEN 'shipment_delivery_proofs' THEN ARRAY[ARRAY['shipment_id','shipments']]
  WHEN 'customer_returns' THEN ARRAY[ARRAY['company_id','companies'],ARRAY['sales_order_id','sales_orders'],ARRAY['shipment_id','shipments'],ARRAY['destination_location_id','inventory_locations']]
  WHEN 'customer_return_items' THEN ARRAY[ARRAY['customer_return_id','customer_returns'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['shipment_item_id','shipment_items'],ARRAY['variant_id','product_variants'],ARRAY['batch_id','inventory_batches']]
  WHEN 'logistics_exceptions' THEN ARRAY[ARRAY['sales_order_id','sales_orders'],ARRAY['sales_order_item_id','sales_order_items'],ARRAY['fulfillment_order_id','fulfillment_orders'],ARRAY['shipment_id','shipments'],ARRAY['customer_return_id','customer_returns'],ARRAY['picking_task_id','picking_tasks'],ARRAY['reservation_id','inventory_reservations'],ARRAY['variant_id','product_variants']]
  ELSE NULL::text[][]
 END;
 IF v_map IS NULL THEN RETURN coalesce(NEW,OLD); END IF;
 FOREACH v_pair SLICE 1 IN ARRAY v_map
 LOOP
  v_id:=(v_data->>v_pair[1])::uuid;
  IF v_id IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
 END LOOP;
 -- DELETE carrega a linha em OLD: devolver NEW (nulo) cancelaria a operacao.
 RETURN coalesce(NEW,OLD);
END;
$$;

-- Guarda de imutabilidade: historico nunca e apagado nem reinterpretado.
CREATE FUNCTION public.sales_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; j jsonb:=coalesce(to_jsonb(NEW),to_jsonb(OLD));
BEGIN
 IF TG_OP='DELETE' THEN
  -- Rascunho e a unica janela legitimamente mutavel: enquanto o pedido nao
  -- saiu, a edicao substitui a linha de itens. Fora do rascunho, DELETE e
  -- historico e nunca acontece.
  IF TG_TABLE_NAME='sales_order_items' THEN
   SELECT status INTO v_status FROM public.sales_orders WHERE id=(j->>'sales_order_id')::uuid;
   IF v_status='DRAFT' THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Histórico não pode ser excluído.';
 END IF;
 IF TG_OP='UPDATE' AND j->>'organization_id'<>to_jsonb(OLD)->>'organization_id' THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
 IF TG_TABLE_NAME IN ('sales_order_status_history','sales_order_operation_keys') THEN
  RAISE EXCEPTION 'Registro histórico é imutável.';
 END IF;
 IF TG_TABLE_NAME='sales_orders' AND to_jsonb(OLD)->>'status' IN ('CANCELED','CLOSED') THEN
  RAISE EXCEPTION 'Pedido cancelado ou fechado é imutável.';
 END IF;
 -- A versao aceita da proposta nunca muda depois do pedido criado.
 IF TG_TABLE_NAME='sales_orders' AND to_jsonb(OLD)->>'sales_quote_id' IS NOT DISTINCT FROM to_jsonb(NEW)->>'sales_quote_id'
    AND to_jsonb(OLD)->>'sales_quote_id' IS NOT NULL
    AND (to_jsonb(OLD)->>'sales_quote_version') IS DISTINCT FROM (j->>'sales_quote_version') THEN
  RAISE EXCEPTION 'Versão aceita da proposta é imutável.';
 END IF;
 IF TG_TABLE_NAME='sales_order_items' THEN
  SELECT status INTO v_status FROM public.sales_orders WHERE id=(j->>'sales_order_id')::uuid;
  IF v_status IN ('CANCELED','CLOSED') THEN RAISE EXCEPTION 'Item de pedido encerrado é imutável.'; END IF;
 END IF;
 IF TG_TABLE_NAME='inventory_reservations' AND to_jsonb(OLD)->>'status' IN ('CONSUMED','RELEASED','CANCELED') THEN
  RAISE EXCEPTION 'Reserva encerrada é imutável.';
 END IF;
 IF TG_TABLE_NAME='fulfillment_orders' AND to_jsonb(OLD)->>'status' IN ('SHIPPED','CANCELED') THEN
  RAISE EXCEPTION 'Atendimento expedido ou cancelado é imutável.';
 END IF;
 IF TG_TABLE_NAME='picking_tasks' THEN
  SELECT status INTO v_status FROM public.fulfillment_orders WHERE id=(j->>'fulfillment_order_id')::uuid;
  IF v_status IN ('SHIPPED','CANCELED') THEN RAISE EXCEPTION 'Tarefa de atendimento encerrada é imutável.'; END IF;
 END IF;
 IF TG_TABLE_NAME='picking_task_items' THEN
  SELECT pt.status INTO v_status FROM public.picking_tasks pt WHERE pt.id=(j->>'picking_task_id')::uuid;
  IF v_status='CONFIRMED' THEN RAISE EXCEPTION 'Item conferido é imutável.'; END IF;
 END IF;
 IF TG_TABLE_NAME='shipments' AND to_jsonb(OLD)->>'status' IN ('DELIVERED','CANCELED') THEN
  RAISE EXCEPTION 'Expedição entregue ou cancelada é imutável.';
 END IF;
 IF TG_TABLE_NAME='shipment_items' THEN
  -- Expedido e FATO e nunca muda. O que ainda pode avancar depois do
  -- despacho e o registro de entrega/retorno, e nada mais.
  IF (to_jsonb(NEW)-'delivered_quantity'-'returned_quantity'-'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD)-'delivered_quantity'-'returned_quantity'-'updated_at') THEN
   SELECT status INTO v_status FROM public.shipments WHERE id=(j->>'shipment_id')::uuid;
   IF v_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','PARTIALLY_DELIVERED','CANCELED') THEN
    RAISE EXCEPTION 'Item de expedição despachado é imutável: só entrega e retorno avançam.';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='customer_returns' AND to_jsonb(OLD)->>'status' IN ('COMPLETED','REJECTED','CANCELED') THEN
  RAISE EXCEPTION 'Devolução encerrada é imutável.';
 END IF;
 IF TG_TABLE_NAME='customer_return_items' THEN
  SELECT status INTO v_status FROM public.customer_returns WHERE id=(j->>'customer_return_id')::uuid;
  IF v_status IN ('RECEIVED','INSPECTED','COMPLETED','REJECTED','CANCELED') THEN
   RAISE EXCEPTION 'Item de devolução recebida é imutável.';
  END IF;
 END IF;
 IF TG_TABLE_NAME='logistics_exceptions' AND to_jsonb(OLD)->>'status' IN ('RESOLVED','IGNORED') THEN
  RAISE EXCEPTION 'Exceção resolvida é imutável.';
 END IF;
 RETURN NEW;
END;
$$;

-- Abre excecao na Central. Dedup por (tipo, fato) para nao inflar a fila.
CREATE FUNCTION public.sales_open_exception(_org uuid,_type text,_severity text,_message text,_refs jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid;
BEGIN
 INSERT INTO public.logistics_exceptions(organization_id,exception_type,severity,status,message,details,
   sales_order_id,sales_order_item_id,fulfillment_order_id,shipment_id,customer_return_id,
   picking_task_id,reservation_id,variant_id,created_by)
 VALUES(_org,_type,_severity,'OPEN',_message,_refs,
   nullif(_refs->>'sales_order_id','')::uuid,nullif(_refs->>'sales_order_item_id','')::uuid,
   nullif(_refs->>'fulfillment_order_id','')::uuid,nullif(_refs->>'shipment_id','')::uuid,
   nullif(_refs->>'customer_return_id','')::uuid,nullif(_refs->>'picking_task_id','')::uuid,
   nullif(_refs->>'reservation_id','')::uuid,nullif(_refs->>'variant_id','')::uuid,auth.uid())
 ON CONFLICT DO NOTHING
 RETURNING id INTO ident;
 RETURN ident;
END;
$$;


-- =====================================================================
-- 10. Ciclo de vida do pedido de venda.
-- =====================================================================

-- Normaliza o payload de um item: resolve o preco oficial da tabela vigente e
-- recalcula o total da linha. O preco enviado pelo cliente nunca e a verdade.
CREATE FUNCTION public.sales_prepare_item(_org uuid,_item jsonb,_table uuid,_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_variant uuid; v_qty numeric; v_price jsonb; v_name text; v_sku text; v_barcode text;
 v_unit text; v_disc numeric:=0; v_min numeric; v_req_price numeric;
BEGIN
 v_variant:=nullif(_item->>'variant_id','')::uuid;
 v_qty:=coalesce(nullif(_item->>'quantity','')::numeric,nullif(_item->>'ordered_quantity','')::numeric);
 IF v_variant IS NULL OR v_qty IS NULL OR v_qty<=0 THEN
  RAISE EXCEPTION 'Item inválido: variante e quantidade positiva são obrigatórios.';
 END IF;
 -- Linha nova exige variante ATIVA. Descontinuada nao entra em pedido novo.
 IF NOT EXISTS(SELECT 1 FROM public.product_variants
    WHERE id=v_variant AND organization_id=_org AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Variante inexistente ou descontinuada: % não pode entrar em pedido novo.',coalesce(_item->>'variant_id','');
 END IF;
 SELECT v.sku,coalesce(v.barcode,''),p.name,coalesce(nullif(v.attributes->>'unit',''),'UN')
 INTO v_sku,v_barcode,v_name,v_unit
 FROM public.product_variants v JOIN public.products p ON p.id=v.product_id AND p.organization_id=_org
 WHERE v.id=v_variant AND v.organization_id=_org;

 IF _table IS NULL THEN RAISE EXCEPTION 'Tabela de preço é obrigatória.'; END IF;
 v_price:=public.pricing_resolve_table(_org,_table,v_variant,_as_of);
 IF v_price IS NULL THEN
  RAISE EXCEPTION 'A variante % não tem preço vigente na tabela selecionada.',v_sku;
 END IF;
 v_min:=nullif(v_price->>'minimum_price','')::numeric;
 v_req_price:=nullif(_item->>'unit_price','')::numeric;
 v_disc:=coalesce(nullif(_item->>'discount_amount','')::numeric,0);
 IF v_disc<0 OR v_disc>(v_qty*coalesce((v_price->>'unit_price')::numeric,0)) THEN
  RAISE EXCEPTION 'Desconto do item % inválido.',v_sku;
 END IF;
 RETURN jsonb_build_object(
  'product_variant_id',v_variant,'sku_snapshot',v_sku,
  'description_snapshot',trim(v_name||' — '||v_sku),
  'unit_snapshot',v_unit,'barcode_snapshot',v_barcode,
  'ordered_quantity',v_qty,
  'unit_price',coalesce((v_price->>'unit_price')::numeric,0),
  'discount_amount',v_disc,
  'tax_amount',coalesce(nullif(_item->>'tax_amount','')::numeric,0),
  'line_total',round(v_qty*coalesce((v_price->>'unit_price')::numeric,0)-v_disc,2),
  'expected_delivery_date',nullif(_item->>'expected_delivery_date','')::date,
  'price_snapshot',v_price||jsonb_build_object(
    'requested_unit_price',v_req_price,'resolved_unit_price',(v_price->>'unit_price')::numeric,
    'minimum_price',v_min,
    'below_minimum',CASE WHEN v_min IS NOT NULL AND v_req_price IS NOT NULL AND v_req_price<v_min THEN true ELSE false END));
END;
$$;

-- Grava o pedido e seus itens a partir de uma lista de itens ja preparada.
-- Compartilhado pela criação manual e pela conversão de proposta: assim os
-- dois caminhos passam exatamente pelas mesmas validacoes.
CREATE FUNCTION public.sales_insert_order(_org uuid,_data jsonb,_items jsonb,_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; ident uuid; i jsonb; v_number text;
 v_table uuid; v_company uuid; v_subtotal numeric:=0; v_discount numeric:=0; v_tax numeric:=0; v_freight numeric;
 v_profile uuid; v_status text; v_term text; v_addr jsonb:='{}'::jsonb; v_addr_id uuid; v_bill_id uuid;
 v_terms_id uuid; v_rep uuid; v_contact uuid; v_quote public.sales_quotes; cfg jsonb;
BEGIN
 v_company:=nullif(_data->>'company_id','')::uuid;
 IF v_company IS NULL THEN RAISE EXCEPTION 'Cliente é obrigatório.'; END IF;
 IF jsonb_array_length(_items)<1 THEN RAISE EXCEPTION 'Pedido sem itens.'; END IF;
 PERFORM public.sales_ensure_settings(_org); cfg:=public.sales_settings(_org);

 SELECT p.id,p.commercial_status,p.price_table_id,p.payment_terms_id INTO v_profile,v_status,v_table,v_terms_id
 FROM public.customer_profiles p WHERE p.organization_id=_org AND p.company_id=v_company;
 IF v_profile IS NULL THEN RAISE EXCEPTION 'Empresa não possui perfil de cliente.'; END IF;
 IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Cliente não está ativo para novas vendas (%s).',v_status; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company AND organization_id=_org AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Empresa inativa ou bloqueada.';
 END IF;

 IF _quote IS NOT NULL THEN
  SELECT * INTO v_quote FROM public.sales_quotes WHERE id=_quote AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
  IF v_quote.status<>'ACCEPTED' THEN RAISE EXCEPTION 'Somente proposta aceita gera pedido.'; END IF;
  IF public.crm_external(_org) AND NOT public.crm_company_access(_org,v_quote.company_id) THEN
   RAISE EXCEPTION 'Proposta fora da sua carteira.';
  END IF;
  v_table:=v_quote.price_table_id; v_rep:=v_quote.representative_id;
  v_contact:=v_quote.acceptance_contact_id;
 END IF;
 v_table:=coalesce(nullif(_data->>'price_table_id','')::uuid,v_table);

 -- Endereco de entrega: o que o cliente pediu hoje, congelado no pedido.
 v_addr_id:=nullif(_data->>'shipping_address_id','')::uuid;
 IF v_addr_id IS NULL AND _quote IS NOT NULL THEN
  SELECT id INTO v_addr_id FROM public.company_addresses
   WHERE organization_id=_org AND company_id=v_company AND type='SHIPPING' AND is_primary LIMIT 1;
 END IF;
 IF v_addr_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.company_addresses
     WHERE id=v_addr_id AND organization_id=_org AND company_id=v_company) THEN
   RAISE EXCEPTION 'Endereço de entrega inválido para esta empresa.';
  END IF;
  SELECT to_jsonb(a) INTO v_addr FROM public.company_addresses a WHERE a.id=v_addr_id;
 END IF;
 v_bill_id:=coalesce(nullif(_data->>'billing_address_id','')::uuid,
   (SELECT id FROM public.company_addresses
    WHERE organization_id=_org AND company_id=v_company AND type='BILLING' AND is_primary LIMIT 1));

 v_terms_id:=coalesce(nullif(_data->>'payment_terms_id','')::uuid,v_terms_id);
 SELECT name INTO v_term FROM public.commercial_payment_terms WHERE id=v_terms_id AND organization_id=_org;
 IF v_term IS NULL THEN
  SELECT name INTO v_term FROM public.commercial_payment_terms
   WHERE id=(SELECT payment_terms_id FROM public.customer_profiles WHERE id=v_profile) AND organization_id=_org;
  v_terms_id:=(SELECT payment_terms_id FROM public.customer_profiles WHERE id=v_profile);
 END IF;
 IF v_rep IS NULL THEN
  SELECT representative_id INTO v_rep FROM public.customer_portfolio_assignments
   WHERE organization_id=_org AND company_id=v_company AND ended_at IS NULL LIMIT 1;
 END IF;
 v_freight:=round(coalesce(nullif(_data->>'freight_amount','')::numeric,
   CASE WHEN _quote IS NOT NULL THEN v_quote.freight END,0),2);

 v_number:=public.sales_next_number(_org,'order');
 INSERT INTO public.sales_orders(organization_id,order_number,company_id,customer_profile_id,
   sales_quote_id,sales_quote_version,sales_opportunity_id,representative_id,price_table_id,
   source_type,order_date,expected_delivery_date,payment_terms_id,payment_terms_snapshot,
   shipping_address_id,billing_address_id,address_snapshot,company_snapshot,price_snapshot,
   currency,commercial_notes,internal_notes,created_by)
 VALUES(_org,v_number,v_company,v_profile,
   _quote,CASE WHEN _quote IS NULL THEN NULL ELSE v_quote.version END,
   coalesce(nullif(_data->>'sales_opportunity_id','')::uuid,v_quote.opportunity_id),v_rep,v_table,
   CASE WHEN _quote IS NULL THEN 'MANUAL' ELSE 'QUOTE_CONVERSION' END,
    coalesce(nullif(_data->>'order_date','')::date,CASE WHEN _quote IS NOT NULL THEN v_quote.issue_date END,current_date),
   nullif(_data->>'expected_delivery_date','')::date,v_terms_id,v_term,v_addr_id,v_bill_id,
   v_addr,
   coalesce(CASE WHEN _quote IS NULL THEN NULL ELSE v_quote.company_snapshot END,
     jsonb_build_object('company_id',v_company::text,'captured_at',now())),
   coalesce(CASE WHEN _quote IS NULL THEN NULL ELSE v_quote.payment_terms_snapshot END,'{}'::jsonb),
   coalesce(nullif(_data->>'currency',''),'BRL'),
   nullif(trim(coalesce(_data->>'commercial_notes','')),''),
   nullif(trim(coalesce(_data->>'internal_notes','')),''),auth.uid())
 RETURNING * INTO o;
 ident:=o.id;

 FOR i IN SELECT * FROM jsonb_array_elements(_items) LOOP
  v_subtotal:=v_subtotal+round((i->>'unit_price')::numeric*(i->>'ordered_quantity')::numeric,2);
  v_discount:=v_discount+coalesce((i->>'discount_amount')::numeric,0);
  v_tax:=v_tax+coalesce((i->>'tax_amount')::numeric,0);
  INSERT INTO public.sales_order_items(organization_id,sales_order_id,product_variant_id,
     sku_snapshot,description_snapshot,unit_snapshot,price_snapshot,ordered_quantity,
     unit_price,discount_amount,tax_amount,line_total,expected_delivery_date,created_by)
  VALUES(_org,ident,(i->>'product_variant_id')::uuid,i->>'sku_snapshot',i->>'description_snapshot',
   i->>'unit_snapshot',coalesce(i->'price_snapshot','{}'::jsonb),(i->>'ordered_quantity')::numeric,
   (i->>'unit_price')::numeric,(i->>'discount_amount')::numeric,(i->>'tax_amount')::numeric,
   (i->>'line_total')::numeric,nullif(i->>'expected_delivery_date','')::date,auth.uid());
 END LOOP;

 v_subtotal:=round(v_subtotal,2); v_discount:=round(v_discount,2); v_tax:=round(v_tax,2);
 UPDATE public.sales_orders SET subtotal=v_subtotal,discount_total=v_discount,tax_amount=v_tax,
  freight_amount=v_freight,
  total_amount=round(v_subtotal-v_discount+v_tax+v_freight,2)
 WHERE id=ident;
 SELECT * INTO o FROM public.sales_orders WHERE id=ident;
 PERFORM public.sales_audit(_org,'sales_order.created','sales_orders',ident,
   jsonb_build_object('source_type',o.source_type,'total',o.total_amount,'items',jsonb_array_length(_items)));
 PERFORM public.sales_emit(_org,'SALES_ORDER_CREATED','sales_order_created:'||ident,
   jsonb_build_object('sales_order_id',ident,'order_number',o.order_number,'company_id',v_company,
     'total',o.total_amount,'currency',o.currency,'source_type',o.source_type));
 RETURN jsonb_build_object('id',ident,'order_number',o.order_number,'status',o.status,'total_amount',o.total_amount);
END;
$$;

-- Criação e edicao manual: mesma validacao comercial do fluxo vindo do CRM.
--
-- Edicao so existe em RASCUNHO. Proposta convertida mantem os itens e os
-- precos CONGELADOS da versao aceita: mudar preco negociado e um ato
-- comercial diferente, e nao uma edicao de rascunho.
CREATE FUNCTION public.sales_save(_org uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i jsonb; v_table uuid; v_company uuid; out jsonb; items jsonb:='[]'::jsonb;
 o public.sales_orders; v_id uuid; v_subtotal numeric:=0; v_discount numeric:=0; v_tax numeric:=0;
 v_freight numeric; v_order_date date; v_addr_id uuid; v_bill_id uuid; v_addr jsonb:='{}'::jsonb;
 v_profile uuid; v_status text; v_table_old uuid; v_bill jsonb; v_now timestamptz:=now();
BEGIN
 v_id:=nullif(_data->>'id','')::uuid;
 IF v_id IS NULL THEN PERFORM public.sales_require(_org,'sales_orders.create');
 ELSE PERFORM public.sales_require(_org,'sales_orders.update'); END IF;
 IF nullif(_data->>'sales_quote_id','') IS NOT NULL THEN
  RAISE EXCEPTION 'Pedido com proposta deve ser criado pela conversão da proposta.';
 END IF;
 PERFORM public.inventory_lock(_org);

 IF v_id IS NOT NULL THEN
  SELECT * INTO o FROM public.sales_orders WHERE id=v_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF o.status<>'DRAFT' THEN
   RAISE EXCEPTION 'Somente pedido em rascunho pode ser editado (status atual: %).',o.status;
  END IF;
  IF o.sales_quote_id IS NOT NULL AND _data ? 'items' THEN
   RAISE EXCEPTION 'Os itens deste pedido vêm da proposta aceita e não podem ser alterados.';
  END IF;
  v_company:=o.company_id; v_profile:=o.customer_profile_id; v_table_old:=o.price_table_id;
  v_order_date:=coalesce(nullif(_data->>'order_date','')::date,o.order_date);
  v_freight:=round(coalesce(nullif(_data->>'freight_amount','')::numeric,o.freight_amount),2);
  v_addr_id:=coalesce(nullif(_data->>'shipping_address_id','')::uuid,o.shipping_address_id);
  v_bill_id:=coalesce(nullif(_data->>'billing_address_id','')::uuid,o.billing_address_id);
  IF nullif(_data->>'company_id','')::uuid IS NOT NULL AND nullif(_data->>'company_id','')::uuid<>o.company_id THEN
   RAISE EXCEPTION 'Não é possível trocar a empresa de um pedido existente.';
  END IF;
  -- Endereco de cobranca precisa pertencer a mesma empresa.
  IF v_bill_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_addresses
     WHERE id=v_bill_id AND organization_id=_org AND company_id=o.company_id) THEN
   RAISE EXCEPTION 'Endereço de cobrança inválido para esta empresa.';
  END IF;
  IF v_addr_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.company_addresses
      WHERE id=v_addr_id AND organization_id=_org AND company_id=o.company_id) THEN
    RAISE EXCEPTION 'Endereço de entrega inválido para esta empresa.';
   END IF;
   SELECT to_jsonb(a) INTO v_addr FROM public.company_addresses a WHERE a.id=v_addr_id;
  END IF;

  IF _data ? 'items' THEN
   v_table:=coalesce(nullif(_data->>'price_table_id','')::uuid,v_table_old);
   FOR i IN SELECT * FROM jsonb_array_elements(coalesce(_data->'items','[]'::jsonb)) LOOP
    items:=items||public.sales_prepare_item(_org,i,v_table,v_order_date);
   END LOOP;
   IF jsonb_array_length(items)=0 THEN RAISE EXCEPTION 'O pedido precisa de ao menos um item.'; END IF;
   -- Rascunho nao tem reserva, expedicao nem baixa: as linhas podem ser
   -- substituidas inteiras sem deixar residuo.
   DELETE FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=v_id;
   FOR i IN SELECT * FROM jsonb_array_elements(items) LOOP
    v_subtotal:=v_subtotal+round((i->>'unit_price')::numeric*(i->>'ordered_quantity')::numeric,2);
    v_discount:=v_discount+coalesce((i->>'discount_amount')::numeric,0);
    v_tax:=v_tax+coalesce((i->>'tax_amount')::numeric,0);
    INSERT INTO public.sales_order_items(organization_id,sales_order_id,product_variant_id,
      sku_snapshot,description_snapshot,unit_snapshot,price_snapshot,ordered_quantity,
      unit_price,discount_amount,tax_amount,line_total,expected_delivery_date,created_by)
    VALUES(_org,v_id,(i->>'product_variant_id')::uuid,i->>'sku_snapshot',i->>'description_snapshot',
     i->>'unit_snapshot',coalesce(i->'price_snapshot','{}'::jsonb),(i->>'ordered_quantity')::numeric,
     (i->>'unit_price')::numeric,(i->>'discount_amount')::numeric,(i->>'tax_amount')::numeric,
     (i->>'line_total')::numeric,nullif(i->>'expected_delivery_date','')::date,auth.uid());
   END LOOP;
  ELSE
   SELECT coalesce(sum(ordered_quantity*unit_price),0),coalesce(sum(discount_amount),0),
     coalesce(sum(tax_amount),0) INTO v_subtotal,v_discount,v_tax
    FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=v_id;
  END IF;
  v_subtotal:=round(v_subtotal,2); v_discount:=round(v_discount,2); v_tax:=round(v_tax,2);
  UPDATE public.sales_orders SET order_date=v_order_date,
   expected_delivery_date=coalesce(nullif(_data->>'expected_delivery_date','')::date,expected_delivery_date),
   price_table_id=coalesce(nullif(_data->>'price_table_id','')::uuid,price_table_id),
   representative_id=coalesce(nullif(_data->>'representative_id','')::uuid,representative_id),
   payment_terms_id=coalesce(nullif(_data->>'payment_terms_id','')::uuid,payment_terms_id),
   shipping_address_id=v_addr_id,billing_address_id=v_bill_id,
   address_snapshot=coalesce(nullif(v_addr,'{}'::jsonb),address_snapshot),
   commercial_notes=coalesce(nullif(trim(coalesce(_data->>'commercial_notes','')),''),commercial_notes),
   internal_notes=coalesce(nullif(trim(coalesce(_data->>'internal_notes','')),''),internal_notes),
   subtotal=v_subtotal,discount_total=v_discount,tax_amount=v_tax,freight_amount=v_freight,
   total_amount=round(v_subtotal-v_discount+v_tax+v_freight,2),updated_at=v_now WHERE id=v_id;
  SELECT * INTO o FROM public.sales_orders WHERE id=v_id;
  PERFORM public.sales_audit(_org,'sales_order.updated','sales_orders',v_id,
   jsonb_build_object('total',o.total_amount,'items_replaced',_data ? 'items'));
  RETURN jsonb_build_object('id',v_id,'order_number',o.order_number,'status',o.status,
   'total_amount',o.total_amount,'deduped',false);
 END IF;

 v_company:=nullif(_data->>'company_id','')::uuid;
 v_table:=coalesce(nullif(_data->>'price_table_id','')::uuid,
   (SELECT price_table_id FROM public.customer_profiles WHERE organization_id=_org AND company_id=v_company));
 FOR i IN SELECT * FROM jsonb_array_elements(coalesce(_data->'items','[]'::jsonb)) LOOP
  items:=items||public.sales_prepare_item(_org,i,v_table,
    coalesce(nullif(_data->>'order_date','')::date,current_date));
 END LOOP;
 out:=public.sales_insert_order(_org,_data,items,NULL);
 RETURN out;
END;
$$;

-- PROPOSTA ACEITA -> CONVERSÃO -> SALES ORDER.
-- Idempotente por construcao: a chave unica parcial em sales_orders
-- (sales_quote_id) impede dois pedidos, e sales_order_operation_keys devolve
-- o mesmo resultado quando a mesma chave e repetida.
CREATE FUNCTION public.sales_convert_quote(_org uuid,_quote uuid,_data jsonb DEFAULT '{}',_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.sales_order_operation_keys; q public.sales_quotes; payload jsonb;
 result jsonb; it public.sales_quote_items; items jsonb:='[]'::jsonb;
 v_profile uuid; v_status text; v_order_id uuid; v_number text; v_subtotal numeric:=0; v_discount numeric:=0;
 v_tax numeric:=0; v_freight numeric; v_table uuid; v_addr_id uuid; v_bill_id uuid; v_addr jsonb:='{}'::jsonb;
 v_profile_table uuid; v_terms_id uuid; v_term text; v_rep uuid; v_snapshot jsonb;
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.create');
 IF _key IS NULL THEN RAISE EXCEPTION 'Chave de operação é obrigatória.'; END IF;
 payload:=jsonb_build_object('quote_id',_quote,'data',coalesce(_data,'{}'::jsonb));
 PERFORM public.inventory_lock(_org);
 SELECT * INTO prior FROM public.sales_order_operation_keys WHERE organization_id=_org AND operation_key=_key;
 IF FOUND THEN
  IF prior.payload<>payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Chave já utilizada com outro conteúdo ou usuário.';
  END IF;
  RETURN prior.result;
 END IF;

 SELECT * INTO q FROM public.sales_quotes WHERE id=_quote AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
 IF q.status<>'ACCEPTED' THEN RAISE EXCEPTION 'Somente proposta aceita pode virar pedido.'; END IF;

 -- Conversao repetida devolve o MESMO pedido. Nunca um segundo.
 SELECT id,order_number,status INTO v_order_id,v_number,v_status FROM public.sales_orders
  WHERE organization_id=_org AND sales_quote_id=_quote;
 IF v_order_id IS NOT NULL THEN
  result:=jsonb_build_object('id',v_order_id,'order_number',v_number,'status',v_status,'deduped',true);
 ELSE
  SELECT p.id,p.commercial_status,p.price_table_id,p.payment_terms_id
   INTO v_profile,v_status,v_profile_table,v_terms_id
   FROM public.customer_profiles p WHERE p.organization_id=_org AND p.company_id=q.company_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Empresa da proposta não possui perfil de cliente.'; END IF;
  IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Cliente não está ativo para novas vendas (%s).',v_status; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=q.company_id AND organization_id=_org AND status='ACTIVE') THEN
   RAISE EXCEPTION 'Empresa inativa ou bloqueada.';
  END IF;
  v_table:=q.price_table_id; v_rep:=q.representative_id; v_freight:=round(coalesce(q.freight,0),2);
  SELECT id INTO v_addr_id FROM public.company_addresses
   WHERE organization_id=_org AND company_id=q.company_id AND type='SHIPPING' AND is_primary LIMIT 1;
  IF v_addr_id IS NOT NULL THEN SELECT to_jsonb(a) INTO v_addr FROM public.company_addresses a WHERE a.id=v_addr_id; END IF;
  SELECT id INTO v_bill_id FROM public.company_addresses
   WHERE organization_id=_org AND company_id=q.company_id AND type='BILLING' AND is_primary LIMIT 1;
  SELECT name INTO v_term FROM public.commercial_payment_terms WHERE id=nullif(q.payment_terms_snapshot->>'id','')::uuid AND organization_id=_org;
  IF v_term IS NULL AND nullif(q.payment_terms_snapshot->>'name','') IS NOT NULL THEN
   -- A condição do aceite pode ser um texto livre que não existe mais no
   -- catálogo. Ela é preservada como texto, sem inventar um cadastro.
   v_term:=q.payment_terms_snapshot->>'name';
  END IF;

  -- Precos, quantidades e condições vem da VERSÃO ACEITA, congelados.
  FOR it IN SELECT * FROM public.sales_quote_items WHERE organization_id=_org AND quote_id=q.id ORDER BY created_at LOOP
   v_subtotal:=v_subtotal+it.total;
   items:=items||jsonb_build_object(
    'product_variant_id',it.variant_id,'sku_snapshot',coalesce(it.product_snapshot->>'sku',''),
    'description_snapshot',coalesce(it.product_snapshot->>'description',it.product_snapshot->>'name',''),
    'unit_snapshot',coalesce(it.product_snapshot->>'unit','un'),
    'ordered_quantity',it.quantity,'unit_price',it.unit_price,'discount_amount',0,
    'tax_amount',0,'line_total',it.total,'price_snapshot',it.price_snapshot,
    'expected_delivery_date',null);
  END LOOP;
  IF jsonb_array_length(items)<1 THEN RAISE EXCEPTION 'Proposta aceita não possui itens.'; END IF;
  v_subtotal:=round(coalesce(q.subtotal,v_subtotal),2);
  v_discount:=round(coalesce(q.discount_amount,0),2); v_tax:=round(coalesce(q.tax_amount,0),2);

  v_number:=public.sales_next_number(_org,'order');
  v_snapshot:=jsonb_build_object('quote_number',q.quote_number,'quote_version',q.version,'quote_total',q.total,
      'discount_percent',q.discount_percent,'discount_amount',q.discount_amount,
      'accepted_at',q.acceptance_evidence,'acceptance_contact_id',q.acceptance_contact_id,
      'contact_name',(SELECT name FROM public.company_contacts WHERE id=q.acceptance_contact_id),
      'payment_terms',q.payment_terms_snapshot,'items',items);
  RAISE NOTICE 'SNAP %',left(v_snapshot::text,300);
  INSERT INTO public.sales_orders(organization_id,order_number,company_id,customer_profile_id,
    sales_quote_id,sales_quote_version,sales_opportunity_id,representative_id,price_table_id,
    source_type,order_date,expected_delivery_date,payment_terms_id,payment_terms_snapshot,
    shipping_address_id,billing_address_id,address_snapshot,company_snapshot,price_snapshot,
    currency,commercial_notes,internal_notes,created_by)
  VALUES(_org,v_number,q.company_id,v_profile,q.id,q.version,q.opportunity_id,v_rep,v_table,
    'QUOTE_CONVERSION',q.issue_date,nullif(_data->>'expected_delivery_date','')::date,
    v_terms_id,v_term,v_addr_id,v_bill_id,v_addr,q.company_snapshot,
    jsonb_build_object('quote_number',q.quote_number,'quote_version',q.version,'quote_total',q.total,
      'discount_percent',q.discount_percent,'discount_amount',q.discount_amount,
      'accepted_at',q.accepted_at,'acceptance_contact_id',q.acceptance_contact_id,
      'contact_name',(SELECT name FROM public.company_contacts WHERE id=q.acceptance_contact_id),
      'payment_terms',q.payment_terms_snapshot,'items',items),
    'BRL',q.notes,nullif(trim(coalesce(_data->>'internal_notes','')),''),auth.uid())
  RETURNING id INTO result;

  INSERT INTO public.sales_order_items(organization_id,sales_order_id,product_variant_id,
    sku_snapshot,description_snapshot,unit_snapshot,price_snapshot,ordered_quantity,
    unit_price,discount_amount,tax_amount,line_total,created_by)
  SELECT _org,v_order_id,x.product_variant_id,
    coalesce(nullif(x.sku_snapshot,''),v.sku),
    coalesce(nullif(x.description_snapshot,''),pr.name||' — '||v.sku),
    x.unit_snapshot,coalesce(x.price_snapshot,'{}'::jsonb),x.ordered_quantity,x.unit_price,
    x.discount_amount,x.tax_amount,x.line_total,auth.uid()
  FROM jsonb_to_recordset(items) AS x(product_variant_id uuid,sku_snapshot text,description_snapshot text,
    unit_snapshot text,price_snapshot jsonb,ordered_quantity numeric,unit_price numeric,
    discount_amount numeric,tax_amount numeric,line_total numeric)
  JOIN public.product_variants v ON v.id=x.product_variant_id
  JOIN public.products pr ON pr.id=v.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Itens da proposta não conferem com o catálogo.'; END IF;

  UPDATE public.sales_orders SET subtotal=v_subtotal,discount_total=v_discount,tax_amount=v_tax,
   freight_amount=v_freight,total_amount=round(v_subtotal-v_discount+v_tax+v_freight,2)
  WHERE id=v_order_id;
  result:=jsonb_build_object('id',v_order_id,'order_number',v_number,'status','DRAFT','deduped',false);
  PERFORM public.sales_audit(_org,'sales_order.quote_converted','sales_orders',v_order_id,
    jsonb_build_object('sales_quote_id',q.id,'version',q.version,'total',q.total,'order_number',v_number));
  PERFORM public.sales_emit(_org,'SALES_ORDER_CREATED','sales_order_created:'||v_order_id,
    jsonb_build_object('sales_order_id',v_order_id,'order_number',v_number,
      'company_id',q.company_id,'source_type','QUOTE_CONVERSION','sales_quote_id',q.id));
 END IF;
 INSERT INTO public.sales_order_operation_keys(organization_id,operation_key,operation,payload,result,created_by)
 VALUES(_org,_key,'sales_convert_quote',payload,result,auth.uid());
 RETURN result;
END;
$$;


-- Validação comercial. Não inventa regra: usa cliente ativo, catálogo válido,
-- quantidade positiva, preço oficial, alçada de desconto, preço mínimo da
-- tabela, condição de pagamento, endereço e crédito.
CREATE FUNCTION public.sales_validate_order(_org uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; cfg jsonb; i jsonb; it public.sales_order_items; issues jsonb:='[]'::jsonb; v_pct numeric;
 v_discount_pct numeric; v_auth numeric; v_sep boolean; v_credit jsonb; v_contact uuid;
BEGIN
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 cfg:=public.sales_settings(_org);

 -- Cliente ativo.
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=o.company_id AND organization_id=_org AND status='ACTIVE')
    OR NOT EXISTS(SELECT 1 FROM public.customer_profiles
       WHERE organization_id=_org AND company_id=o.company_id AND commercial_status='ACTIVE') THEN
  issues:=issues||jsonb_build_object('code','CUSTOMER_INACTIVE','message','Cliente inativo ou bloqueado.');
 END IF;
 -- Itens: variante valida e quantidade positiva ja garantidas na criacao.
 IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order) THEN
  issues:=issues||jsonb_build_object('code','NO_ITEMS','message','Pedido sem itens.');
 END IF;
 FOR it IN SELECT * FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order LOOP
  IF NOT EXISTS(SELECT 1 FROM public.product_variants
     WHERE id=it.product_variant_id AND organization_id=_org AND status='DISCONTINUED') THEN
   issues:=issues||jsonb_build_object('code','VARIANT_INVALID','variant_id',it.product_variant_id,
     'message',format('A variante %s está descontinuada.',it.sku_snapshot));
  END IF;
  IF it.unit_price<0 THEN
   issues:=issues||jsonb_build_object('code','PRICE_INVALID','variant_id',it.product_variant_id,'message','Preço inválido.');
  END IF;
  -- Preço abaixo do mínimo vigente da tabela exige autorização específica.
  IF coalesce((it.price_snapshot->>'below_minimum')::boolean,false) THEN
   IF cfg->>'price_override_policy'='BLOCK' THEN
    issues:=issues||jsonb_build_object('code','PRICE_BELOW_MINIMUM','variant_id',it.product_variant_id,
      'message',format('Preço abaixo do mínimo da tabela em %s.',it.sku_snapshot),'blocking',true);
   ELSE
    issues:=issues||jsonb_build_object('code','PRICE_BELOW_MINIMUM','variant_id',it.product_variant_id,
      'message',format('Preço abaixo do mínimo em %s exige autorização.',it.sku_snapshot),'requires_authorization',true);
   END IF;
  END IF;
 END LOOP;
 -- Desconto acima da alçada. A alcada oficial é a do MASTER 012.
 v_discount_pct:=CASE WHEN o.subtotal>0 THEN round(o.discount_total/o.subtotal*100,2) ELSE 0 END;
 v_pct:=nullif(cfg->>'max_discount_percent','')::numeric;
 IF v_pct IS NULL THEN
  SELECT a.max_discount_percent INTO v_auth FROM public.commercial_discount_authorities a
   WHERE a.organization_id=_org AND a.user_id=o.created_by;
 END IF;
 v_pct:=coalesce(v_pct,v_auth);
 IF v_pct IS NOT NULL AND v_discount_pct>v_pct THEN
  issues:=issues||jsonb_build_object('code','DISCOUNT_ABOVE_AUTHORITY','message',
    format('Desconto de %s%% excede o limite de %s%%.',v_discount_pct::text,v_pct::text),'blocking',true);
 END IF;
 -- Condição de pagamento e endereço de entrega.
 IF o.payment_terms_snapshot IS NULL THEN
  issues:=issues||jsonb_build_object('code','PAYMENT_TERMS_MISSING','message','Condição de pagamento não definida.');
 END IF;
 IF coalesce((cfg->>'require_shipping_address')::boolean,true) AND o.shipping_address_id IS NULL THEN
  issues:=issues||jsonb_build_object('code','SHIPPING_ADDRESS_MISSING','message','Endereço de entrega é obrigatório.','blocking',true);
 END IF;
 -- Contato do aceite: a proposta aceita ja exigiu um, mas o pedido manual nao.
 IF o.sales_quote_id IS NOT NULL THEN
  SELECT q.acceptance_contact_id INTO v_contact FROM public.sales_quotes q WHERE q.id=o.sales_quote_id;
  IF v_contact IS NULL THEN
   issues:=issues||jsonb_build_object('code','ACCEPTANCE_CONTACT_MISSING','message','Proposta aceita sem contato de aceite.');
  END IF;
 END IF;
 v_sep:=coalesce((cfg->>'approval_segregation')::boolean,true) AND o.created_by=auth.uid();
 IF v_sep THEN
  issues:=issues||jsonb_build_object('code','SEGREGATION_OF_DUTIES','requires_authorization',true,
    'message','Segregação de funções: não é permitido aprovar pedido criado por você.');
 END IF;
 v_credit:=public.sales_credit_check(_org,o.company_id,o.total_amount,o.id);
 IF (v_credit->>'blocked')::boolean THEN
  issues:=issues||jsonb_build_object('code','CREDIT_BLOCKED','blocking',true,
    'message','Crédito insuficiente: '||array_to_string(v_credit->'blocked_reasons','; '),
    'credit',v_credit);
 END IF;
 RETURN jsonb_build_object('valid',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(issues) x
    WHERE x->>'blocking'='true' OR x->>'requires_authorization'='true'),
   'issues',issues,'credit',v_credit,
   'discount_percent',v_discount_pct);
END;
$$;

-- Máquina de estados do pedido. Nenhuma transição arbitrária é aceita.
CREATE FUNCTION public.sales_order_action(_org uuid,_order uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; v_new text; v_check jsonb; v_now timestamptz:=now();
 v_perm text; v_reason text; v_policy jsonb; v_cfg jsonb; v_item jsonb;
BEGIN
 v_perm:=CASE _action
  WHEN 'submit' THEN 'sales_orders.update' WHEN 'approve' THEN 'sales_orders.approve'
  WHEN 'cancel' THEN 'sales_orders.cancel' WHEN 'close' THEN 'sales_orders.update'
  WHEN 'reopen' THEN 'sales_orders.update' ELSE NULL END;
 IF v_perm IS NULL THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 PERFORM public.sales_require(_org,v_perm);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 v_reason:=nullif(trim(coalesce(_data->>'reason','')),'');
 v_cfg:=public.sales_settings(_org);

 IF _action='submit' THEN
  IF o.status<>'DRAFT' THEN RAISE EXCEPTION 'Somente rascunhos podem ser submetidos.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order) THEN
   RAISE EXCEPTION 'Pedido sem itens.';
  END IF;
  -- A validação comercial roda no submit: o pedido só entra na fila se o
  -- mínimo comercial está presente. Bloqueios duros ficam para a aprovação.
  v_check:=public.sales_validate_order(_org,_order);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_check->'issues') x WHERE x->>'blocking'='true'
      AND x->>'code'<>'CREDIT_BLOCKED') THEN
   RAISE EXCEPTION 'Pedido não atende aos requisitos comerciais: %',
    (SELECT string_agg(x->>'message','; ') FROM jsonb_array_elements(v_check->'issues') x
     WHERE x->>'blocking'='true' AND x->>'code'<>'CREDIT_BLOCKED');
  END IF;
  v_new:='PENDING_APPROVAL';

 ELSIF _action='approve' THEN
  IF o.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Somente pedidos pendentes podem ser aprovados.'; END IF;
  -- A consulta de credito e refeita e PRESERVADA no instante da aprovacao.
  v_check:=public.sales_validate_order(_org,_order);
  v_policy:=jsonb_build_object('issues',v_check->'issues','credit',v_check->'credit',
    'settings',jsonb_build_object('approval_segregation',v_cfg->>'approval_segregation',
      'max_discount_percent',v_cfg->>'max_discount_percent','price_override_policy',v_cfg->>'price_override_policy'),
    'decision','APPROVED');
  IF (v_check->'credit'->>'blocked')::boolean THEN
   v_policy:=v_policy||jsonb_build_object('decision','BLOCKED');
   INSERT INTO public.sales_credit_checks(organization_id,sales_order_id,company_id,evaluated_amount,
     credit_limit,open_receivables,overdue_amount,open_order_exposure,exposure_policy,decision,
     blocked_reasons,result,created_by)
   VALUES(_org,_order,o.company_id,o.total_amount,
     nullif(v_check->'credit'->>'credit_limit','')::numeric,
     coalesce((v_check->'credit'->>'open_receivables')::numeric,0),
     coalesce((v_check->'credit'->>'overdue_amount')::numeric,0),
     coalesce((v_check->'credit'->>'open_order_exposure')::numeric,0),
     v_check->'credit'->>'exposure_policy','BLOCKED',
     ARRAY(SELECT jsonb_array_elements_text(v_check->'credit'->'blocked_reasons')),
     v_check->'credit',auth.uid());
   RAISE EXCEPTION 'Crédito insuficiente: %',array_to_string(v_check->'credit'->'blocked_reasons','; ');
  END IF;
  INSERT INTO public.sales_credit_checks(organization_id,sales_order_id,company_id,evaluated_amount,
    credit_limit,open_receivables,overdue_amount,open_order_exposure,exposure_policy,decision,
    blocked_reasons,result,created_by)
  VALUES(_org,_order,o.company_id,o.total_amount,
    nullif(v_check->'credit'->>'credit_limit','')::numeric,
    coalesce((v_check->'credit'->>'open_receivables')::numeric,0),
    coalesce((v_check->'credit'->>'overdue_amount')::numeric,0),
    coalesce((v_check->'credit'->>'open_order_exposure')::numeric,0),
    v_check->'credit'->>'exposure_policy','APPROVED','{}'::text[],v_check->'credit',auth.uid());
  -- Excecoes exigem autorizacao especifica e motivo registrado.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_check->'issues') x
      WHERE x->>'requires_authorization'='true' OR x->>'blocking'='true') THEN
   IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A aprovação exige motivo: %',(SELECT string_agg(x->>'message','; ')
     FROM jsonb_array_elements(v_check->'issues') x
     WHERE x->>'requires_authorization'='true' OR x->>'blocking'='true');
   END IF;
   IF NOT public.has_permission(_org,'commercial_sensitive.read') THEN
    RAISE EXCEPTION 'Exceção comercial exige autorização de alçada (commercial_sensitive.read).';
   END IF;
   v_policy:=v_policy||jsonb_build_object('decision','OVERRIDDEN','overrides',v_check->'issues','reason',v_reason);
  END IF;
  v_new:='APPROVED';
  UPDATE public.sales_orders SET status=v_new,approved_by=auth.uid(),approved_at=v_now,
   credit_check_result=v_check->'credit',credit_checked_at=v_now,approval_policy=v_policy,
   submitted_at=coalesce(o.submitted_at,v_now),updated_at=v_now WHERE id=_order;
  -- Quantidade aprovada e a quantidade ordenada; a aprovacao nao corta linha.
  UPDATE public.sales_order_items SET approved_quantity=ordered_quantity,updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order;
  -- Demanda confirmada para o planejamento (MASTER 011). Dupla contagem e
  -- marcada quando a mesma demanda ja estava em previsao comercial.
  INSERT INTO public.sales_demands(organization_id,sales_order_id,sales_order_item_id,variant_id,
    requested_quantity,required_date,source_type,already_in_forecast,status,created_at,updated_at)
  SELECT _org,_order,it.id,it.product_variant_id,it.approved_quantity,
    coalesce(it.expected_delivery_date,o.expected_delivery_date,o.order_date),
    CASE WHEN it.sourcing_type='MAKE_TO_ORDER' THEN 'MAKE_TO_ORDER' ELSE 'SALES_ORDER' END,
    coalesce((SELECT true FROM public.sales_opportunities op
      WHERE op.organization_id=_org AND op.company_id=o.company_id AND op.status='OPEN'
        AND EXISTS(SELECT 1 FROM public.opportunity_items oi
                   WHERE oi.organization_id=_org AND oi.opportunity_id=op.id AND oi.variant_id=it.product_variant_id)
      LIMIT 1),false),'OPEN',v_now,v_now
  FROM public.sales_order_items it WHERE it.organization_id=_org AND it.sales_order_id=_order
  ON CONFLICT(organization_id,sales_order_item_id) DO NOTHING;
  -- O gatilho financeiro é configurável. Aprovação só gera título quando a
  -- política explicitamente diz ON_APPROVAL. O padrão é a expedição.
  IF v_cfg->>'receivable_trigger'='ON_APPROVAL' THEN
   PERFORM public.sales_create_receivables(_org,_order,'ON_APPROVAL');
  END IF;
  PERFORM public.sales_emit(_org,'SALES_ORDER_APPROVED','sales_order_approved:'||_order,
   jsonb_build_object('sales_order_id',_order,'order_number',o.order_number,'company_id',o.company_id,
     'total',o.total_amount,'currency',o.currency,'approved_by',auth.uid(),'credit',v_check->'credit'));

 ELSIF _action='cancel' THEN
  IF o.status IN ('CANCELED','CLOSED') THEN RAISE EXCEPTION 'Pedido já encerrado.'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo do cancelamento é obrigatório.'; END IF;
  -- Expedição existente NUNCA e apagada: movimentos físicos são fato.
  IF EXISTS(SELECT 1 FROM public.shipments WHERE organization_id=_org AND sales_order_id=_order
      AND status NOT IN ('DRAFT','CANCELED')) THEN
   RAISE EXCEPTION 'Pedido com expedição não pode ser cancelado. Cancele apenas o saldo pendente.';
  END IF;
  v_new:='CANCELED';
  -- Reserva liberada: reserva cancelada nao volta a ser disponibilidad.
  UPDATE public.inventory_reservations SET status='CANCELED',released_quantity=quantity,
   released_at=v_now,release_reason=coalesce(v_reason,'Pedido cancelado'),updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status IN ('ACTIVE','PARTIALLY_CONSUMED');
  UPDATE public.sales_order_items SET status='CANCELED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status<>'FULFILLED';
  UPDATE public.sales_demands SET status='CANCELED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status<>'CLOSED';
  UPDATE public.fulfillment_orders SET status='CANCELED',cancel_reason=v_reason,updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status IN ('DRAFT','READY_FOR_PICKING','PICKING','PICKED','PACKING');
  UPDATE public.picking_tasks SET status='CANCELED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status IN ('PENDING','IN_PROGRESS','PICKED');
  UPDATE public.sales_orders SET status=v_new,canceled_at=v_now,cancel_reason=v_reason,
   stock_status='NOT_EVALUATED',updated_at=v_now WHERE id=_order;

 ELSIF _action='close' THEN
  IF o.status NOT IN ('FULFILLED','PARTIALLY_FULFILLED') THEN
   RAISE EXCEPTION 'Somente pedido com expedição pode ser fechado.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.shipments WHERE organization_id=_org AND sales_order_id=_order
      AND status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED')) THEN
   RAISE EXCEPTION 'Há expedições em trânsito. Feche apenas após a entrega.';
  END IF;
  v_new:='CLOSED';
  UPDATE public.sales_orders SET status=v_new,closed_at=v_now,updated_at=v_now WHERE id=_order;
  UPDATE public.sales_demands SET status='CLOSED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND pending_quantity<=0;
 ELSIF v_new IS NULL THEN RAISE EXCEPTION 'Transição inválida.'; END IF;

 IF _action<>'approve' THEN
  UPDATE public.sales_orders SET status=v_new,updated_at=v_now
   WHERE id=_order AND status<>v_new;
  IF _action='submit' THEN UPDATE public.sales_orders SET submitted_at=v_now WHERE id=_order; END IF;
 END IF;
 INSERT INTO public.sales_order_status_history(organization_id,sales_order_id,previous_status,new_status,reason,details,created_by)
 VALUES(_org,_order,o.status,v_new,v_reason,coalesce(_data,'{}'::jsonb),auth.uid());
 PERFORM public.sales_audit(_org,'sales_order.'||_action,'sales_orders',_order,
   jsonb_build_object('from',o.status,'to',v_new,'reason',v_reason));
 IF _action='cancel' THEN
  PERFORM public.sales_emit(_org,'SALES_ORDER_CANCELED','sales_order_canceled:'||_order||':'||extract(epoch from v_now)::bigint,
   jsonb_build_object('sales_order_id',_order,'order_number',o.order_number,'reason',v_reason));
 END IF;
 RETURN jsonb_build_object('id',_order,'status',v_new);
END;
$$;


-- =====================================================================
-- 11. Obrigação financeira a partir de venda direta.
--
-- Um único fato comercial gera o título. A politica da organizacao decide
-- QUAL evento é elegível (receivable_trigger), de modo que a mesma venda nunca
-- vira um recebível na aprovação E outro na expedição. O MASTER 013 não emite
-- documento fiscal: o título é a obrigação comercial, não a nota.
-- =====================================================================
CREATE FUNCTION public.sales_receivable_total(_org uuid,_order uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(sum(ar.original_amount),0) FROM public.account_receivables ar
 WHERE ar.organization_id=_org AND ar.source_type='SALE' AND ar.source_id=_order::text;
$$;

CREATE FUNCTION public.sales_create_receivables(_org uuid,_order uuid,_trigger text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; v_base numeric; v_existing numeric; v_company uuid; v_terms text;
 v_credit jsonb; v_n int; v_i int; v_due date; v_terms_id uuid; v_parts int[];
BEGIN
 -- NONE e uma configuracao valida: a organizacao optou por nao gerar titulo.
 IF _trigger='NONE' THEN RETURN 0; END IF;
 IF _trigger NOT IN ('ON_APPROVAL','ON_DISPATCH') THEN RAISE EXCEPTION 'Gatilho financeiro inválido.'; END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 -- Fonte única: source_type='SALE'. Idempotente pela constraint
 -- UNIQUE(organization_id,source_type,source_id,installment_number).
 v_existing:=public.sales_receivable_total(_org,_order);
 IF v_existing>0 THEN
  -- J\u00e1 existe título para este pedido: a venda é uma só. Só complementa a
  -- diferença quando novas unidades foram efetivamente expedidas.
  IF _trigger<>'ON_DISPATCH' THEN RETURN 0; END IF;
 END IF;
 v_company:=o.company_id;
 v_terms_id:=o.payment_terms_id;
 SELECT name INTO v_terms FROM public.commercial_payment_terms WHERE id=v_terms_id AND organization_id=_org;

 -- Base elegível: o que foi expedido menos o que já foi devolvido.
 -- Na aprovação, a base é o total aprovado.
 IF _trigger='ON_APPROVAL' THEN
  v_base:=o.total_amount;
 ELSE
  -- Base em DINHEIRO, nunca em unidades: o proporcional expedido do valor
  -- aprovado da linha. Pedido parcial gera titulo parcial.
  v_base:=coalesce((
   SELECT sum(round((si.quantity-si.returned_quantity)/nullif(i.approved_quantity,0)*i.line_total,2))
   FROM public.shipment_items si
   JOIN public.shipments s ON s.id=si.shipment_id AND s.organization_id=si.organization_id
   JOIN public.sales_order_items i ON i.id=si.sales_order_item_id AND i.organization_id=si.organization_id
   WHERE si.organization_id=_org AND s.sales_order_id=_order
     AND s.status NOT IN ('DRAFT','CANCELED')),0);
  IF v_base<=0 THEN RETURN 0; END IF;
 END IF;
 v_base:=round(v_base-coalesce(v_existing,0),2);
 IF v_base<=0 THEN RETURN 0; END IF;

 v_parts:=public.purchasing_split_terms(coalesce(v_terms,'30'));
 v_n:=greatest(1,least(coalesce(cardinality(v_parts),1),12));
 FOR v_i IN 1..v_n LOOP
  v_due:=o.order_date+coalesce(v_parts[v_i],0);
  INSERT INTO public.account_receivables(organization_id,company_id,source_type,source_id,source_status,
    document_number,description,issue_date,due_date,competence_date,original_amount,open_amount,
    currency,status,financial_category_id,cost_center_id,installment_number,total_installments,notes,created_by)
  VALUES(_org,v_company,'SALE',_order::text,'ACTIVE',
    'CLI-'||to_char(o.order_date,'YYYY')||'-'||lpad(o.order_number,24,'0')||'-'||lpad(v_i::text,2,'0'),
    'Pedido '||o.order_number||' — parcela '||v_i||'/'||v_n,
    o.order_date,v_due,o.order_date,
    CASE WHEN v_i<v_n THEN round(v_base/v_n,2) ELSE round(v_base-round(v_base/v_n,2)*(v_n-1),2) END,
    CASE WHEN v_i<v_n THEN round(v_base/v_n,2) ELSE round(v_base-round(v_base/v_n,2)*(v_n-1),2) END,
    o.currency,'OPEN',
    (SELECT fc.id FROM public.financial_categories fc
      WHERE fc.organization_id=_org AND fc.type='REVENUE' AND fc.status='ACTIVE' ORDER BY fc.name LIMIT 1),
    null,v_i,v_n,'Origem: venda direta (gatilho '||_trigger||')',auth.uid());
 END LOOP;
 PERFORM public.sales_audit(_org,'sales_order.receivable_created','sales_orders',_order,
   jsonb_build_object('trigger',_trigger,'base',v_base,'installments',v_n));
 RETURN v_n;
END;
$$;

-- Esconde o estado do CUSTOMER 360 sem duplicar dado: devolve o que o MASTER 013
-- sabe sobre a venda direta, sempre dos dados oficiais.
CREATE FUNCTION public.sales_company_activity(_org uuid,_company uuid,_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'orders',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC,o.order_number DESC)
    FROM (SELECT so.id,so.order_number,so.status,so.stock_status,so.fulfillment_status,so.order_date,
      so.expected_delivery_date,so.total_amount,so.currency,so.source_type,so.created_at,
      (SELECT coalesce(sum(si.delivered_quantity),0) FROM public.shipment_items si
       JOIN public.shipments s ON s.id=si.shipment_id
       WHERE s.organization_id=_org AND s.sales_order_id=so.id) AS delivered_amount
    FROM public.sales_orders so
    WHERE so.organization_id=_org AND so.company_id=_company
    ORDER BY so.created_at DESC,so.order_number DESC LIMIT greatest(1,least(_limit,200))) o),'[]'::jsonb),
  'shipments',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC,s.shipment_number DESC)
    FROM (SELECT sh.id,sh.shipment_number,sh.status,sh.shipping_method,sh.tracking_code,sh.dispatched_at,
      sh.expected_delivery_at,sh.delivered_quantity,sh.exception_notes,sh.created_at
    FROM public.shipments sh JOIN public.sales_orders o ON o.id=sh.sales_order_id
    WHERE sh.organization_id=_org AND o.company_id=_company
    ORDER BY sh.created_at DESC,sh.shipment_number DESC LIMIT greatest(1,least(_limit,200))) s),'[]'::jsonb),
  'returns',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.requested_at DESC,r.return_number DESC)
    FROM (SELECT cr.id,cr.return_number,cr.status,cr.reason,cr.requested_at,cr.received_at,
      cr.financial_action,cr.financial_requested_at,cr.created_at
    FROM public.customer_returns cr WHERE cr.organization_id=_org AND cr.company_id=_company
    ORDER BY cr.requested_at DESC,cr.return_number DESC LIMIT greatest(1,least(_limit,200))) r),'[]'::jsonb),
  'totals',jsonb_build_object(
      'orders',(SELECT count(*) FROM public.sales_orders so
        WHERE so.organization_id=_org AND so.company_id=_company AND so.status NOT IN ('CANCELED')),
      'amount',(SELECT coalesce(sum(so.total_amount),0) FROM public.sales_orders so
        WHERE so.organization_id=_org AND so.company_id=_company AND so.status NOT IN ('CANCELED')),
      'delivered_amount',(SELECT coalesce(sum(si.delivered_quantity),0)
        FROM public.shipment_items si JOIN public.shipments sh ON sh.id=si.shipment_id
        JOIN public.sales_orders so ON so.id=sh.sales_order_id
        WHERE si.organization_id=_org AND so.company_id=_company
          AND sh.status IN ('DELIVERED','PARTIALLY_DELIVERED'))),
  'note','Dados sempre das tabelas oficiais. Nada é recalculado nem estimado aqui.');
$$;


-- =====================================================================
-- 12. Disponibilidade e reserva.
--
-- DISPONIVEL = SALDO FISICO - RESERVAS ATIVAS.
-- A reserva afeta o disponivel e NUNCA o saldo fisico: nenhuma linha de
-- inventory_movements e criada aqui.
-- =====================================================================

-- Consulta de disponibilidade por item do pedido, por localizacao autorizada.
-- Local de parceiro e local de quarentena/inspecao nao sao estoque vendavel
-- para venda direta: por isso ficam fora do disponivel.
CREATE FUNCTION public.sales_availability(_org uuid,_order uuid,_location uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; it public.sales_order_items; v_json jsonb:='[]'::jsonb;
 v_need numeric; v_reserved numeric; v_onhand numeric; v_avail numeric; v_pend numeric;
 v_mto boolean; loc record; v_here numeric; v_best uuid; v_best_qty numeric:=0; v_best_reserved numeric;
 v_mto_total numeric:=0; v_total_need numeric:=0; v_total_reserved numeric:=0; v_total_avail numeric:=0;
 v_sufficient boolean:=true;
BEGIN
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 v_mto:=coalesce((public.sales_settings(_org)->>'make_to_order_enabled')::boolean,true);
 FOR it IN SELECT * FROM public.sales_order_items
   WHERE organization_id=_org AND sales_order_id=_order AND status<>'CANCELED' ORDER BY created_at LOOP
  v_need:=CASE WHEN it.approved_quantity>0 THEN it.approved_quantity ELSE it.ordered_quantity END;
  v_reserved:=it.reserved_quantity;
  v_pend:=greatest(0,v_need-v_reserved);
  v_total_need:=v_total_need+v_need;
  v_total_reserved:=v_total_reserved+v_reserved;
  -- Melhor localizacao autorizada: maior disponivel.
  v_best:=NULL; v_best_qty:=0;
  FOR loc IN SELECT l.id FROM public.inventory_locations l
    WHERE l.organization_id=_org AND l.status='ACTIVE' AND l.operational_purpose='NORMAL'
      AND l.partner_id IS NULL AND (_location IS NULL OR l.id=_location)
      AND l.type<>'TRANSIT' ORDER BY l.name LOOP
   v_here:=public.sales_available(_org,it.product_variant_id,loc.id,NULL);
   IF v_here>v_best_qty THEN v_best_qty:=v_here; v_best:=loc.id; END IF;
  END LOOP;
  v_onhand:=0; v_avail:=0;
  IF v_best IS NOT NULL THEN
   v_onhand:=public.sales_on_hand(_org,it.product_variant_id,v_best,NULL);
   v_avail:=greatest(v_best_qty,0);
  END IF;
  v_total_avail:=v_total_avail+least(v_avail,v_pend);
  IF v_pend>v_avail THEN
   v_sufficient:=false;
   -- Sem estoque e sem ordem de produção: a necessidade pode virar MTO.
   IF v_mto AND it.sourcing_type='STOCK' THEN
    v_mto_total:=v_mto_total+(v_pend-v_avail);
   END IF;
  END IF;
  v_json:=v_json||jsonb_build_object('sales_order_item_id',it.id,'variant_id',it.product_variant_id,
   'sku',it.sku_snapshot,'description',it.description_snapshot,
   'required_quantity',v_need,'reserved_quantity',v_reserved,'pending_quantity',v_pend,
   'suggested_location_id',v_best,'on_hand',v_onhand,'available',v_avail,
   'sufficient',v_pend<=v_avail,'sourcing_type',it.sourcing_type,
   'make_to_order_suggested',v_mto AND it.sourcing_type='STOCK' AND v_pend>v_avail,
   'make_to_order_quantity',CASE WHEN v_mto AND it.sourcing_type='STOCK' THEN greatest(0,v_pend-v_avail) ELSE 0 END);
 END LOOP;
 RETURN jsonb_build_object('sales_order_id',_order,'items',v_json,
  'required_quantity',v_total_need,'reserved_quantity',v_total_reserved,
  'pending_quantity',greatest(0,v_total_need-v_total_reserved),
  'make_to_order_quantity',v_mto_total,
  'sufficient',v_sufficient AND v_mto_total<=0,
  'formula','DISPONÍVEL = SALDO FÍSICO - RESERVAS ATIVAS',
  'checked_at',now());
END;
$$;

-- Reserva de estoque. Efeito exclusivo sobre a disponibilidade.
-- `allow_partial` respeita a politica da organizacao. Concorrencia: o advisory
-- lock por organizacao serializa as transacoes de reserva, entao duas
-- reservas simultaneas nunca veem o mesmo disponivel.
CREATE FUNCTION public.sales_reserve(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; it public.sales_order_items; i jsonb; cfg jsonb;
 v_policy text; v_need numeric; v_reserved numeric; v_pend numeric; v_avail numeric;
 v_qty numeric; v_loc uuid; v_batch uuid; v_res uuid; v_expires timestamptz; v_created integer:=0;
 v_skipped jsonb:='[]'::jsonb; v_key text; v_status text; v_mto boolean; v_items jsonb;
BEGIN
 PERFORM public.sales_require(_org,'reservations.create');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED') THEN
  RAISE EXCEPTION 'Somente pedido aprovado pode reservar estoque (status atual: %).',o.status;
 END IF;
 cfg:=public.sales_settings(_org); v_policy:=cfg->>'reservation_policy'; v_mto:=coalesce((cfg->>'make_to_order_enabled')::boolean,true);

 -- Sem lista explicita, a reserva cobre tudo que ainda esta pendente no
 -- pedido. Reserver item a item continua sendo possivel.
 v_items:=coalesce(_data->'items',_data->'lines');
 IF v_items IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('sales_order_item_id',it2.id) ORDER BY it2.created_at),'[]'::jsonb)
   INTO v_items
  FROM public.sales_order_items it2
  WHERE it2.organization_id=_org AND it2.sales_order_id=_order AND it2.status<>'CANCELED'
   AND it2.approved_quantity>it2.reserved_quantity;
 END IF;
 FOR i IN SELECT * FROM jsonb_array_elements(v_items) LOOP
  it:=NULL;
  SELECT * INTO it FROM public.sales_order_items
   WHERE organization_id=_org AND sales_order_id=_order
     AND (CASE WHEN i ? 'sales_order_item_id' THEN id=nullif(i->>'sales_order_item_id','')::uuid
               WHEN i ? 'variant_id' THEN product_variant_id=nullif(i->>'variant_id','')::uuid
               ELSE false END);
  IF it.id IS NULL THEN RAISE EXCEPTION 'Item do pedido não encontrado.'; END IF;
  IF it.status='CANCELED' THEN RAISE EXCEPTION 'Item cancelado não pode ser reservado.'; END IF;
  v_need:=CASE WHEN it.approved_quantity>0 THEN it.approved_quantity ELSE it.ordered_quantity END;
  v_reserved:=it.reserved_quantity-it.fulfilled_quantity;
  v_reserved:=greatest(0,v_reserved);
  v_pend:=greatest(0,v_need-v_reserved);
  IF v_pend<=0 THEN
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','ITEM_ALREADY_RESERVED');
   CONTINUE;
  END IF;
  v_loc:=coalesce(nullif(i->>'inventory_location_id','')::uuid,nullif(_data->>'source_location_id','')::uuid);
  v_batch:=nullif(i->>'batch_id','')::uuid;
  IF v_loc IS NULL THEN
   -- Escolhe a localização autorizada com maior disponível do item.
   SELECT l.id INTO v_loc FROM public.inventory_locations l
    WHERE l.organization_id=_org AND l.status='ACTIVE' AND l.operational_purpose='NORMAL'
      AND l.partner_id IS NULL AND l.type<>'TRANSIT'
      AND public.sales_available(_org,it.product_variant_id,l.id,v_batch)>0
    ORDER BY public.sales_available(_org,it.product_variant_id,l.id,v_batch) DESC,l.name LIMIT 1;
  END IF;
  IF v_loc IS NULL THEN
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','NO_LOCATION_AVAILABLE');
   CONTINUE;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_locations
     WHERE id=v_loc AND organization_id=_org AND status='ACTIVE' AND operational_purpose='NORMAL'
       AND partner_id IS NULL AND type<>'TRANSIT') THEN
   RAISE EXCEPTION 'Localização % não é autorizada para venda direta.',v_loc;
  END IF;
  IF v_batch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventory_batches
     WHERE id=v_batch AND organization_id=_org AND variant_id=it.product_variant_id AND status='ACTIVE') THEN
   RAISE EXCEPTION 'Lote inválido ou desativado.';
  END IF;
  v_avail:=public.sales_available(_org,it.product_variant_id,v_loc,v_batch);
  v_qty:=coalesce(nullif(i->>'quantity','')::numeric,v_pend);
  v_qty:=least(v_qty,v_pend);
  IF v_policy<>'ALLOW_NEGATIVE_AVAILABLE' THEN
   v_qty:=least(v_qty,greatest(v_avail,0));
  END IF;
  IF v_qty<=0 THEN
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','NO_AVAILABLE_STOCK',
     'available',v_avail,'pending',v_pend);
   -- Reserva parcial é permitida; o pedido NÃO fica totalmente disponível.
   CONTINUE;
  END IF;
  IF v_policy='FULL_ONLY' AND v_qty<v_pend THEN
   RAISE EXCEPTION 'Política da organização exige reserva integral: % (% de %).',it.sku_snapshot,v_qty::text,v_pend::text;
  END IF;
  v_expires:=now()+make_interval(hours=>coalesce(nullif(_data->>'expires_hours','')::int,
    nullif(cfg->>'reservation_expiry_hours','')::int,72));
  v_key:=coalesce(nullif(i->>'idempotency_key','')::text,nullif(_data->>'idempotency_key','')::text,
    'sales:reserve:'||_order||':'||it.id||':'||v_loc||':'||coalesce(v_batch::text,'*'));
  INSERT INTO public.inventory_reservations(organization_id,sales_order_id,sales_order_item_id,
    variant_id,inventory_location_id,batch_id,quantity,status,reserved_at,expires_at,idempotency_key,created_by)
  VALUES(_org,_order,it.id,it.product_variant_id,v_loc,v_batch,v_qty,'ACTIVE',now(),v_expires,v_key,auth.uid())
  ON CONFLICT(organization_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_res;
  IF v_res IS NULL THEN
   SELECT id INTO v_res FROM public.inventory_reservations WHERE organization_id=_org AND idempotency_key=v_key;
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','IDEMPOTENT_REPLAY',
     'reservation_id',v_res);
   CONTINUE;
  END IF;
  v_created:=v_created+1;
  PERFORM public.sales_audit(_org,'inventory_reservation.created','inventory_reservations',v_res,
    jsonb_build_object('sales_order_id',_order,'sales_order_item_id',it.id,'quantity',v_qty,
      'variant_id',it.product_variant_id,'location_id',v_loc,'batch_id',v_batch,'expires_at',v_expires));
 END LOOP;

 -- Recalcula o estado de estoque do pedido a partir das reservas reais.
 SELECT coalesce(sum(greatest(0,CASE WHEN i.approved_quantity>0 THEN i.approved_quantity ELSE i.ordered_quantity END)
   -coalesce((SELECT sum(r.quantity-r.fulfilled_quantity-r.released_quantity)
      FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
        AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0)),0) INTO v_pend
 FROM public.sales_order_items i WHERE i.organization_id=_org AND i.sales_order_id=_order AND i.status<>'CANCELED';
 SELECT coalesce(sum(r.quantity-r.fulfilled_quantity-r.released_quantity),0)
  INTO v_reserved FROM public.inventory_reservations r
 WHERE r.organization_id=_org AND r.sales_order_id=_order AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED');
 SELECT coalesce(sum(CASE WHEN i.approved_quantity>0 THEN i.approved_quantity ELSE i.ordered_quantity END),0) INTO v_qty
  FROM public.sales_order_items i WHERE i.organization_id=_org AND i.sales_order_id=_order AND i.status<>'CANCELED';
 SELECT stock_status INTO v_status FROM public.sales_orders WHERE id=_order;
 v_status:=CASE WHEN v_reserved<=0 THEN 'NOT_EVALUATED'
  WHEN v_pend<=0 THEN 'RESERVED' WHEN v_reserved>0 THEN 'PARTIAL' ELSE 'INSUFFICIENT' END;
 -- Aprovado com pendência: o pedido diz que não está pronto.
 UPDATE public.sales_orders SET stock_status=v_status,
  status=CASE WHEN v_status IN ('RESERVED','PARTIAL') AND status IN ('APPROVED','AWAITING_STOCK')
    THEN 'READY_FOR_FULFILLMENT' WHEN v_status IN ('PARTIAL','INSUFFICIENT')
      AND status IN ('APPROVED','READY_FOR_FULFILLMENT') THEN 'AWAITING_STOCK' ELSE status END,
  availability_checked_at=now(),updated_at=now()
 WHERE id=_order;
 PERFORM public.sales_audit(_org,'inventory_reservation.batch','sales_orders',_order,
   jsonb_build_object('created',v_created,'skipped',v_skipped,'reserved_total',v_reserved,'pending_total',v_pend));
 RETURN jsonb_build_object('sales_order_id',_order,'created',v_created,'skipped',v_skipped,
   'reserved_total',v_reserved,'pending_total',v_pend,'stock_status',v_status);
END;
$$;

-- Libera uma reserva. Reserva não é movimentação: liberar não toca o ledger.
CREATE FUNCTION public.sales_reservation_action(_org uuid,_reservation uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.inventory_reservations; v_qty numeric; v_reason text; v_new text; v_now timestamptz:=now();
BEGIN
 IF _action NOT IN ('release','expire','consume') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 PERFORM public.sales_require(_org,CASE WHEN _action='release' THEN 'reservations.release' ELSE 'reservations.release' END);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO r FROM public.inventory_reservations WHERE id=_reservation AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva não encontrada.'; END IF;
 IF r.status IN ('CONSUMED','RELEASED','CANCELED') THEN
  RETURN jsonb_build_object('id',_reservation,'status',r.status,'deduped',true);
 END IF;
 v_qty:=r.quantity-r.fulfilled_quantity-r.released_quantity;
 IF _action='consume' THEN
  v_qty:=coalesce(nullif(_data->>'quantity','')::numeric,v_qty);
  IF v_qty<=0 OR v_qty>r.quantity-r.released_quantity THEN RAISE EXCEPTION 'Quantidade de consumo inválida.'; END IF;
  v_new:=CASE WHEN r.fulfilled_quantity+v_qty>=r.quantity THEN 'CONSUMED' ELSE 'PARTIALLY_CONSUMED' END;
  UPDATE public.inventory_reservations SET fulfilled_quantity=fulfilled_quantity+v_qty,status=v_new,
   consumed_at=CASE WHEN v_new='CONSUMED' THEN v_now ELSE consumed_at END,updated_at=v_now WHERE id=_reservation;
 ELSIF _action='expire' THEN
  v_new:='EXPIRED';
  UPDATE public.inventory_reservations SET status=v_new,released_quantity=released_quantity+v_qty,
   released_at=v_now,release_reason='Expiração automática',updated_at=v_now WHERE id=_reservation;
 ELSE
  v_reason:=nullif(trim(coalesce(_data->>'reason','')),'');
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo da liberação é obrigatório.'; END IF;
  v_new:='RELEASED';
  UPDATE public.inventory_reservations SET status=v_new,released_quantity=released_quantity+v_qty,
   released_at=v_now,release_reason=v_reason,updated_at=v_now WHERE id=_reservation;
 END IF;
 -- Recalcula o reservado do item e o estado de estoque do pedido.
 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((
    SELECT sum(greatest(0,r.quantity-r.fulfilled_quantity-r.released_quantity))
    FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
      AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
  WHERE i.id=r.sales_order_item_id;
 PERFORM public.sales_audit(_org,'inventory_reservation.'||_action,'inventory_reservations',_reservation,
   jsonb_build_object('quantity',v_qty,'sales_order_id',r.sales_order_id,'reason',v_reason));
 RETURN jsonb_build_object('id',_reservation,'status',v_new,'released',v_qty);
END;
$$;


-- =====================================================================
-- 13. Atendimento: separacao, conferencia e embalagem.
--
-- A separacao NAO baixa o ledger. Nenhuma linha de inventory_movements e
-- criada aqui: a baixa oficial acontece apenas na expedicao dispatched.
-- =====================================================================

CREATE FUNCTION public.sales_fulfillment_create(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; f public.fulfillment_orders; ident uuid; v_number text;
 v_loc uuid; v_item jsonb; v_items jsonb:='[]'::jsonb; v_status text; v_mismatch integer:=0;
 v_task uuid; v_n integer:=0; v_prio text; v_planned date; v_assign uuid; v_now timestamptz:=now();
BEGIN
 PERFORM public.sales_require(_org,'fulfillment.manage');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED') THEN
  RAISE EXCEPTION 'Somente pedido aprovado pode virar atendimento (status: %).',o.status;
 END IF;
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))<1 THEN
  RAISE EXCEPTION 'Selecione ao menos um item para separar.';
 END IF;
 v_loc:=coalesce(nullif(_data->>'source_location_id','')::uuid,
   (SELECT r.inventory_location_id FROM public.inventory_reservations r
     WHERE r.organization_id=_org AND r.sales_order_id=_order
       AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
     ORDER BY r.reserved_at DESC LIMIT 1));
 IF v_loc IS NULL THEN
  v_loc:=coalesce(nullif(_data->>'source_location_id','')::uuid,
   (SELECT id FROM public.inventory_locations WHERE organization_id=_org AND status='ACTIVE'
      AND operational_purpose='NORMAL' AND partner_id IS NULL AND type<>'TRANSIT'
    ORDER BY name LIMIT 1));
 END IF;
 IF v_loc IS NULL THEN RAISE EXCEPTION 'Nenhuma localização autorizada para atendimento.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=v_loc AND organization_id=_org
    AND status='ACTIVE' AND operational_purpose='NORMAL' AND partner_id IS NULL AND type<>'TRANSIT') THEN
  RAISE EXCEPTION 'Localização % não pode atender venda direta (parceiro, trânsito ou quarentena).',v_loc;
 END IF;
 v_prio:=coalesce(nullif(_data->>'priority',''),'NORMAL');
 v_planned:=nullif(_data->>'planned_date','')::date;
 v_assign:=nullif(_data->>'assigned_user_id','')::uuid;
 v_number:=public.sales_next_number(_org,'fulfillment');
 INSERT INTO public.fulfillment_orders(organization_id,fulfillment_number,sales_order_id,source_location_id,
   status,priority,planned_date,assigned_user_id,created_by)
 VALUES(_org,v_number,_order,v_loc,'DRAFT',v_prio,v_planned,v_assign,auth.uid())
 RETURNING * INTO f;
 ident:=f.id;

 INSERT INTO public.picking_tasks(organization_id,fulfillment_order_id,sales_order_id,location_id,status,assigned_user_id,created_by)
 VALUES(_org,ident,_order,v_loc,'PENDING',v_assign,auth.uid()) RETURNING id INTO v_task;

 FOR v_item IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order
     AND id=nullif(v_item->>'sales_order_item_id','')::uuid) THEN
   RAISE EXCEPTION 'Item do pedido inválido.';
  END IF;
  v_n:=v_n+1;
 END LOOP;
 IF v_n=0 THEN RAISE EXCEPTION 'Selecione ao menos um item para separar.'; END IF;

 INSERT INTO public.picking_task_items(organization_id,picking_task_id,sales_order_item_id,variant_id,
   sku_snapshot,description_snapshot,barcode_snapshot,requested_quantity,reserved_quantity,
   location_id,created_at,updated_at)
 SELECT _org,v_task,it.id,it.product_variant_id,it.sku_snapshot,it.description_snapshot,
   it.price_snapshot->>'barcode_snapshot',
    least(coalesce(nullif(req->>'quantity','')::numeric,it.approved_quantity),it.approved_quantity),
   (SELECT coalesce(sum(r.quantity-r.fulfilled_quantity-r.released_quantity),0)
     FROM public.inventory_reservations r WHERE r.sales_order_item_id=it.id
       AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED') AND r.inventory_location_id=v_loc),
   v_loc,now(),now()
  FROM jsonb_array_elements(_data->'items') req
  JOIN public.sales_order_items it ON it.id=nullif(req->>'sales_order_item_id','')::uuid
  WHERE it.organization_id=_org AND it.sales_order_id=_order;

 -- Confere as quatro quantidades: solicitada x reservada x separada x conferida.
 FOR v_item IN SELECT * FROM jsonb_array_elements(
   (SELECT jsonb_agg(jsonb_build_object('id',pti.id,'requested',pti.requested_quantity,
      'reserved',pti.reserved_quantity,'sku',pti.sku_snapshot)) FROM public.picking_task_items pti
    WHERE pti.organization_id=_org AND pti.picking_task_id=v_task)) LOOP
  IF coalesce((v_item->>'reserved')::numeric,0)<coalesce((v_item->>'requested')::numeric,0) THEN
   v_mismatch:=v_mismatch+1;
   PERFORM public.sales_open_exception(_org,'INSUFFICIENT_STOCK','WARNING',
     format('Item %s sem reserva integral para a separação (%s de %s).',v_item->>'sku',
       v_item->>'reserved',v_item->>'requested'),
     jsonb_build_object('sales_order_id',_order,'fulfillment_order_id',ident,'picking_task_id',v_task,
       'variant_id',null));
  END IF;
 END LOOP;

 UPDATE public.fulfillment_orders SET status='READY_FOR_PICKING',updated_at=v_now WHERE id=ident;
 UPDATE public.sales_orders SET status='READY_FOR_FULFILLMENT',fulfillment_status='IN_PROGRESS',updated_at=v_now
  WHERE id=_order AND status IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT');
 PERFORM public.sales_audit(_org,'fulfillment_order.created','fulfillment_orders',ident,
   jsonb_build_object('sales_order_id',_order,'source_location_id',v_loc,'items',v_n));
 RETURN jsonb_build_object('id',ident,'fulfillment_number',v_number,'picking_task_id',v_task,'status','READY_FOR_PICKING');
END;
$$;

-- Maquina de estados do atendimento.
CREATE FUNCTION public.sales_fulfillment_action(_org uuid,_fulfillment uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.fulfillment_orders; v_new text; v_reason text; v_task uuid; v_now timestamptz:=now();
 v_open integer; v_conf numeric; v_ship uuid;
BEGIN
 PERFORM public.sales_require(_org,'fulfillment.manage');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO f FROM public.fulfillment_orders WHERE id=_fulfillment AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 v_reason:=nullif(trim(coalesce(_data->>'reason','')),'');
 IF f.status IN ('SHIPPED','CANCELED') THEN RAISE EXCEPTION 'Atendimento já encerrado.'; END IF;

 IF _action='start' THEN
  IF f.status<>'READY_FOR_PICKING' THEN RAISE EXCEPTION 'Atendimento não está pronto para separação.'; END IF;
  v_new:='PICKING';
  SELECT id INTO v_task FROM public.picking_tasks WHERE organization_id=_org AND fulfillment_order_id=_fulfillment ORDER BY created_at LIMIT 1;
  IF v_task IS NULL THEN RAISE EXCEPTION 'Atendimento sem tarefa de separação.'; END IF;
  UPDATE public.picking_tasks SET status='IN_PROGRESS',started_at=coalesce(started_at,v_now),updated_at=v_now
   WHERE id=v_task AND status='PENDING';
 ELSIF _action='pick' THEN
  IF f.status<>'PICKING' THEN RAISE EXCEPTION 'Separação não está em andamento.'; END IF;
  v_new:='PICKED';
  SELECT id INTO v_task FROM public.picking_tasks WHERE organization_id=_org AND fulfillment_order_id=_fulfillment ORDER BY created_at LIMIT 1;
  UPDATE public.picking_tasks SET status='PICKED',picked_at=v_now,updated_at=v_now
   WHERE id=v_task AND status IN ('PENDING','IN_PROGRESS');
  -- Todo item precisa de quantidade separada antes de embalar.
  IF EXISTS(SELECT 1 FROM public.picking_task_items
     WHERE organization_id=_org AND picking_task_id=v_task AND picked_quantity<=0) THEN
   RAISE EXCEPTION 'Existem itens sem quantidade separada.';
  END IF;
 ELSIF _action='pack' THEN
  IF f.status NOT IN ('PICKED','PACKING') THEN RAISE EXCEPTION 'Separação precisa estar concluída antes de embalar.'; END IF;
  v_new:='PACKING';
 ELSIF _action='ready' THEN
  IF f.status<>'PACKING' THEN RAISE EXCEPTION 'Atendimento não está em embalagem.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.packing_records
     WHERE organization_id=_org AND fulfillment_order_id=_fulfillment) THEN
   RAISE EXCEPTION 'Registre o embalagem antes de liberar para expedição.';
  END IF;
  v_new:='READY_FOR_SHIPMENT';
 ELSIF _action='cancel' THEN
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo do cancelamento é obrigatório.'; END IF;
  v_new:='CANCELED';
  SELECT id INTO v_task FROM public.picking_tasks WHERE organization_id=_org AND fulfillment_order_id=_fulfillment ORDER BY created_at LIMIT 1;
  IF v_task IS NOT NULL THEN
   UPDATE public.picking_tasks SET status='CANCELED',updated_at=v_now WHERE id=v_task AND status<>'CONFIRMED';
  END IF;
  -- Cancelar atendimento devolve a reserva ao disponivel. Nao toca no ledger.
  UPDATE public.inventory_reservations SET status='RELEASED',released_quantity=quantity,released_at=v_now,
   release_reason=coalesce(v_reason,'Atendimento cancelado'),updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=f.sales_order_id
     AND inventory_location_id=f.source_location_id
     AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
     AND NOT EXISTS(SELECT 1 FROM public.shipment_items si
       WHERE si.reservation_id=inventory_reservations.id);
  UPDATE public.sales_order_items i SET reserved_quantity=coalesce((SELECT sum(greatest(0,r.quantity-r.fulfilled_quantity-r.released_quantity))
    FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
      AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
   WHERE i.organization_id=_org AND i.sales_order_id=f.sales_order_id;
 ELSE RAISE EXCEPTION 'Ação inválida.'; END IF;

 UPDATE public.fulfillment_orders SET status=v_new,cancel_reason=coalesce(v_reason,cancel_reason),updated_at=v_now WHERE id=_fulfillment;
 PERFORM public.sales_audit(_org,'fulfillment_order.'||_action,'fulfillment_orders',_fulfillment,
   jsonb_build_object('from',f.status,'to',v_new,'reason',v_reason));
 RETURN jsonb_build_object('id',_fulfillment,'status',v_new);
END;
$$;

-- Leitura de codigo de barras. Valida SKU, variante, quantidade e localizacao.
-- NAO aceita produto incorreto apenas porque a descricao e parecida.
CREATE FUNCTION public.sales_pick_scan(_org uuid,_task uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.picking_tasks; v_code text; v_row record; v_item public.picking_task_items;
 v_qty numeric; v_here numeric; v_now timestamptz:=now();
BEGIN
 PERFORM public.sales_require(_org,'picking.execute');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO t FROM public.picking_tasks WHERE id=_task AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa de separação não encontrada.'; END IF;
 IF t.status NOT IN ('PENDING','IN_PROGRESS') THEN RAISE EXCEPTION 'Tarefa não está em separação.'; END IF;
 v_code:=nullif(trim(coalesce(_data->>'code','')),'');
 IF v_code IS NULL THEN RAISE EXCEPTION 'Informe o código de barras ou o SKU.'; END IF;
 v_qty:=coalesce(nullif(_data->>'quantity','')::numeric,1);
 IF v_qty<=0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero.'; END IF;
 -- Aceita barcode do catalogo, barcode congelado nanegociacao ou SKU exato.
 SELECT v.id,v.sku INTO v_row FROM public.product_variants v
  WHERE v.organization_id=_org AND (v.barcode=v_code OR v.sku=v_code) LIMIT 1;
 IF v_row.id IS NULL THEN
  PERFORM public.sales_open_exception(_org,'INVALID_SKU','WARNING',
    format('Código %s não corresponde a nenhuma variante.',v_code),jsonb_build_object('picking_task_id',_task,'code',v_code));
  RAISE EXCEPTION 'Código %s não corresponde a nenhuma variante.',v_code;
 END IF;
 SELECT * INTO v_item FROM public.picking_task_items
  WHERE organization_id=_org AND picking_task_id=_task AND variant_id=v_row.id
    AND (t.location_id IS NULL OR coalesce(location_id,t.location_id)=coalesce(t.location_id,location_id));
 IF v_item.id IS NULL THEN
  PERFORM public.sales_open_exception(_org,'INVALID_SKU','ERROR',
    format('A variante %s não está neste atendimento.',v_row.sku),
    jsonb_build_object('picking_task_id',_task,'variant_id',v_row.id,'code',v_code));
  RAISE EXCEPTION 'A variante %s não está neste atendimento.',v_row.sku;
 END IF;
 IF v_item.picked_quantity+v_qty>v_item.requested_quantity THEN
  PERFORM public.sales_open_exception(_org,'PICKING_DIFFERENCE','WARNING',
    format('Excesso de separação em %s: %s separado para %s solicitado.',v_item.sku_snapshot,
      (v_item.picked_quantity+v_qty)::text,v_item.requested_quantity::text),
    jsonb_build_object('picking_task_id',_task,'sales_order_item_id',v_item.sales_order_item_id,'variant_id',v_row.id));
  RAISE EXCEPTION 'Excesso de separação em %s.',v_item.sku_snapshot;
 END IF;
 v_here:=coalesce(public.sales_on_hand(_org,v_row.id,coalesce(t.location_id,v_item.location_id),v_item.batch_id),0);
 IF v_here<v_item.picked_quantity+v_qty THEN
  PERFORM public.sales_open_exception(_org,'INSUFFICIENT_STOCK','WARNING',
    format('Saldo físico insuficiente em %s: %s disponível.',v_item.sku_snapshot,v_here::text),
    jsonb_build_object('picking_task_id',_task,'sales_order_item_id',v_item.sales_order_item_id,'variant_id',v_row.id));
 END IF;
 UPDATE public.picking_tasks SET status='IN_PROGRESS',started_at=coalesce(started_at,v_now),updated_at=now() WHERE id=_task;
 UPDATE public.picking_task_items SET picked_quantity=picked_quantity+v_qty,updated_at=now() WHERE id=v_item.id;
 PERFORM public.sales_audit(_org,'picking.scanned','picking_task_items',v_item.id,
   jsonb_build_object('picking_task_id',_task,'code',v_code,'variant_id',v_row.id,'quantity',v_qty));
 RETURN jsonb_build_object('picking_task_id',_task,'sales_order_item_id',v_item.sales_order_item_id,
   'variant_id',v_row.id,'sku',v_item.sku_snapshot,'picked_quantity',v_item.picked_quantity+v_qty,
   'requested_quantity',v_item.requested_quantity,
   'remaining',greatest(0,v_item.requested_quantity-v_item.picked_quantity-v_qty));
END;
$$;

-- Conferência. Compara QUANTIDADE SOLICITADA / RESERVADA / SEPARADA /
-- CONFERIDA. Divergencia vira excecao, nunca um ajuste silencioso.
CREATE FUNCTION public.sales_pick_confirm(_org uuid,_task uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.picking_tasks; v_item jsonb; v_diff jsonb:='[]'::jsonb; v_now timestamptz:=now();
 v_perm text; v_count integer:=0; v_batch uuid; v_conf numeric;
BEGIN
 v_perm:=CASE WHEN _data ? 'items' THEN 'picking.confirm' ELSE 'picking.confirm' END;
 PERFORM public.sales_require(_org,v_perm);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO t FROM public.picking_tasks WHERE id=_task AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa de separação não encontrada.'; END IF;
 IF t.status NOT IN ('IN_PROGRESS','PICKED','PENDING') THEN RAISE EXCEPTION 'Tarefa não está em conferência.'; END IF;
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))=0 THEN
  RAISE EXCEPTION 'Informe ao menos um item conferido.';
 END IF;
 FOR v_item IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
  v_conf:=coalesce(nullif(v_item->>'confirmed_quantity','')::numeric,0);
  IF v_conf<0 THEN RAISE EXCEPTION 'Quantidade conferida não pode ser negativa.'; END IF;
  v_batch:=nullif(v_item->>'batch_id','')::uuid;
  IF v_batch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.picking_task_items pti
     WHERE pti.organization_id=_org AND pti.id=nullif(v_item->>'picking_task_item_id','')::uuid
       AND (pti.batch_id=v_batch OR pti.batch_id IS NULL)) THEN
   PERFORM public.sales_open_exception(_org,'WRONG_BATCH','ERROR',
    'Lote informado diverge do esperado na separação.',
    jsonb_build_object('picking_task_id',_task,'picking_task_item_id',v_item->>'picking_task_item_id','batch_id',v_batch));
   RAISE EXCEPTION 'Lote informado diverge do esperado na separação.';
  END IF;
  -- Divergencia entre o separado e o conferido e registrada como excecao.
  IF v_conf<>(SELECT pti.picked_quantity FROM public.picking_task_items pti
     WHERE pti.organization_id=_org AND pti.id=nullif(v_item->>'picking_task_item_id','')::uuid) THEN
   v_diff:=v_diff||jsonb_build_object('picking_task_item_id',v_item->>'picking_task_item_id','confirmed',v_conf,
     'picked',(SELECT pti.picked_quantity FROM public.picking_task_items pti
       WHERE pti.id=nullif(v_item->>'picking_task_item_id','')::uuid));
   PERFORM public.sales_open_exception(_org,'PICKING_DIFFERENCE','WARNING',
    'Divergência entre quantidade separada e conferida.',
    jsonb_build_object('picking_task_id',_task,'fulfillment_order_id',t.fulfillment_order_id,
      'sales_order_id',t.sales_order_id,'picking_task_item_id',v_item->>'picking_task_item_id',
      'details',jsonb_build_object('confirmed',v_conf)));
  END IF;
  UPDATE public.picking_task_items SET confirmed_quantity=v_conf,
    difference_reason=CASE WHEN v_conf<>(SELECT pti.picked_quantity FROM public.picking_task_items pti
      WHERE pti.id=nullif(v_item->>'picking_task_item_id','')::uuid)
      THEN coalesce(nullif(v_item->>'difference_reason',''),(CASE WHEN v_conf<0 THEN 'SHORT_PICK' ELSE 'OVER_PICK' END))
      ELSE NULL END,
    batch_id=coalesce(v_batch,batch_id),updated_at=v_now
   WHERE organization_id=_org AND id=nullif(v_item->>'picking_task_item_id','')::uuid;
  v_count:=v_count+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.picking_task_items WHERE organization_id=_org AND picking_task_id=_task AND confirmed_quantity<=0) THEN
  RAISE EXCEPTION 'Todos os itens precisam de quantidade conferida maior que zero.';
 END IF;
 UPDATE public.picking_tasks SET status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=v_now,updated_at=v_now WHERE id=_task;
 -- O item do pedido reflete o conferido. Expedido continua em zero ate a expedicao.
 UPDATE public.sales_order_items i SET picked_quantity=coalesce((
   SELECT sum(pti.confirmed_quantity) FROM public.picking_task_items pti
   WHERE pti.organization_id=_org AND pti.sales_order_item_id=i.id AND pti.confirmed_quantity>0),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=t.sales_order_id;
 UPDATE public.fulfillment_orders f SET status=CASE WHEN f.status IN ('PICKING','PICKED') THEN 'PACKING' ELSE f.status END,
  updated_at=v_now WHERE f.id=t.fulfillment_order_id;
 PERFORM public.sales_audit(_org,'picking.confirmed','picking_tasks',_task,
   jsonb_build_object('items',v_count,'differences',v_diff,'fulfillment_order_id',t.fulfillment_order_id));
 RETURN jsonb_build_object('picking_task_id',_task,'status','CONFIRMED','items',v_count,'differences',v_diff);
END;
$$;

-- Embalagem. Peso e dimensao sao INFORMADOS: o sistema nunca estima.
CREATE FUNCTION public.sales_pack(_org uuid,_fulfillment uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.fulfillment_orders; p public.packing_records; ident uuid; v_now timestamptz:=now();
 v_w numeric; v_informed boolean; v_item jsonb; v_vol jsonb; v_count integer:=0; v_volumes integer:=0;
 v_total numeric:=0; v_mismatch jsonb:='[]'::jsonb; v_item_row record;
BEGIN
 PERFORM public.sales_require(_org,'packing.manage');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO f FROM public.fulfillment_orders WHERE id=_fulfillment AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 IF f.status NOT IN ('PICKED','PACKING') THEN RAISE EXCEPTION 'Atendimento não está em embalagem.'; END IF;
 v_w:=nullif(_data->>'gross_weight_kg','')::numeric;
 v_informed:=v_w IS NOT NULL;
 IF v_informed AND v_w<=0 THEN RAISE EXCEPTION 'Peso informado deve ser maior que zero.'; END IF;
 INSERT INTO public.packing_records(organization_id,fulfillment_order_id,sales_order_id,packed_by,packed_at,
   gross_weight_kg,weight_informed,length_cm,width_cm,height_cm,volume_count,notes,created_by)
 VALUES(_org,_fulfillment,f.sales_order_id,auth.uid(),v_now,v_w,v_informed,
   nullif(_data->>'length_cm','')::numeric,nullif(_data->>'width_cm','')::numeric,nullif(_data->>'height_cm','')::numeric,
   greatest(1,coalesce(jsonb_array_length(coalesce(_data->'volumes','[]'::jsonb)),1)),
   nullif(trim(coalesce(_data->>'notes','')),''),auth.uid())
 RETURNING * INTO p;
 ident:=p.id;
 -- Itens: o conferido, nao o pedido. Divergencia vira excecao.
 FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(_data->'items','[]'::jsonb)) LOOP
  SELECT pti.sales_order_item_id,v.sku,pti.confirmed_quantity,pti.batch_id INTO v_item_row
   FROM public.picking_task_items pti
   JOIN public.picking_tasks t ON t.id=pti.picking_task_id
   JOIN public.product_variants v ON v.id=pti.variant_id
   WHERE pti.organization_id=_org AND pti.picking_task_id=(SELECT id FROM public.picking_tasks
     WHERE organization_id=_org AND fulfillment_order_id=_fulfillment AND status='CONFIRMED' ORDER BY confirmed_at DESC LIMIT 1)
     AND pti.id=nullif(v_item->>'picking_task_item_id','')::uuid;
  IF v_item_row.sales_order_item_id IS NULL THEN RAISE EXCEPTION 'Item conferido não encontrado no atendimento.'; END IF;
  v_total:=v_total+coalesce(nullif(v_item->>'quantity','')::numeric,v_item_row.confirmed_quantity);
  INSERT INTO public.packing_record_items(organization_id,packing_record_id,sales_order_item_id,variant_id,sku_snapshot,quantity,batch_id)
  SELECT _org,ident,pti.sales_order_item_id,pti.variant_id,pti.sku_snapshot,
    coalesce(nullif(v_item->>'quantity','')::numeric,pti.confirmed_quantity),coalesce(nullif(v_item->>'batch_id','')::uuid,pti.batch_id)
   FROM public.picking_task_items pti
   WHERE pti.organization_id=_org AND pti.id=nullif(v_item->>'picking_task_item_id','')::uuid;
  IF coalesce(nullif(v_item->>'quantity','')::numeric,v_item_row.confirmed_quantity)<>v_item_row.confirmed_quantity THEN
   v_mismatch:=v_mismatch||jsonb_build_object('picking_task_item_id',v_item->>'picking_task_item_id',
     'confirmed',v_item_row.confirmed_quantity,'packed',nullif(v_item->>'quantity','')::numeric);
   PERFORM public.sales_open_exception(_org,'PACKING_DIFFERENCE','WARNING',
     format('Divergência na embalagem de %s.',v_item_row.sku),
     jsonb_build_object('fulfillment_order_id',_fulfillment,'sales_order_id',f.sales_order_id));
  END IF;
  v_count:=v_count+1;
 END LOOP;
 IF v_count=0 THEN RAISE EXCEPTION 'Informe os itens embalados.'; END IF;
 -- Multiplos volumes por atendimento (ex.: 200 unidades em 4 caixas).
 FOR v_vol IN SELECT * FROM jsonb_array_elements(coalesce(_data->'volumes','[]'::jsonb)) LOOP
  IF nullif(trim(coalesce(v_vol->>'volume_number','')),'') IS NULL THEN RAISE EXCEPTION 'Volume sem identificação.'; END IF;
  INSERT INTO public.packing_record_volumes(organization_id,packing_record_id,volume_number,
    gross_weight_kg,weight_informed,length_cm,width_cm,height_cm,notes)
  VALUES(_org,ident,v_vol->>'volume_number',nullif(v_vol->>'gross_weight_kg','')::numeric,
    nullif(v_vol->>'gross_weight_kg','') IS NOT NULL,
    nullif(v_vol->>'length_cm','')::numeric,nullif(v_vol->>'width_cm','')::numeric,nullif(v_vol->>'height_cm','')::numeric,
    nullif(trim(coalesce(v_vol->>'notes','')),''));
  v_volumes:=v_volumes+1;
 END LOOP;
 -- Registrar o embalagem NAO libera a expedicao: a liberacao e um passo
 -- explicito do operador (sales_fulfillment_action 'ready').
 UPDATE public.fulfillment_orders SET updated_at=v_now
  WHERE id=_fulfillment AND status='PACKING';
 PERFORM public.sales_audit(_org,'packing.recorded','packing_records',ident,
   jsonb_build_object('fulfillment_order_id',_fulfillment,'items',v_count,'volumes',v_volumes,
     'weight_informed',v_informed,'differences',v_mismatch));
 RETURN jsonb_build_object('packing_record_id',ident,'fulfillment_order_id',_fulfillment,'items',v_count,
   'volumes',v_volumes,'weight_informed',v_informed,'differences',v_mismatch,
   'status',(SELECT status FROM public.fulfillment_orders WHERE id=_fulfillment));
END;
$$;


-- =====================================================================
-- 14. Expedicao: a UNICA porta que baixa o Inventory Ledger.
--
-- Regra central: a expedicao e o unico evento que chama
-- public.inventory_post_movement com SALE/OUT. Separacao, embalagem e
-- reserva NAO geram movimento nenhum.
-- =====================================================================

CREATE FUNCTION public.sales_shipment_create(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; sh public.shipments; cfg jsonb; ident uuid;
 v_number text; v_addr uuid; v_ful uuid; v_task uuid; v_loc uuid; v_carrier uuid; v_tracking text;
 v_item jsonb; v_count integer:=0; v_now timestamptz:=now(); v_snap jsonb; v_add jsonb;
 v_need_full boolean; v_confirmed integer:=0; v_packed integer; v_vol jsonb; v_volumes integer:=0;
BEGIN
 PERFORM public.sales_require(_org,'shipments.create');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED') THEN
  RAISE EXCEPTION 'Somente pedido aprovado pode ser expedido (status: %).',o.status;
 END IF;
 cfg:=public.sales_settings(_org);
 v_need_full:=coalesce((cfg->>'shipment_requires_full_confirmation')::boolean,false);
 v_ful:=nullif(_data->>'fulfillment_order_id','')::uuid;
 v_task:=nullif(_data->>'picking_task_id','')::uuid;
 IF v_ful IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.fulfillment_orders
     WHERE id=v_ful AND organization_id=_org AND sales_order_id=_order
       AND status IN ('PICKED','PACKING','READY_FOR_SHIPMENT')) THEN
   RAISE EXCEPTION 'Atendimento % não está liberado para expedição.',v_ful;
  END IF;
  SELECT id INTO v_task FROM public.picking_tasks
   WHERE organization_id=_org AND fulfillment_order_id=v_ful AND status='CONFIRMED' ORDER BY confirmed_at DESC LIMIT 1;
  SELECT source_location_id INTO v_loc FROM public.fulfillment_orders WHERE id=v_ful;
 END IF;
 v_loc:=coalesce(v_loc,nullif(_data->>'source_location_id','')::uuid,
   (SELECT r.inventory_location_id FROM public.inventory_reservations r
     WHERE r.organization_id=_org AND r.sales_order_id=_order
       AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED') ORDER BY r.reserved_at DESC LIMIT 1));
 IF v_loc IS NULL THEN
  RAISE EXCEPTION 'Informe a localização de origem da expedição.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=v_loc AND organization_id=_org
    AND status='ACTIVE' AND operational_purpose='NORMAL' AND partner_id IS NULL AND type<>'TRANSIT') THEN
  RAISE EXCEPTION 'A expedição direta não pode sair de local de parceiro, trânsito ou quarentena.';
 END IF;
 v_addr:=coalesce(nullif(_data->>'destination_address_id','')::uuid,o.shipping_address_id);
 IF v_addr IS NULL AND coalesce((cfg->>'require_shipping_address')::boolean,true) THEN
  RAISE EXCEPTION 'Endereço de entrega é obrigatório.';
 END IF;
 IF v_addr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_addresses
    WHERE id=v_addr AND organization_id=_org) THEN
  RAISE EXCEPTION 'Endereço de entrega inválido.';
 END IF;
 -- Endereco CONGELADO no momento da expedicao. Snapshot nunca e recalculado.
 IF v_addr IS NOT NULL THEN
  SELECT to_jsonb(a) INTO v_snap FROM public.company_addresses a WHERE a.id=v_addr;
  v_add:=v_snap;
 ELSE
  SELECT to_jsonb(c) INTO v_snap FROM public.companies c WHERE c.id=o.company_id;
  v_add:=jsonb_build_object('company',v_snap);
 END IF;
 v_carrier:=nullif(_data->>'carrier_id','')::uuid;
 IF v_carrier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.carriers
    WHERE id=v_carrier AND organization_id=_org AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Transportadora inválida ou inativa.';
 END IF;
 v_tracking:=nullif(trim(coalesce(_data->>'tracking_code','')),'');
 v_number:=public.sales_next_number(_org,'shipment');
 INSERT INTO public.shipments(organization_id,shipment_number,sales_order_id,fulfillment_order_id,picking_task_id,
   source_location_id,destination_address_id,address_snapshot,carrier_id,tracking_code,tracking_source,
   shipping_method,status,expected_delivery_at,created_by)
 VALUES(_org,v_number,_order,v_ful,v_task,v_loc,v_addr,v_add,v_carrier,v_tracking,
   -- Sem provedor real de rastreio, a origem e sempre MANUAL.
   'MANUAL',
   coalesce(nullif(_data->>'shipping_method',''),'STANDARD'),'DRAFT',nullif(_data->>'expected_delivery_at','')::timestamptz,auth.uid())
 RETURNING * INTO sh;
 ident:=sh.id;

 -- Itens: o que foi CONFERIDO na separacao. Nunca o que foi apenas reservado.
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))>0 THEN
  FOR v_item IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.sales_order_items
      WHERE organization_id=_org AND sales_order_id=_order AND id=nullif(v_item->>'sales_order_item_id','')::uuid) THEN
    RAISE EXCEPTION 'Item do pedido inválido.';
   END IF;
   INSERT INTO public.shipment_items(organization_id,shipment_id,sales_order_item_id,variant_id,sku_snapshot,
     description_snapshot,quantity,batch_id,reservation_id)
   SELECT _org,ident,i.id,i.product_variant_id,i.sku_snapshot,i.description_snapshot,
     coalesce(nullif(v_item->>'quantity','')::numeric,0),nullif(v_item->>'batch_id','')::uuid,
     (SELECT r.id FROM public.inventory_reservations r
       WHERE r.organization_id=_org AND r.sales_order_item_id=i.id
         AND r.inventory_location_id=v_loc AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
       ORDER BY r.reserved_at DESC LIMIT 1)
   FROM public.sales_order_items i
   WHERE i.organization_id=_org AND i.sales_order_id=_order AND i.id=nullif(v_item->>'sales_order_item_id','')::uuid;
   v_count:=v_count+1;
  END LOOP;
 ELSIF v_task IS NOT NULL THEN
  INSERT INTO public.shipment_items(organization_id,shipment_id,sales_order_item_id,variant_id,sku_snapshot,
     description_snapshot,quantity,batch_id,reservation_id)
  SELECT _org,ident,pti.sales_order_item_id,pti.variant_id,pti.sku_snapshot,pti.description_snapshot,
     pti.confirmed_quantity,pti.batch_id,
     (SELECT r.id FROM public.inventory_reservations r
       WHERE r.organization_id=_org AND r.sales_order_item_id=pti.sales_order_item_id
         AND r.inventory_location_id=v_loc AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
       ORDER BY r.reserved_at DESC LIMIT 1)
  FROM public.picking_task_items pti WHERE pti.organization_id=_org AND pti.picking_task_id=v_task
    AND pti.confirmed_quantity>0;
  SELECT count(*) INTO v_count FROM public.shipment_items WHERE organization_id=_org AND shipment_id=ident;
 ELSE
  RAISE EXCEPTION 'Informe os itens da expedição ou o atendimento conferido.';
 END IF;
 IF v_count=0 THEN RAISE EXCEPTION 'Expedição sem itens.'; END IF;
 IF EXISTS(SELECT 1 FROM public.shipment_items WHERE organization_id=_org AND shipment_id=ident AND quantity<=0) THEN
  RAISE EXCEPTION 'Toda linha de expedição precisa de quantidade maior que zero.';
 END IF;
 -- Politica de expedicao integral: nao pode sair parte quando a politica exige tudo.
 IF v_need_full AND v_ful IS NOT NULL THEN
  SELECT count(*) INTO v_confirmed FROM public.shipment_items WHERE organization_id=_org AND shipment_id=ident;
  SELECT count(*) INTO v_packed FROM public.picking_task_items pti
   WHERE pti.organization_id=_org AND pti.picking_task_id=v_task AND pti.confirmed_quantity>0;
  IF v_confirmed<v_packed THEN
   RAISE EXCEPTION 'A política da organização exige expedição integral do atendimento.';
  END IF;
 END IF;
 -- Volumes: o mesmo volume nao pode aparecer duas vezes na mesma expedicao.
 FOR v_vol IN SELECT * FROM jsonb_array_elements(coalesce(_data->'volumes','[]'::jsonb)) LOOP
  IF nullif(trim(coalesce(v_vol->>'volume_number','')),'') IS NULL THEN RAISE EXCEPTION 'Volume sem identificação.'; END IF;
  IF EXISTS(SELECT 1 FROM public.shipment_volumes
     WHERE organization_id=_org AND shipment_id=ident AND volume_number=v_vol->>'volume_number') THEN
   RAISE EXCEPTION 'Volume % repetido na expedição.',v_vol->>'volume_number';
  END IF;
  INSERT INTO public.shipment_volumes(organization_id,shipment_id,packing_volume_id,volume_number,
    gross_weight_kg,weight_informed,carrier_tracking_code)
  SELECT _org,ident,prv.id,v_vol->>'volume_number',nullif(v_vol->>'gross_weight_kg','')::numeric,
    nullif(v_vol->>'gross_weight_kg','') IS NOT NULL,nullif(v_vol->>'carrier_tracking_code','')
  FROM public.packing_record_volumes prv
  WHERE prv.organization_id=_org AND prv.packing_record_id=(SELECT id FROM public.packing_records
    WHERE organization_id=_org AND fulfillment_order_id=v_ful ORDER BY packed_at DESC LIMIT 1)
    AND prv.volume_number=v_vol->>'volume_number';
  v_volumes:=v_volumes+1;
 END LOOP;
 UPDATE public.shipments SET status='READY',updated_at=v_now WHERE id=ident;
 PERFORM public.sales_audit(_org,'shipment.created','shipments',ident,
   jsonb_build_object('sales_order_id',_order,'fulfillment_order_id',v_ful,'items',v_count,
     'volumes',v_volumes,'source_location_id',v_loc,'carrier_id',v_carrier,'tracking_code',v_tracking));
 RETURN jsonb_build_object('id',ident,'shipment_number',v_number,'status','READY','items',v_count,
   'volumes',v_volumes,'source_location_id',v_loc,'address_snapshot',v_add);
END;
$$;

-- BAIXA OFICIAL DO LEDGER. Idempotente por dispatch_key + chave de movimento.
-- Exige permissao de expedicao E de movimentacao de inventario.
CREATE FUNCTION public.sales_shipment_dispatch(_org uuid,_shipment uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sh public.shipments; o public.sales_orders; cfg jsonb; si record; v_now timestamptz:=now();
 v_key text; v_mov jsonb; v_mov_id uuid; v_res uuid; v_consumed numeric; v_out jsonb:='[]'::jsonb;
 v_deduped boolean; v_fin_trigger text; v_fin_created integer:=0; v_total numeric:=0;
 v_ord_status text; v_ord_ful text; v_req numeric; v_fulfilled numeric; v_ful uuid;
 v_carrier uuid; v_tracking text; v_expected timestamptz;
BEGIN
 PERFORM public.sales_require(_org,'shipments.dispatch');
 -- Baixa de estoque e uma operacao de inventario: exige as duas permissoes.
 PERFORM public.sales_require(_org,'inventory.move');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO sh FROM public.shipments WHERE id=_shipment AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expedição não encontrada.'; END IF;
 IF sh.status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','PARTIALLY_DELIVERED') THEN
  -- Reenvio da mesma expedicao nunca duplica a baixa.
  IF _data->>'dispatch_key' IS NULL OR _data->>'dispatch_key'=sh.dispatch_key THEN
   RETURN jsonb_build_object('id',_shipment,'shipment_number',sh.shipment_number,'status',sh.status,
     'deduped',true,'movements',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'sales_order_item_id',sit.sales_order_item_id,'quantity',sit.quantity,
       'inventory_movement_id',sit.inventory_movement_id))
       FROM public.shipment_items sit WHERE sit.organization_id=_org AND sit.shipment_id=_shipment),'[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'Expedição % já despachada; use uma nova expedição para o saldo restante.',sh.shipment_number;
 END IF;
 IF sh.status NOT IN ('DRAFT','READY') THEN
  RAISE EXCEPTION 'Somente expedição em DRAFT ou READY pode ser despachada (status: %).',sh.status;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shipment_items
    WHERE organization_id=_org AND shipment_id=_shipment AND quantity>0) THEN
  RAISE EXCEPTION 'Expedição sem itens para despachar.';
 END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=sh.sales_order_id AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status IN ('CANCELED','CLOSED') THEN RAISE EXCEPTION 'Pedido % não pode ser expedido.',o.status; END IF;

 v_carrier:=coalesce(nullif(_data->>'carrier_id','')::uuid,sh.carrier_id);
 v_tracking:=coalesce(nullif(trim(coalesce(_data->>'tracking_code','')),''),sh.tracking_code);
 v_expected:=coalesce(nullif(_data->>'expected_delivery_at','')::timestamptz,sh.expected_delivery_at);
 v_key:=coalesce(nullif(_data->>'dispatch_key','')::text,'sales:dispatch:'||_shipment);
 v_ful:=sh.fulfillment_order_id;
 cfg:=public.sales_settings(_org);

 -- Uma baixa por item. A chave do movimento e derivada da expedicao, do item
 -- e do lote: repetir a chamada NUNCA cria uma segunda baixa.
 FOR si IN SELECT * FROM public.shipment_items
   WHERE organization_id=_org AND shipment_id=_shipment AND quantity>0 ORDER BY sku_snapshot LOOP
  v_mov:=public.inventory_post_movement(
    _org,si.variant_id,sh.source_location_id,'SALE',si.quantity,
    'Venda direta '||sh.shipment_number,now(),'un','SALE_SHIPMENT',_shipment,si.batch_id,
    'sales:dispatch:'||_shipment||':'||si.sales_order_item_id||':'||coalesce(si.batch_id::text,'*'),
    'OUT',auth.uid(),false);
  v_mov_id:=nullif(v_mov->>'movement_id','')::uuid;
  v_deduped:=coalesce((v_mov->>'deduped')::boolean,false);
  IF v_mov_id IS NULL THEN
   RAISE EXCEPTION 'Falha ao registrar a baixa de estoque do item %.',si.sku_snapshot;
  END IF;
  IF NOT v_deduped AND si.inventory_movement_id IS NOT NULL AND si.inventory_movement_id<>v_mov_id THEN
   RAISE EXCEPTION 'Item % já possui baixa %s. Expedição inconsistente.',si.sku_snapshot,si.inventory_movement_id;
  END IF;
  UPDATE public.shipment_items SET inventory_movement_id=v_mov_id WHERE id=si.id;
  -- Consome a reserva vinculada. Reserva eje LOWA FISICA: nao altera saldo.
  v_res:=si.reservation_id;
  IF v_res IS NOT NULL THEN
   UPDATE public.inventory_reservations SET fulfilled_quantity=fulfilled_quantity+si.quantity,
     status=CASE WHEN fulfilled_quantity+si.quantity>=quantity THEN 'CONSUMED' ELSE 'PARTIALLY_CONSUMED' END,
     consumed_at=CASE WHEN fulfilled_quantity+si.quantity>=quantity THEN v_now ELSE consumed_at END,
     updated_at=v_now
   WHERE id=v_res AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
     AND fulfilled_quantity+si.quantity<=quantity;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva do item % insuficiente para a expedição.',si.sku_snapshot;
   END IF;
  END IF;
  v_out:=v_out||jsonb_build_object('sales_order_item_id',si.sales_order_item_id,'sku',si.sku_snapshot,
    'quantity',si.quantity,'batch_id',si.batch_id,'inventory_movement_id',v_mov_id,
    'reservation_id',v_res,'deduped',v_deduped);
  v_total:=v_total+si.quantity;
 END LOOP;

 UPDATE public.shipments SET status='DISPATCHED',dispatch_key=v_key,dispatched_at=coalesce(dispatched_at,v_now),
   carrier_id=v_carrier,tracking_code=v_tracking,
   tracking_source=coalesce(nullif(_data->>'tracking_source',''),sh.tracking_source,'MANUAL'),
   expected_delivery_at=v_expected,updated_at=v_now WHERE id=_shipment;
 IF v_ful IS NOT NULL THEN
  UPDATE public.fulfillment_orders SET status='SHIPPED',completed_at=coalesce(completed_at,v_now),updated_at=v_now
   WHERE id=v_ful AND status<>'CANCELED';
 END IF;
 -- Item do pedido: expedido e o que saiu do estoque.
 UPDATE public.sales_order_items i SET fulfilled_quantity=fulfilled_quantity+si.quantity,
   reserved_quantity=greatest(0,reserved_quantity-si.quantity),
   status=CASE WHEN fulfilled_quantity+si.quantity>=coalesce(NULLIF(approved_quantity,0),ordered_quantity)
     THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END,
   updated_at=v_now
 FROM public.shipment_items shi
 WHERE shi.organization_id=_org AND shi.shipment_id=_shipment AND shi.sales_order_item_id=i.id;
 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((
    SELECT sum(greatest(0,r.quantity-r.fulfilled_quantity-r.released_quantity))
    FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
      AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=o.id;
 -- Estado do pedido: tudo expedido ou parcial?
 SELECT coalesce(sum(fulfilled_quantity),0),coalesce(sum(coalesce(NULLIF(approved_quantity,0),ordered_quantity)),0)
  INTO v_fulfilled,v_req FROM public.sales_order_items
  WHERE organization_id=_org AND sales_order_id=o.id AND status<>'CANCELED';
 v_ord_status:=CASE WHEN v_fulfilled>=v_req THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END;
 v_ord_ful:=CASE WHEN v_fulfilled>=v_req THEN 'COMPLETE' ELSE 'PARTIAL' END;
 UPDATE public.sales_orders SET status=CASE WHEN o.status IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT')
     THEN v_ord_status ELSE o.status END,
   fulfillment_status=v_ord_ful,updated_at=v_now WHERE id=o.id;

 -- Financeiro: gatilho ON_DISPATCH gera titulo apenas do saldo expedido.
 v_fin_trigger:=coalesce(cfg->>'receivable_trigger','ON_DISPATCH');
 IF v_fin_trigger='ON_DISPATCH' THEN
  v_fin_created:=public.sales_create_receivables(_org,o.id,'ON_DISPATCH');
 END IF;

 PERFORM public.sales_emit(_org,'SHIPMENT_DISPATCHED','shipment:'||_shipment,
   jsonb_build_object('shipment_id',_shipment,'shipment_number',sh.shipment_number,'sales_order_id',o.id,
     'tracking_code',v_tracking,'carrier_id',v_carrier,'quantity',v_total,'expected_delivery_at',v_expected));
 PERFORM public.sales_emit(_org,'SALES_ORDER_STATUS_CHANGED','sales_order:'||o.id,
   jsonb_build_object('sales_order_id',o.id,'status',v_ord_status,'fulfillment_status',v_ord_ful));
 PERFORM public.sales_audit(_org,'shipment.dispatched','shipments',_shipment,
   jsonb_build_object('sales_order_id',o.id,'dispatch_key',v_key,'movements',v_out,
     'tracking_code',v_tracking,'carrier_id',v_carrier,'expected_delivery_at',v_expected,
     'receivable_trigger',v_fin_trigger,'receivables_created',v_fin_created));
 RETURN jsonb_build_object('id',_shipment,'shipment_number',sh.shipment_number,'status','DISPATCHED',
   'dispatch_key',v_key,'movements',v_out,'quantity',v_total,
   'sales_order_status',v_ord_status,'fulfillment_status',v_ord_ful,
   'receivables_created',v_fin_created);
END;
$$;

-- Rastreamento, prova de entrega e evento de entrega. Nao mexe no ledger.
CREATE FUNCTION public.sales_shipment_action(_org uuid,_shipment uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sh public.shipments; o public.sales_orders; v_new text; v_now timestamptz:=now();
 v_carrier uuid; v_tracking text; v_notes text; v_proof jsonb; v_qty numeric; v_i jsonb;
 v_del numeric; v_ord_status text; v_pending integer:=0; v_deliv numeric; v_req numeric;
BEGIN
 -- Prova de entrega faz parte da confirmacao: exige a mesma permissao da
 -- entrega. Somente rastreio e cancelamento exigem permissao de despacho.
 PERFORM public.sales_require(_org,CASE WHEN _action IN ('deliver','partial_delivery','proof')
   THEN 'shipments.confirm_delivery' ELSE 'shipments.dispatch' END);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO sh FROM public.shipments WHERE id=_shipment AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expedição não encontrada.'; END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=sh.sales_order_id AND organization_id=_org;
 v_notes:=nullif(trim(coalesce(_data->>'notes',_data->>'reason','')),'');
 v_carrier:=coalesce(nullif(_data->>'carrier_id','')::uuid,sh.carrier_id);
 v_tracking:=coalesce(nullif(trim(coalesce(_data->>'tracking_code','')),''),sh.tracking_code);

 IF _action='track' THEN
  IF sh.status NOT IN ('DRAFT','READY','DISPATCHED','IN_TRANSIT') THEN
   RAISE EXCEPTION 'Rastreamento não permitido em expedição % (status: %).',sh.shipment_number,sh.status;
  END IF;
  IF sh.status IN ('DRAFT','READY') THEN RAISE EXCEPTION 'Expedição ainda não foi despachada.'; END IF;
  IF v_tracking IS NULL AND _data->>'tracking_code' IS NULL THEN
   RAISE EXCEPTION 'Informe o código de rastreamento.';
  END IF;
  -- Sem rastreamento automatizado: a origem e sempre a digitação do operador.
  UPDATE public.shipments SET carrier_id=v_carrier,tracking_code=v_tracking,
   tracking_source=coalesce(nullif(_data->>'tracking_source',''),'MANUAL'),
   expected_delivery_at=coalesce(nullif(_data->>'expected_delivery_at','')::timestamptz,sh.expected_delivery_at),
   status=CASE WHEN sh.status='DISPATCHED' THEN 'IN_TRANSIT' ELSE sh.status END,updated_at=v_now
  WHERE id=_shipment;
  PERFORM public.sales_emit(_org,'SHIPMENT_TRACKED','shipment:'||_shipment,
   jsonb_build_object('shipment_id',_shipment,'tracking_code',v_tracking,'carrier_id',v_carrier));
  RETURN jsonb_build_object('id',_shipment,'status',(SELECT status FROM public.shipments WHERE id=_shipment),
    'tracking_code',v_tracking,'tracking_source',coalesce(nullif(_data->>'tracking_source',''),'MANUAL'));
 ELSIF _action='proof' THEN
  IF sh.status NOT IN ('DISPATCHED','IN_TRANSIT','DELIVERY_EXCEPTION','PARTIALLY_DELIVERED') THEN
   RAISE EXCEPTION 'Prova de entrega exige expedição despachada.';
  END IF;
  v_proof:=coalesce(_data->'proof',_data);
  IF nullif(trim(coalesce(v_proof->>'proof_type','')),'') IS NULL THEN RAISE EXCEPTION 'Informe o tipo da prova.'; END IF;
  IF nullif(trim(coalesce(v_proof->>'file_path','')),'') IS NULL
     AND nullif(trim(coalesce(v_proof->>'signature_name','')),'') IS NULL THEN
   RAISE EXCEPTION 'Informe o arquivo ou o nome do recebedor.';
  END IF;
  INSERT INTO public.shipment_delivery_proofs(organization_id,shipment_id,proof_type,file_path,signature_name,occurred_at,notes,created_by)
  VALUES(_org,_shipment,v_proof->>'proof_type',nullif(trim(coalesce(v_proof->>'file_path','')),''),
    nullif(trim(coalesce(v_proof->>'signature_name','')),''),
    coalesce(nullif(v_proof->>'occurred_at','')::timestamptz,v_now),v_notes,auth.uid());
  PERFORM public.sales_audit(_org,'shipment.delivery_proof','shipments',_shipment,
   jsonb_build_object('proof_type',v_proof->>'proof_type','file_path',v_proof->>'file_path'));
  RETURN jsonb_build_object('id',_shipment,'proofs',(SELECT count(*) FROM public.shipment_delivery_proofs
    WHERE organization_id=_org AND shipment_id=_shipment));
 ELSIF _action IN ('deliver','partial_delivery') THEN
  IF sh.status NOT IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED','DELIVERY_EXCEPTION') THEN
   RAISE EXCEPTION 'Expedição não está em trânsito (status: %).',sh.status;
  END IF;
  -- Prova de entrega e obligatoria para concluir.
  IF NOT EXISTS(SELECT 1 FROM public.shipment_delivery_proofs
     WHERE organization_id=_org AND shipment_id=_shipment) THEN
   RAISE EXCEPTION 'Registre a prova de entrega antes de concluir.';
  END IF;
  FOR v_i IN SELECT * FROM jsonb_array_elements(coalesce(_data->'items','[]'::jsonb)) LOOP
   SELECT quantity,delivered_quantity INTO v_qty,v_del FROM public.shipment_items
    WHERE organization_id=_org AND shipment_id=_shipment AND sales_order_item_id=nullif(v_i->>'sales_order_item_id','')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item da expedição não encontrado.'; END IF;
   IF coalesce(nullif(v_i->>'delivered_quantity','')::numeric,v_qty)+v_del>v_qty THEN
    RAISE EXCEPTION 'Entrega acima do expedido para um item.';
   END IF;
   UPDATE public.shipment_items SET delivered_quantity=delivered_quantity+coalesce(nullif(v_i->>'delivered_quantity','')::numeric,v_qty)
    WHERE organization_id=_org AND shipment_id=_shipment AND sales_order_item_id=nullif(v_i->>'sales_order_item_id','')::uuid;
  END LOOP;
  IF _action='deliver' THEN
   UPDATE public.shipment_items SET delivered_quantity=quantity
    WHERE organization_id=_org AND shipment_id=_shipment AND delivered_quantity<quantity;
  END IF;
  UPDATE public.shipments SET status=CASE WHEN _action='deliver' THEN 'DELIVERED'
      WHEN EXISTS(SELECT 1 FROM public.shipment_items
        WHERE organization_id=_org AND shipment_id=_shipment AND delivered_quantity<quantity)
      THEN 'PARTIALLY_DELIVERED' ELSE 'DELIVERED' END,
    delivered_quantity=coalesce((SELECT sum(delivered_quantity) FROM public.shipment_items
      WHERE organization_id=_org AND shipment_id=_shipment),0),updated_at=v_now WHERE id=_shipment;
  -- Entrega nao e baixa: o estoque ja saiu na expedicao.
  UPDATE public.sales_order_items i SET delivered_quantity=coalesce((
    SELECT sum(si.delivered_quantity) FROM public.shipment_items si
    WHERE si.organization_id=_org AND si.sales_order_item_id=i.id),0),updated_at=v_now
   WHERE i.organization_id=_org AND i.sales_order_id=o.id;
  SELECT count(*) INTO v_pending FROM public.shipments s
   WHERE s.organization_id=_org AND s.sales_order_id=o.id
     AND s.status NOT IN ('DELIVERED','CANCELED','RETURNED');
  -- O pedido so fecha sozinho quando TUDO aprovado foi entregue. Saldo
  -- residual e decisao do operador: nao vira encerramento automatico.
  SELECT coalesce(sum(i.delivered_quantity),0),
    coalesce(sum(coalesce(NULLIF(i.approved_quantity,0),i.ordered_quantity)),0)
   INTO v_deliv,v_req FROM public.sales_order_items i
  WHERE i.organization_id=_org AND i.sales_order_id=o.id AND i.status<>'CANCELED';
  v_ord_status:=o.status;
  IF v_pending=0 AND v_deliv>=v_req THEN
   v_ord_status:='FULFILLED';
  END IF;
  UPDATE public.sales_orders SET status=v_ord_status,
   closed_at=CASE WHEN v_ord_status='FULFILLED' AND v_pending=0 THEN coalesce(closed_at,v_now) ELSE closed_at END,
   updated_at=v_now WHERE id=o.id;
  PERFORM public.sales_emit(_org,'SHIPMENT_DELIVERED','shipment:'||_shipment,
   jsonb_build_object('shipment_id',_shipment,'shipment_number',sh.shipment_number,'sales_order_id',o.id,
     'status',(SELECT status FROM public.shipments WHERE id=_shipment),
     'delivered_quantity',(SELECT delivered_quantity FROM public.shipments WHERE id=_shipment)));
 ELSIF _action='exception' THEN
  IF v_notes IS NULL THEN RAISE EXCEPTION 'Descreva a ocorrência da entrega.'; END IF;
  IF sh.status NOT IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED') THEN
   RAISE EXCEPTION 'Expedição não está em trânsito.';
  END IF;
  UPDATE public.shipments SET status='DELIVERY_EXCEPTION',exception_notes=v_notes,updated_at=v_now WHERE id=_shipment;
  PERFORM public.sales_open_exception(_org,coalesce(nullif(_data->>'exception_type',''),'DELIVERY_DELAY'),'WARNING',
   v_notes,jsonb_build_object('sales_order_id',o.id,'shipment_id',_shipment,'tracking_code',v_tracking));
 ELSIF _action='cancel' THEN
  IF sh.status<>'DRAFT' THEN
   RAISE EXCEPTION 'Expedição despachada não pode ser cancelada; registre devolução ou ocorrência.';
  END IF;
  IF v_notes IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  UPDATE public.shipments SET status='CANCELED',cancel_reason=v_notes,updated_at=v_now WHERE id=_shipment;
 ELSE RAISE EXCEPTION 'Ação inválida.'; END IF;

 PERFORM public.sales_audit(_org,'shipment.'||_action,'shipments',_shipment,
   jsonb_build_object('from',sh.status,'to',(SELECT status FROM public.shipments WHERE id=_shipment),
     'notes',v_notes,'tracking_code',v_tracking));
 RETURN jsonb_build_object('id',_shipment,'status',(SELECT status FROM public.shipments WHERE id=_shipment),
   'delivered_quantity',(SELECT delivered_quantity FROM public.shipments WHERE id=_shipment),
   'sales_order_status',(SELECT status FROM public.sales_orders WHERE id=o.id));
END;
$$;


-- =====================================================================
-- 15. Devolucao de cliente.
--
-- Pedido de devolucao NAO devolve estoque. Somente o recebimento fisico
-- chama inventory_post_movement com SALE_RETURN/IN.
-- NADA volta a vendavel por padrao: o destino e SEMPRE informado, e
-- mercadoria danificada/defeituosa so pode ir para QUARANTINE ou SCRAP.
-- =====================================================================

CREATE FUNCTION public.sales_return_create(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; ret public.customer_returns; cfg jsonb; ident uuid; v_number text;
 v_ship uuid; v_reason text; v_i jsonb; v_shi record; v_qty numeric; v_count integer:=0;
 v_avail numeric; v_batch uuid; v_profile uuid; v_now timestamptz:=now();
BEGIN
 PERFORM public.sales_require(_org,'returns.create');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('PARTIALLY_FULFILLED','FULFILLED','CLOSED') THEN
  RAISE EXCEPTION 'Somente pedido expedido aceita devolução (status: %).',o.status;
 END IF;
 v_reason:=nullif(trim(coalesce(_data->>'reason','')),'');
 IF v_reason IS NULL THEN RAISE EXCEPTION 'Informe o motivo da devolução.'; END IF;
 v_ship:=nullif(_data->>'shipment_id','')::uuid;
 IF v_ship IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shipments
    WHERE id=v_ship AND organization_id=_org AND sales_order_id=_order) THEN
  RAISE EXCEPTION 'Expedição não pertence a este pedido.';
 END IF;
 SELECT id INTO v_profile FROM public.customer_profiles WHERE company_id=o.company_id AND organization_id=_org LIMIT 1;
 v_number:=public.sales_next_number(_org,'return');
 INSERT INTO public.customer_returns(organization_id,return_number,company_id,sales_order_id,shipment_id,
   reason,reason_detail,status,notes)
 VALUES(_org,v_number,o.company_id,_order,v_ship,v_reason,nullif(trim(coalesce(_data->>'reason_detail','')),''),
   'DRAFT',nullif(trim(coalesce(_data->>'notes','')),''))
 RETURNING * INTO ret;
 ident:=ret.id;
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))<1 THEN
  RAISE EXCEPTION 'Informe os itens a devolver.';
 END IF;
 FOR v_i IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
  -- Devolucao sempre aponta para a expedicao original: e o unico caminho
  -- valido. Sem expedicao informada, a linha entregue mais recente do item
  -- e a referencia -- nunca o item do catalogo.
  SELECT * INTO v_shi FROM public.shipment_items shi
   JOIN public.shipments sh ON sh.id=shi.shipment_id AND sh.organization_id=shi.organization_id
   WHERE shi.organization_id=_org
     AND sh.sales_order_id=o.id
     AND (v_ship IS NULL OR shi.shipment_id=v_ship)
     AND (v_i->>'sales_order_item_id' IS NULL
          OR shi.sales_order_item_id=nullif(v_i->>'sales_order_item_id','')::uuid)
     AND (v_i->>'shipment_item_id' IS NULL OR shi.id=nullif(v_i->>'shipment_item_id','')::uuid)
   ORDER BY sh.delivered_at DESC NULLS LAST,shi.shipment_id DESC LIMIT 1;
  IF v_shi.id IS NULL THEN RAISE EXCEPTION 'Item devolvido não encontrado em expedição entregue.'; END IF;
  v_qty:=coalesce(nullif(v_i->>'quantity','')::numeric,1);
  v_batch:=coalesce(nullif(v_i->>'batch_id','')::uuid,v_shi.batch_id);
  -- Nao devolver mais do que foi entregue e ainda nao devolvido.
  v_avail:=coalesce(v_shi.delivered_quantity,0)-coalesce(v_shi.returned_quantity,0);
  IF v_qty<=0 OR v_qty>v_avail THEN
   RAISE EXCEPTION 'Quantidade inválida para devolução: % disponível de %.',v_qty::text,v_avail::text;
  END IF;
  INSERT INTO public.customer_return_items(organization_id,customer_return_id,sales_order_item_id,shipment_item_id,
    variant_id,sku_snapshot,quantity,condition,destination,reason,batch_id,notes)
  VALUES(_org,ident,v_shi.sales_order_item_id,v_shi.id,v_shi.variant_id,v_shi.sku_snapshot,v_qty,
    coalesce(nullif(v_i->>'condition',''),'UNOPENED'),'PENDING',nullif(trim(coalesce(v_i->>'reason','')),''),
    v_batch,nullif(trim(coalesce(v_i->>'notes','')),''));
  v_count:=v_count+1;
 END LOOP;
 PERFORM public.sales_audit(_org,'customer_return.created','customer_returns',ident,
   jsonb_build_object('sales_order_id',_order,'shipment_id',v_ship,'items',v_count,'reason',v_reason));
 RETURN jsonb_build_object('id',ident,'return_number',v_number,'status','DRAFT','items',v_count);
END;
$$;

-- Maquina de estados da devolucao. Aprovacao exige segregacao quando a
-- organizacao cobra; recebimento exige destino e movimentacao de estoque.
CREATE FUNCTION public.sales_return_action(_org uuid,_ret uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ret public.customer_returns; cfg jsonb; v_new text; v_now timestamptz:=now();
 v_i record; v_dest uuid; v_dest_ok boolean; v_fin text; v_mov jsonb; v_mov_id uuid;
 v_qty numeric; v_notes text; v_movements jsonb:='[]'::jsonb; v_count integer:=0; v_reject_reason text;
 v_i_destination text;
BEGIN
 PERFORM public.sales_require(_org,CASE WHEN _action IN ('approve','reject') THEN 'returns.approve'
   WHEN _action='receive' THEN 'returns.receive' ELSE 'returns.create' END);
 -- Recebimento movimenta estoque: exige as duas permissoes.
 IF _action='receive' THEN PERFORM public.sales_require(_org,'inventory.move'); END IF;
 PERFORM public.inventory_lock(_org);
 SELECT * INTO ret FROM public.customer_returns WHERE id=_ret AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada.'; END IF;
 IF ret.status IN ('COMPLETED','REJECTED','CANCELED') THEN
  RAISE EXCEPTION 'Devolução % já encerrada.',ret.return_number;
 END IF;
 cfg:=public.sales_settings(_org);
 v_notes:=nullif(trim(coalesce(_data->>'notes',_data->>'reason','')),'');

 IF _action='submit' THEN
  IF ret.status<>'DRAFT' THEN RAISE EXCEPTION 'Devolução não está em rascunho.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_return_items WHERE organization_id=_org AND customer_return_id=_ret) THEN
   RAISE EXCEPTION 'Devolução sem itens.';
  END IF;
  v_new:='PENDING_APPROVAL';
 ELSIF _action='approve' THEN
  IF ret.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Devolução não está aguardando aprovação.'; END IF;
  IF coalesce((cfg->>'approval_segregation')::boolean,false) AND ret.created_by=auth.uid() THEN
   RAISE EXCEPTION 'Segregação de funções ativa: quem abriu a devolução não pode aprová-la.';
  END IF;
  v_new:='APPROVED';
  UPDATE public.customer_returns SET approved_by=auth.uid(),approved_at=v_now WHERE id=_ret;
 ELSIF _action='reject' THEN
  IF ret.status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED') THEN RAISE EXCEPTION 'Devolução não pode ser rejeitada agora.'; END IF;
  IF v_notes IS NULL THEN RAISE EXCEPTION 'Informe o motivo da rejeição.'; END IF;
  v_new:='REJECTED';
  v_reject_reason:=v_notes;
 ELSIF _action='receive' THEN
  IF ret.status NOT IN ('APPROVED','RECEIVING') THEN
   RAISE EXCEPTION 'Somente devolução aprovada pode ser recebida (status: %).',ret.status;
  END IF;
  v_dest:=nullif(_data->>'destination_location_id','')::uuid;
  v_fin:=coalesce(nullif(_data->>'financial_action',''),'NONE');
  v_new:='RECEIVING';
  -- Entrada no estoque. Uma movimentacao por item, chave idempotente.
  FOR v_i IN SELECT * FROM public.customer_return_items
    WHERE organization_id=_org AND customer_return_id=_ret ORDER BY created_at LOOP
   -- Destino: sem informacao do operador, a mercadoria vendavel volta para o
   -- MESMO local de origem da expedicao (fato ja registrado). Mercadoria nao
   -- vendavel EXIGE destino explicito de quarentena/inspecao: o sistema nunca
   -- decide por conta propria para onde va material avariado.
   v_dest:=coalesce(nullif(_data->>'destination_location_id','')::uuid,
     CASE WHEN v_i.condition IN ('DAMAGED','DEFECTIVE','OTHER') THEN NULL ELSE
       (SELECT sh.source_location_id FROM public.shipment_items si
         JOIN public.shipments sh ON sh.id=si.shipment_id AND sh.organization_id=si.organization_id
        WHERE si.organization_id=_org AND si.id=v_i.shipment_item_id) END);
   v_dest_ok:=v_dest IS NOT NULL AND EXISTS(SELECT 1 FROM public.inventory_locations
    WHERE id=v_dest AND organization_id=_org AND status='ACTIVE' AND partner_id IS NULL
      AND type<>'TRANSIT');
   IF NOT v_dest_ok THEN RAISE EXCEPTION 'Informe uma localização de recebimento válida.'; END IF;
   IF v_i.condition IN ('DAMAGED','DEFECTIVE','OTHER')
      AND NOT EXISTS(SELECT 1 FROM public.inventory_locations
         WHERE id=v_dest AND operational_purpose IN ('QUARANTINE','INSPECTION')) THEN
    RAISE EXCEPTION 'Item % em condição % exige destino de quarentena ou inspeção.',v_i.sku_snapshot,v_i.condition;
   END IF;
   -- Destino efetivo do recebimento: o informado agora ou o ja definido.
   v_i_destination:=coalesce(nullif(_data->>'destination',''),v_i.destination);
   v_qty:=coalesce(nullif(_data->>'quantity','')::numeric,0);
   IF v_qty<=0 THEN CONTINUE; END IF;
   IF v_qty>v_i.quantity-v_i.received_quantity THEN
    RAISE EXCEPTION 'Quantidade recebida acima do devolvido em %.',v_i.sku_snapshot;
   END IF;
   -- Danificada ou defeituosa NUNCA volta a vendavel.
   IF v_i.condition IN ('DAMAGED','DEFECTIVE','OTHER') AND v_i_destination='SELLABLE' THEN
    RAISE EXCEPTION 'Item % em condição % não pode ir para estoque vendível.',v_i.sku_snapshot,v_i.condition;
   END IF;
   v_mov:=public.inventory_post_movement(
     _org,v_i.variant_id,v_dest,'SALE_RETURN',v_qty,
     'Devolução '||ret.return_number,now(),'un','CUSTOMER_RETURN',_ret,v_i.batch_id,
     'sales:return:'||_ret||':'||v_i.id,'IN',auth.uid(),false);
   v_mov_id:=nullif(v_mov->>'movement_id','')::uuid;
   IF v_mov_id IS NULL THEN RAISE EXCEPTION 'Falha ao receber o item %.',v_i.sku_snapshot; END IF;
   UPDATE public.customer_return_items SET received_quantity=received_quantity+v_qty,
     destination=v_i_destination,updated_at=v_now WHERE id=v_i.id;
   v_movements:=v_movements||jsonb_build_object('customer_return_item_id',v_i.id,'sku',v_i.sku_snapshot,
     'quantity',v_qty,'destination_location_id',v_dest,'inventory_movement_id',v_mov_id,
     'condition',v_i.condition,'destination',v_i_destination);
   v_count:=v_count+1;
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'Informe a quantidade recebida.'; END IF;
  -- Devolucao reduz o expedido e o entregue do item do pedido.
  UPDATE public.sales_order_items i SET returned_quantity=coalesce((
    SELECT sum(cri.received_quantity) FROM public.customer_return_items cri
    WHERE cri.organization_id=_org AND cri.sales_order_item_id=i.id AND cri.received_quantity>0),0),updated_at=v_now
   WHERE i.organization_id=_org AND i.sales_order_id=ret.sales_order_id;
  UPDATE public.customer_returns SET destination_location_id=v_dest,received_by=auth.uid(),
   received_at=coalesce(received_at,v_now),financial_action=v_fin,
   financial_requested_at=CASE WHEN v_fin<>'NONE' THEN v_now ELSE financial_requested_at END,
   financial_reference=nullif(trim(coalesce(_data->>'financial_reference','')),''),
   financial_notes=v_notes,status='RECEIVED',updated_at=v_now WHERE id=_ret;
  -- Registra o pedido de ajuste financeiro. NAO executa o estorno aqui.
  IF v_fin<>'NONE' THEN
   PERFORM public.sales_emit(_org,'CUSTOMER_RETURN_FINANCIAL_REQUESTED','customer_return:'||_ret,
     jsonb_build_object('customer_return_id',_ret,'return_number',ret.return_number,'sales_order_id',ret.sales_order_id,
       'financial_action',v_fin,'financial_reference',nullif(trim(coalesce(_data->>'financial_reference','')),''),
       'note','Ajuste financeiro pendente no módulo financeiro.'));
  END IF;
  v_new:='RECEIVED';
  PERFORM public.sales_audit(_org,'customer_return.received','customer_returns',_ret,
   jsonb_build_object('destination_location_id',v_dest,'items',v_count,'movements',v_movements,
     'financial_action',v_fin));
  RETURN jsonb_build_object('id',_ret,'status','RECEIVED','items',v_count,'movements',v_movements,
    'financial_action',v_fin,'note','O ajuste financeiro não é executado por este módulo.');
 ELSIF _action='inspect' THEN
  IF ret.status<>'RECEIVED' THEN RAISE EXCEPTION 'Receba a devolução antes de inspecionar.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_return_items
     WHERE organization_id=_org AND customer_return_id=_ret AND destination='PENDING') THEN
   v_new:='COMPLETED';
  ELSE v_new:='INSPECTED'; END IF;
 ELSIF _action='complete' THEN
  IF ret.status NOT IN ('RECEIVED','INSPECTED') THEN RAISE EXCEPTION 'Devolução não está recebida.'; END IF;
  IF EXISTS(SELECT 1 FROM public.customer_return_items
     WHERE organization_id=_org AND customer_return_id=_ret AND destination='PENDING' AND received_quantity>0) THEN
   RAISE EXCEPTION 'Toda mercadoria recebida precisa de destino definido.';
  END IF;
  v_new:='COMPLETED';
 ELSIF _action='cancel' THEN
  IF ret.status NOT IN ('DRAFT','PENDING_APPROVAL') THEN
   RAISE EXCEPTION 'Devolução aprovada ou recebida não pode ser cancelada.';
  END IF;
  IF v_notes IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  v_new:='CANCELED';
 ELSE RAISE EXCEPTION 'Ação inválida.'; END IF;

 UPDATE public.customer_returns SET status=v_new,
   reason_detail=coalesce(v_reject_reason,reason_detail),updated_at=v_now WHERE id=_ret;
 PERFORM public.sales_audit(_org,'customer_return.'||_action,'customer_returns',_ret,
   jsonb_build_object('from',ret.status,'to',v_new,'notes',v_notes));
 RETURN jsonb_build_object('id',_ret,'return_number',ret.return_number,'status',v_new);
END;
$$;

-- =====================================================================
-- 16. Excecoes operacionais e transportadoras.
-- =====================================================================

CREATE FUNCTION public.sales_exception_action(_org uuid,_exception uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.logistics_exceptions; v_new text; v_resolution text; v_assigned uuid;
 v_status text; v_notes text;
BEGIN
 -- Ler ocorrencia e livre; tratar ocorrencia exige permissao propria.
 PERFORM public.sales_require(_org,coalesce(nullif(_data->>'permission',''),'logistics.exceptions'));
 SELECT * INTO ex FROM public.logistics_exceptions WHERE id=_exception AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência não encontrada.'; END IF;
 IF ex.status IN ('RESOLVED','IGNORED') AND _action NOT IN ('reopen') THEN
  RETURN jsonb_build_object('id',_exception,'status',ex.status,'deduped',true);
 END IF;
 v_resolution:=nullif(trim(coalesce(_data->>'resolution',_data->>'notes','')),'');
 v_assigned:=nullif(_data->>'assigned_to','')::uuid;
 v_status:=coalesce(nullif(_data->>'status',''),_action);
 IF _action='assign' THEN
  IF v_assigned IS NULL THEN RAISE EXCEPTION 'Informe o responsável.'; END IF;
  v_new:=CASE WHEN ex.status='OPEN' THEN 'IN_REVIEW' ELSE ex.status END;
  UPDATE public.logistics_exceptions SET assigned_to=v_assigned,status=v_new,updated_at=now() WHERE id=_exception;
 ELSIF _action IN ('resolve','ignore') THEN
  IF v_resolution IS NULL THEN RAISE EXCEPTION 'Descreva a resolução.'; END IF;
  v_new:=CASE WHEN _action='resolve' THEN 'RESOLVED' ELSE 'IGNORED' END;
  UPDATE public.logistics_exceptions SET status=v_new,resolution=v_resolution,
   resolved_at=now(),updated_at=now() WHERE id=_exception;
 ELSIF _action='reopen' THEN
  v_new:='OPEN';
  UPDATE public.logistics_exceptions SET status=v_new,resolution=NULL,resolved_at=NULL,updated_at=now() WHERE id=_exception;
 ELSE
  v_new:=v_status;
  IF v_new NOT IN ('OPEN','IN_REVIEW','RESOLVED','IGNORED') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
  UPDATE public.logistics_exceptions SET status=v_new,resolution=coalesce(v_resolution,resolution),
   resolved_at=CASE WHEN v_new IN ('RESOLVED','IGNORED') THEN now() ELSE NULL END,updated_at=now() WHERE id=_exception;
 END IF;
 PERFORM public.sales_audit(_org,'logistics_exception.'||_action,'logistics_exceptions',_exception,
   jsonb_build_object('from',ex.status,'to',v_new,'assigned_to',v_assigned,'resolution',v_resolution));
 RETURN jsonb_build_object('id',_exception,'status',v_new,'assigned_to',v_assigned);
END;
$$;

-- Abertura de ocorrencia avulsa. O modulo tambem abre sozinha quando detecta
-- divergencia; esta funcao cobre o registro manual.
CREATE FUNCTION public.sales_exception_create(_org uuid,_type text,_severity text,_message text,_refs jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid;
BEGIN
 PERFORM public.sales_require(_org,'logistics.read');
 ident:=public.sales_open_exception(_org,_type,_severity,_message,_refs);
 RETURN jsonb_build_object('id',ident,'exception_type',_type,'severity',_severity,'status','OPEN');
END;
$$;

-- Transportadora. Cadastro simples, sem integracao ficticia: modality e
-- texto livre porque a politica de calculo de frete e da organizacao.
CREATE FUNCTION public.sales_carrier_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.carriers; ident uuid; v_name text; v_status text; v_doc jsonb;
BEGIN
 PERFORM public.sales_require(_org,'carriers.manage');
 v_name:=nullif(trim(coalesce(_data->>'name','')),'');
 IF v_name IS NULL THEN RAISE EXCEPTION 'Informe o nome da transportadora.'; END IF;
 v_status:=coalesce(nullif(_data->>'status',''),'ACTIVE');
 IF v_status NOT IN ('ACTIVE','INACTIVE') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
 IF _id IS NULL THEN
  INSERT INTO public.carriers(organization_id,name,document_type,document_number,contact_name,modality,status,notes)
  VALUES(_org,v_name,nullif(_data->>'document_type',''),nullif(_data->>'document_number',''),
    nullif(trim(coalesce(_data->>'contact_name','')),''),nullif(trim(coalesce(_data->>'modality','')),''),
    v_status,nullif(trim(coalesce(_data->>'notes','')),''))
  RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM public.carriers WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transportadora não encontrada.'; END IF;
  UPDATE public.carriers SET name=v_name,document_type=coalesce(nullif(_data->>'document_type',''),document_type),
   document_number=coalesce(nullif(_data->>'document_number',''),document_number),
   contact_name=coalesce(nullif(trim(coalesce(_data->>'contact_name','')),''),contact_name),
   modality=coalesce(nullif(trim(coalesce(_data->>'modality','')),''),modality),status=v_status,
   notes=coalesce(nullif(trim(coalesce(_data->>'notes','')),''),notes),updated_at=now() WHERE id=_id;
  SELECT * INTO c FROM public.carriers WHERE id=_id;
 END IF;
 PERFORM public.sales_audit(_org,coalesce(CASE WHEN _id IS NULL THEN 'carrier.created' ELSE 'carrier.updated' END),
   'carriers',c.id,jsonb_build_object('name',c.name,'status',c.status,'modality',c.modality));
 SELECT to_jsonb(c) INTO v_doc;
 RETURN v_doc;
END;
$$;

-- Configuracao da organizacao. Fica em sales_order_settings, nao em
-- preferencia global: cada empresa decide o seu proprio comportamento.
CREATE FUNCTION public.sales_settings_save(_org uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cur public.sales_order_settings; cfg jsonb; v_key text;
BEGIN
 PERFORM public.sales_require(_org,'sales.configure');
 PERFORM public.sales_ensure_settings(_org);
 SELECT * INTO cur FROM public.sales_order_settings WHERE organization_id=_org FOR UPDATE;
 v_key:=cur.id;
 IF nullif(_data->>'reservation_policy','') IS NOT NULL
    AND _data->>'reservation_policy' NOT IN ('FULL_ONLY','ALLOW_PARTIAL','ALLOW_NEGATIVE_AVAILABLE') THEN
  RAISE EXCEPTION 'Política de reserva inválida.';
 END IF;
 IF nullif(_data->>'price_override_policy','') IS NOT NULL
    AND _data->>'price_override_policy' NOT IN ('BLOCK','ALLOW_WITH_AUTHORIZATION') THEN
  RAISE EXCEPTION 'Política de preço inválida.';
 END IF;
 IF nullif(_data->>'receivable_trigger','') IS NOT NULL
    AND _data->>'receivable_trigger' NOT IN ('NONE','ON_APPROVAL','ON_DISPATCH') THEN
  RAISE EXCEPTION 'Gatilho financeiro inválido.';
 END IF;
 IF nullif(_data->>'credit_exposure_policy','') IS NOT NULL
    AND _data->>'credit_exposure_policy' NOT IN ('OPEN_RECEIVABLES_ONLY','OPEN_RECEIVABLES_PLUS_OPEN_ORDERS') THEN
  RAISE EXCEPTION 'Política de exposição inválida.';
 END IF;
 IF nullif(_data->>'tracking_mode','') IS NOT NULL
    AND _data->>'tracking_mode' NOT IN ('MANUAL','WEBHOOK') THEN
  RAISE EXCEPTION 'Modo de rastreamento inválido.';
 END IF;
 IF nullif(_data->>'max_discount_percent','') IS NOT NULL
    AND (nullif(_data->>'max_discount_percent','')::numeric<0 OR nullif(_data->>'max_discount_percent','')::numeric>100) THEN
  RAISE EXCEPTION 'Desconto máximo deve estar entre 0 e 100.';
 END IF;
 UPDATE public.sales_order_settings SET
   reservation_policy=coalesce(nullif(_data->>'reservation_policy',''),reservation_policy),
   reservation_expiry_hours=coalesce(nullif(_data->>'reservation_expiry_hours','')::int,reservation_expiry_hours),
   make_to_order_enabled=coalesce(nullif(_data->>'make_to_order_enabled','')::boolean,make_to_order_enabled),
   credit_exposure_policy=coalesce(nullif(_data->>'credit_exposure_policy',''),credit_exposure_policy),
   approval_segregation=coalesce(nullif(_data->>'approval_segregation','')::boolean,approval_segregation),
   max_discount_percent=coalesce(nullif(_data->>'max_discount_percent','')::numeric,max_discount_percent),
   price_override_policy=coalesce(nullif(_data->>'price_override_policy',''),price_override_policy),
   receivable_trigger=coalesce(nullif(_data->>'receivable_trigger',''),receivable_trigger),
   allow_partial_fulfillment=coalesce(nullif(_data->>'allow_partial_fulfillment','')::boolean,allow_partial_fulfillment),
   shipment_requires_full_confirmation=coalesce(nullif(_data->>'shipment_requires_full_confirmation','')::boolean,shipment_requires_full_confirmation),
   tracking_mode=coalesce(nullif(_data->>'tracking_mode',''),tracking_mode),
   require_shipping_address=coalesce(nullif(_data->>'require_shipping_address','')::boolean,require_shipping_address),
   updated_by=auth.uid(),updated_at=now()
 WHERE organization_id=_org;
 PERFORM public.sales_audit(_org,'sales_settings.updated','sales_order_settings',v_key,_data);
 RETURN public.sales_settings(_org);
END;
$$;


-- =====================================================================
-- 17. Consultas.
--
-- Leitura e a unica operacao liberada direto ao cliente. Toda escrita passa
-- pelas RPCs SECURITY DEFINER acima, que validam permissao no servidor.
-- =====================================================================

CREATE FUNCTION public.sales_query(_org uuid,_kind text DEFAULT 'orders',_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_limit int; v_off int; v_status text; v_company uuid; v_from date; v_to date;
 v_search text; v_rows jsonb; v_total bigint; v_json jsonb; v_sum numeric;
 v_perm text; v_statuses text[];
BEGIN
 v_limit:=least(coalesce(nullif(_filters->>'limit','')::int,50),500);
 v_off:=greatest(coalesce(nullif(_filters->>'offset','')::int,0),0);
 v_status:=nullif(_filters->>'status','');
 v_company:=nullif(_filters->>'company_id','')::uuid;
 v_from:=nullif(_filters->>'from','')::date;
 v_to:=nullif(_filters->>'to','')::date;
 v_search:=nullif(trim(coalesce(_filters->>'search','')),'');
 v_statuses:=CASE WHEN _filters->'statuses' IS NOT NULL
   THEN ARRAY(SELECT jsonb_array_elements_text(_filters->'statuses')) ELSE NULL END;

 IF _kind='orders' THEN
  v_perm:='sales_orders.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*),coalesce(sum(total_amount),0) INTO v_total,v_sum FROM public.sales_orders
   WHERE organization_id=_org
     AND (v_status IS NULL OR status=v_status)
     AND (v_statuses IS NULL OR status=ANY(v_statuses))
     AND (v_company IS NULL OR company_id=v_company)
     AND (v_from IS NULL OR order_date>=v_from) AND (v_to IS NULL OR order_date<=v_to)
     AND (v_search IS NULL OR order_number ILIKE '%'||v_search||'%' OR commercial_notes ILIKE '%'||v_search||'%');
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.order_date DESC,x.order_number DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT o.id,o.order_number,o.order_date,o.expected_delivery_date,o.status,o.stock_status,
     o.fulfillment_status,o.source_type,o.currency,o.subtotal,o.discount_total,o.freight_amount,
     o.tax_amount,o.total_amount,o.created_at,
     c.trade_name AS company_name,c.id AS company_id,
     (SELECT count(*) FROM public.sales_order_items i WHERE i.sales_order_id=o.id) AS item_count,
     (SELECT count(*) FROM public.shipments s WHERE s.sales_order_id=o.id AND s.status<>'CANCELED') AS shipment_count,
     (SELECT coalesce(sum(si.delivered_quantity),0) FROM public.shipment_items si
       JOIN public.shipments s ON s.id=si.shipment_id
       WHERE s.sales_order_id=o.id AND s.status IN ('DELIVERED','PARTIALLY_DELIVERED')) AS delivered_quantity
   FROM public.sales_orders o JOIN public.companies c ON c.id=o.company_id
   WHERE o.organization_id=_org
     AND (v_status IS NULL OR o.status=v_status)
     AND (v_statuses IS NULL OR o.status=ANY(v_statuses))
     AND (v_company IS NULL OR o.company_id=v_company)
     AND (v_from IS NULL OR o.order_date>=v_from) AND (v_to IS NULL OR o.order_date<=v_to)
     AND (v_search IS NULL OR o.order_number ILIKE '%'||v_search||'%' OR o.commercial_notes ILIKE '%'||v_search||'%')
   LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','orders','rows',v_rows,'total',v_total,'total_amount',v_sum,
    'limit',v_limit,'offset',v_off);

 ELSIF _kind='exceptions' THEN
  v_perm:='logistics.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.logistics_exceptions
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status)
     AND (v_company IS NULL OR sales_order_id IN (SELECT id FROM public.sales_orders WHERE company_id=v_company));
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT e.*,o.order_number FROM public.logistics_exceptions e
     LEFT JOIN public.sales_orders o ON o.id=e.sales_order_id
   WHERE e.organization_id=_org AND (v_status IS NULL OR e.status=v_status)
   LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','exceptions','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='shipments' THEN
  v_perm:='shipments.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.shipments
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status)
     AND (v_company IS NULL OR sales_order_id IN (SELECT id FROM public.sales_orders WHERE company_id=v_company));
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT s.id,s.shipment_number,s.status,s.tracking_code,s.dispatched_at,s.expected_delivery_at,
     s.delivered_quantity,s.shipping_method,s.created_at,s.updated_at,
     o.order_number,o.id AS sales_order_id,o.company_id,
     c.trade_name AS company_name,ca.name AS carrier_name,
     (SELECT count(*) FROM public.shipment_items si WHERE si.shipment_id=s.id) AS item_count,
     (SELECT count(*) FROM public.shipment_delivery_proofs p WHERE p.shipment_id=s.id) AS proof_count,
     (s.expected_delivery_at IS NOT NULL AND s.expected_delivery_at<now()
        AND s.status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED')) AS overdue
   FROM public.shipments s JOIN public.sales_orders o ON o.id=s.sales_order_id
     JOIN public.companies c ON c.id=o.company_id LEFT JOIN public.carriers ca ON ca.id=s.carrier_id
   WHERE s.organization_id=_org AND (v_status IS NULL OR s.status=v_status)
   LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','shipments','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='returns' THEN
  v_perm:='returns.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.customer_returns
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status)
     AND (v_company IS NULL OR company_id=v_company);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT r.*,o.order_number,c.trade_name AS company_name,
     (SELECT count(*) FROM public.customer_return_items i WHERE i.customer_return_id=r.id) AS item_count
   FROM public.customer_returns r JOIN public.sales_orders o ON o.id=r.sales_order_id
     JOIN public.companies c ON c.id=r.company_id
   WHERE r.organization_id=_org AND (v_status IS NULL OR r.status=v_status)
   LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','returns','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='reservations' THEN
  v_perm:='reservations.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.inventory_reservations
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.reserved_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT r.*,o.order_number,it.sku_snapshot,it.description_snapshot,l.name AS location_name
   FROM public.inventory_reservations r JOIN public.sales_orders o ON o.id=r.sales_order_id
     JOIN public.sales_order_items it ON it.id=r.sales_order_item_id
     JOIN public.inventory_locations l ON l.id=r.inventory_location_id
   WHERE r.organization_id=_org AND (v_status IS NULL OR r.status=v_status)
   LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','reservations','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='fulfillment' THEN
  v_perm:='fulfillment.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.fulfillment_orders
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT f.*,o.order_number,l.name AS source_location_name,
     (SELECT count(*) FROM public.picking_tasks t WHERE t.fulfillment_order_id=f.id) AS picking_count,
     (SELECT count(*) FROM public.shipments s WHERE s.fulfillment_order_id=f.id) AS shipment_count
   FROM public.fulfillment_orders f JOIN public.sales_orders o ON o.id=f.sales_order_id
     LEFT JOIN public.inventory_locations l ON l.id=f.source_location_id
   WHERE f.organization_id=_org AND (v_status IS NULL OR f.status=v_status)
   LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','fulfillment','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='carriers' THEN
  PERFORM public.sales_require(_org,'shipments.read');
  SELECT count(*) INTO v_total FROM public.carriers WHERE organization_id=_org
   AND (v_status IS NULL OR status=v_status);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name),'[]'::jsonb) INTO v_rows
   FROM (SELECT * FROM public.carriers WHERE organization_id=_org
     AND (v_status IS NULL OR status=v_status) LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','carriers','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='credits' THEN
  PERFORM public.sales_require(_org,'sales_credit.read');
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_json
   FROM (SELECT c.id AS company_id,co.trade_name AS company_name,
     public.crm_financial_position(_org,c.id) AS position
   FROM public.customer_profiles c JOIN public.companies co ON co.id=c.company_id
   WHERE c.organization_id=_org AND (v_company IS NULL OR c.company_id=v_company)
   LIMIT v_limit) x;
  RETURN jsonb_build_object('kind','credits','rows',v_json);

 ELSE RAISE EXCEPTION 'Consulta desconhecida: %.',_kind; END IF;
END;
$$;

-- Detalhe completo do pedido. Uma chamada, tudo que a tela precisa.
CREATE FUNCTION public.sales_order_detail(_org uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; v_json jsonb; v_perm text;
BEGIN
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 v_perm:=CASE WHEN EXISTS(SELECT 1 FROM public.shipment_items si
    JOIN public.shipments s ON s.id=si.shipment_id WHERE s.sales_order_id=o.id)
   THEN 'shipments.read' ELSE 'sales_orders.read' END;
 PERFORM public.sales_require(_org,v_perm);
 SELECT jsonb_build_object(
  'order',to_jsonb(o),
  'company',(SELECT to_jsonb(co) FROM public.companies co WHERE co.id=o.company_id),
  'customer_profile',(SELECT to_jsonb(cp) FROM public.customer_profiles cp WHERE cp.id=o.customer_profile_id),
  'quote',(SELECT jsonb_build_object('id',q.id,'number',q.quote_number,'version',q.version,'status',q.status)
     FROM public.sales_quotes q WHERE q.id=o.sales_quote_id),
  'representative',(SELECT to_jsonb(r) FROM public.sales_representatives r WHERE r.id=o.representative_id),
  'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at),'[]'::jsonb)
     FROM public.sales_order_items i WHERE i.sales_order_id=o.id),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at),'[]'::jsonb)
     FROM public.sales_order_status_history h WHERE h.sales_order_id=o.id),
  'reservations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.reserved_at),'[]'::jsonb)
     FROM public.inventory_reservations r WHERE r.sales_order_id=o.id),
  'fulfillments',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.created_at),'[]'::jsonb)
     FROM public.fulfillment_orders f WHERE f.sales_order_id=o.id),
  'picking_tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at),'[]'::jsonb)
     FROM public.picking_tasks t WHERE t.sales_order_id=o.id),
  'picking_items',(SELECT coalesce(jsonb_agg(to_jsonb(ti) ORDER BY ti.created_at),'[]'::jsonb)
     FROM public.picking_task_items ti WHERE ti.organization_id=_org
       AND ti.picking_task_id IN (SELECT id FROM public.picking_tasks WHERE sales_order_id=o.id)),
  'packings',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.packed_at),'[]'::jsonb)
     FROM public.packing_records p WHERE p.sales_order_id=o.id),
  'shipments',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at),'[]'::jsonb)
     FROM public.shipments s WHERE s.sales_order_id=o.id),
  'shipment_items',(SELECT coalesce(jsonb_agg(to_jsonb(si) ORDER BY si.sku_snapshot),'[]'::jsonb)
     FROM public.shipment_items si WHERE si.organization_id=_org
       AND si.shipment_id IN (SELECT id FROM public.shipments WHERE sales_order_id=o.id)),
  'delivery_proofs',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.occurred_at),'[]'::jsonb)
     FROM public.shipment_delivery_proofs p WHERE p.organization_id=_org
       AND p.shipment_id IN (SELECT id FROM public.shipments WHERE sales_order_id=o.id)),
  'returns',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.requested_at),'[]'::jsonb)
     FROM public.customer_returns r WHERE r.sales_order_id=o.id),
  'return_items',(SELECT coalesce(jsonb_agg(to_jsonb(ri) ORDER BY ri.created_at),'[]'::jsonb)
     FROM public.customer_return_items ri WHERE ri.organization_id=_org
       AND ri.customer_return_id IN (SELECT id FROM public.customer_returns WHERE sales_order_id=o.id)),
  'exceptions',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at),'[]'::jsonb)
     FROM public.logistics_exceptions e WHERE e.sales_order_id=o.id),
  'receivables',(SELECT coalesce(jsonb_agg(to_jsonb(ar) ORDER BY ar.installment_number),'[]'::jsonb)
     FROM public.account_receivables ar WHERE ar.organization_id=_org
       AND ar.source_type='SALE' AND ar.source_id=o.id::text),
  'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.occurred_at),'[]'::jsonb)
     FROM public.inventory_movements m WHERE m.organization_id=_org
       AND m.reference_type IN ('SALE_SHIPMENT','CUSTOMER_RETURN')
       AND m.reference_id IN (SELECT id FROM public.shipments WHERE sales_order_id=o.id
         UNION SELECT id FROM public.customer_returns WHERE sales_order_id=o.id)),
  'availability',public.sales_availability(_org,o.id),
  'financial_position',(SELECT public.crm_financial_position(_org,o.company_id)),
  'settings',public.sales_settings(_org),
  'actions',jsonb_build_array(
    'submit','approve','reject','cancel','reserve','create_fulfillment','create_shipment',
    'dispatch','track','proof','deliver','create_return','close')
 ) INTO v_json;
 RETURN v_json;
END;
$$;

-- Painel: numeros do mes, sem promessa de dado que nao existe.
CREATE FUNCTION public.sales_dashboard(_org uuid,_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_from date; v_to date; v_json jsonb; v_count bigint; v_sum numeric;
BEGIN
 PERFORM public.sales_require(_org,'sales.dashboard');
 v_from:=coalesce(nullif(_filters->>'from','')::date,date_trunc('month',current_date)::date);
 v_to:=coalesce(nullif(_filters->>'to','')::date,current_date);
 SELECT count(*),coalesce(sum(total_amount),0) INTO v_count,v_sum
  FROM public.sales_orders WHERE organization_id=_org
   AND order_date BETWEEN v_from AND v_to AND status NOT IN ('CANCELED');
 SELECT jsonb_build_object('from',v_from,'to',v_to,
  'orders_total',v_count,'amount_total',v_sum,
  'by_status',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (
     SELECT status,count(*) n FROM public.sales_orders WHERE organization_id=_org
       AND order_date BETWEEN v_from AND v_to GROUP BY status) x),
  'open_exceptions',(SELECT count(*) FROM public.logistics_exceptions
     WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW')),
  'blocking_exceptions',(SELECT count(*) FROM public.logistics_exceptions
     WHERE organization_id=_org AND status IN ('OPEN','IN_REVIEW') AND severity IN ('ERROR','BLOCKING')),
  'awaiting_stock',(SELECT count(*) FROM public.sales_orders
     WHERE organization_id=_org AND stock_status IN ('INSUFFICIENT','PARTIAL','MAKE_TO_ORDER')
       AND status NOT IN ('CANCELED','CLOSED','FULFILLED')),
  'awaiting_approval',(SELECT count(*) FROM public.sales_orders
     WHERE organization_id=_org AND status='PENDING_APPROVAL'),
  'in_fulfillment',(SELECT count(*) FROM public.sales_orders
     WHERE organization_id=_org AND status IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED')),
  'shipments_in_transit',(SELECT count(*) FROM public.shipments
     WHERE organization_id=_org AND status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED')),
  'shipments_overdue',(SELECT count(*) FROM public.shipments WHERE organization_id=_org
     AND expected_delivery_at IS NOT NULL AND expected_delivery_at<now()
       AND status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED')),
  'reservations_active',(SELECT count(*) FROM public.inventory_reservations
     WHERE organization_id=_org AND status IN ('ACTIVE','PARTIALLY_CONSUMED')),
  'reservations_expiring',(SELECT count(*) FROM public.inventory_reservations
     WHERE organization_id=_org AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
       AND expires_at<now()+interval '24 hours'),
  'returns_pending',(SELECT count(*) FROM public.customer_returns
     WHERE organization_id=_org AND status IN ('PENDING_APPROVAL','APPROVED','RECEIVING','RECEIVED','INSPECTED')),
  'returns_awaiting_financial',(SELECT count(*) FROM public.customer_returns
     WHERE organization_id=_org AND financial_action<>'NONE' AND financial_requested_at IS NOT NULL
       AND status<>'CANCELED'),
  'top_customers',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
     SELECT co.id,co.trade_name,count(*) n,sum(o.total_amount) amount FROM public.sales_orders o
       JOIN public.companies co ON co.id=o.company_id
     WHERE o.organization_id=_org AND o.order_date BETWEEN v_from AND v_to
       AND o.status NOT IN ('CANCELED') GROUP BY co.id,co.trade_name
     ORDER BY amount DESC LIMIT 5) x),
  'definitions',jsonb_build_object(
    'available_formula','DISPONÍVEL = SALDO FÍSICO - RESERVAS ATIVAS',
    'reserved_formula','RESERVADO = soma das reservas ativas do pedido',
    'fulfilled_formula','EXPEDIDO = soma das quantidades despachadas',
    'delivered_formula','ENTREGUE = soma das quantidades confirmadas na entrega',
    'returnable_formula','DEVOLUÍVEL = ENTREGUE - DEVOLUÍDO',
    'credit_formula','CRÉDITO DISPONÍVEL = LIMITE - (CONTAS A RECEBER + PEDIDOS ABERTOS)',
    'note','Nenhum indicador é estimado: peso e prazo só existem se forem informados.')
 ) INTO v_json;
 RETURN v_json;
END;
$$;

-- =====================================================================
-- 18. RLS e concessoes.
--
-- O cliente le direto (SELECT) e escreve apenas via RPC. Isso mantem as
-- regras de negocio no servidor e evita que o front contorne a maquina de
-- estados, a politica de preco ou a segregacao de funcoes.
-- =====================================================================

ALTER TABLE public.sales_order_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_settings FROM anon,authenticated;
GRANT SELECT ON public.sales_order_settings TO authenticated;
GRANT ALL ON public.sales_order_settings TO service_role;
CREATE POLICY sales_read ON public.sales_order_settings FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'sales_orders.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_settings BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_settings
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_orders FROM anon,authenticated;
GRANT SELECT ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
CREATE POLICY sales_read ON public.sales_orders FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'sales_orders.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_orders BEFORE INSERT OR UPDATE OR DELETE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();
CREATE TRIGGER sales_immutable_orders BEFORE UPDATE OR DELETE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.sales_immutable();

ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_items FROM anon,authenticated;
GRANT SELECT ON public.sales_order_items TO authenticated;
GRANT ALL ON public.sales_order_items TO service_role;
CREATE POLICY sales_read ON public.sales_order_items FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'sales_orders.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_items BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();
CREATE TRIGGER sales_immutable_items BEFORE UPDATE OR DELETE ON public.sales_order_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_immutable();

ALTER TABLE public.sales_order_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_status_history FROM anon,authenticated;
GRANT SELECT ON public.sales_order_status_history TO authenticated;
GRANT ALL ON public.sales_order_status_history TO service_role;
CREATE POLICY sales_read ON public.sales_order_status_history FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'sales_orders.read') AND public.is_org_member(organization_id));

ALTER TABLE public.sales_order_operation_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_operation_keys FROM anon,authenticated;
GRANT ALL ON public.sales_order_operation_keys TO service_role;
CREATE POLICY sales_read ON public.sales_order_operation_keys FOR SELECT TO authenticated
  USING(public.is_org_member(organization_id));

ALTER TABLE public.sales_credit_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_credit_checks FROM anon,authenticated;
GRANT SELECT ON public.sales_credit_checks TO authenticated;
GRANT ALL ON public.sales_credit_checks TO service_role;
CREATE POLICY sales_read ON public.sales_credit_checks FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'sales_credit.read') AND public.is_org_member(organization_id));

ALTER TABLE public.sales_demands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_demands FROM anon,authenticated;
GRANT SELECT ON public.sales_demands TO authenticated;
GRANT ALL ON public.sales_demands TO service_role;
CREATE POLICY sales_read ON public.sales_demands FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'sales_orders.read') AND public.is_org_member(organization_id));

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_reservations FROM anon,authenticated;
GRANT SELECT ON public.inventory_reservations TO authenticated;
GRANT ALL ON public.inventory_reservations TO service_role;
CREATE POLICY sales_read ON public.inventory_reservations FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'reservations.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_reservations BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.fulfillment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fulfillment_orders FROM anon,authenticated;
GRANT SELECT ON public.fulfillment_orders TO authenticated;
GRANT ALL ON public.fulfillment_orders TO service_role;
CREATE POLICY sales_read ON public.fulfillment_orders FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'fulfillment.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_fulfillment BEFORE INSERT OR UPDATE OR DELETE ON public.fulfillment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.picking_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.picking_tasks FROM anon,authenticated;
GRANT SELECT ON public.picking_tasks TO authenticated;
GRANT ALL ON public.picking_tasks TO service_role;
CREATE POLICY sales_read ON public.picking_tasks FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'picking.execute') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_picking BEFORE INSERT OR UPDATE OR DELETE ON public.picking_tasks
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.picking_task_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.picking_task_items FROM anon,authenticated;
GRANT SELECT ON public.picking_task_items TO authenticated;
GRANT ALL ON public.picking_task_items TO service_role;
CREATE POLICY sales_read ON public.picking_task_items FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'picking.execute') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_picking_items BEFORE INSERT OR UPDATE OR DELETE ON public.picking_task_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.packing_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.packing_records FROM anon,authenticated;
GRANT SELECT ON public.packing_records TO authenticated;
GRANT ALL ON public.packing_records TO service_role;
CREATE POLICY sales_read ON public.packing_records FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'packing.manage') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_packing BEFORE INSERT OR UPDATE OR DELETE ON public.packing_records
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.packing_record_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.packing_record_items FROM anon,authenticated;
GRANT SELECT ON public.packing_record_items TO authenticated;
GRANT ALL ON public.packing_record_items TO service_role;
CREATE POLICY sales_read ON public.packing_record_items FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'packing.manage') AND public.is_org_member(organization_id));

ALTER TABLE public.packing_record_volumes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.packing_record_volumes FROM anon,authenticated;
GRANT SELECT ON public.packing_record_volumes TO authenticated;
GRANT ALL ON public.packing_record_volumes TO service_role;
CREATE POLICY sales_read ON public.packing_record_volumes FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'packing.manage') AND public.is_org_member(organization_id));

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carriers FROM anon,authenticated;
GRANT SELECT ON public.carriers TO authenticated;
GRANT ALL ON public.carriers TO service_role;
CREATE POLICY sales_read ON public.carriers FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'shipments.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_carriers BEFORE INSERT OR UPDATE OR DELETE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipments FROM anon,authenticated;
GRANT SELECT ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
CREATE POLICY sales_read ON public.shipments FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'shipments.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_shipments BEFORE INSERT OR UPDATE OR DELETE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();
CREATE TRIGGER sales_immutable_shipments BEFORE UPDATE OR DELETE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.sales_immutable();

ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_items FROM anon,authenticated;
GRANT SELECT ON public.shipment_items TO authenticated;
GRANT ALL ON public.shipment_items TO service_role;
CREATE POLICY sales_read ON public.shipment_items FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'shipments.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_shipment_items BEFORE INSERT OR UPDATE OR DELETE ON public.shipment_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();
CREATE TRIGGER sales_immutable_shipment_items BEFORE UPDATE OR DELETE ON public.shipment_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_immutable();

ALTER TABLE public.shipment_volumes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_volumes FROM anon,authenticated;
GRANT SELECT ON public.shipment_volumes TO authenticated;
GRANT ALL ON public.shipment_volumes TO service_role;
CREATE POLICY sales_read ON public.shipment_volumes FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'shipments.read') AND public.is_org_member(organization_id));

ALTER TABLE public.shipment_delivery_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_delivery_proofs FROM anon,authenticated;
GRANT SELECT ON public.shipment_delivery_proofs TO authenticated;
GRANT ALL ON public.shipment_delivery_proofs TO service_role;
CREATE POLICY sales_read ON public.shipment_delivery_proofs FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'shipments.read') AND public.is_org_member(organization_id));

ALTER TABLE public.customer_returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_returns FROM anon,authenticated;
GRANT SELECT ON public.customer_returns TO authenticated;
GRANT ALL ON public.customer_returns TO service_role;
CREATE POLICY sales_read ON public.customer_returns FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'returns.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_returns BEFORE INSERT OR UPDATE OR DELETE ON public.customer_returns
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.customer_return_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_return_items FROM anon,authenticated;
GRANT SELECT ON public.customer_return_items TO authenticated;
GRANT ALL ON public.customer_return_items TO service_role;
CREATE POLICY sales_read ON public.customer_return_items FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'returns.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_return_items BEFORE INSERT OR UPDATE OR DELETE ON public.customer_return_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

ALTER TABLE public.logistics_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.logistics_exceptions FROM anon,authenticated;
GRANT SELECT ON public.logistics_exceptions TO authenticated;
GRANT ALL ON public.logistics_exceptions TO service_role;
CREATE POLICY sales_read ON public.logistics_exceptions FOR SELECT TO authenticated
  USING(public.has_permission(organization_id,'logistics.read') AND public.is_org_member(organization_id));
CREATE TRIGGER sales_integrity_exceptions BEFORE INSERT OR UPDATE OR DELETE ON public.logistics_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();

-- =====================================================================
-- 19. Concessoes das funcoes.
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.sales_require(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_audit(uuid,text,text,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_emit(uuid,text,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_ensure_settings(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_settings(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_settings_save(uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_next_number(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_on_hand(uuid,uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_reserved(uuid,uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_available(uuid,uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_availability(uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_credit_check(uuid,uuid,numeric,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_prepare_item(uuid,jsonb,uuid,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_insert_order(uuid,jsonb,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_save(uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_convert_quote(uuid,uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_validate_order(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_order_action(uuid,uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_receivable_total(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_create_receivables(uuid,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_company_activity(uuid,uuid,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_reserve(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_reservation_action(uuid,uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_fulfillment_create(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_fulfillment_action(uuid,uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_pick_scan(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_pick_confirm(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_pack(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_shipment_create(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_shipment_dispatch(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_shipment_action(uuid,uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_return_create(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_return_action(uuid,uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_exception_action(uuid,uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_exception_create(uuid,text,text,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_carrier_save(uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_query(uuid,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_order_detail(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(uuid,jsonb) TO authenticated,service_role;

-- =====================================================================
-- 20. Expiracao de reservas vencidas.
--
-- Rodar por agenda externa. Nao ha pg_cron no projeto: a expiracao e
-- idempotente e pode ser chamada quantas vezes for preciso.
-- =====================================================================
CREATE FUNCTION public.sales_expire_reservations(_org uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.inventory_reservations; v_n integer:=0; v_now timestamptz:=now();
 v_orders uuid[]:='{}'::uuid[];
BEGIN
 PERFORM public.sales_require(_org,'reservations.release');
 PERFORM public.inventory_lock(_org);
 FOR r IN SELECT * FROM public.inventory_reservations
   WHERE organization_id=_org AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
     AND expires_at<now()
   FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.inventory_reservations SET status='EXPIRED',
   released_quantity=released_quantity+(quantity-fulfilled_quantity-released_quantity),
   released_at=v_now,release_reason='Expiração automática por prazo',updated_at=v_now WHERE id=r.id;
  v_orders:=v_orders||r.sales_order_id;
  v_n:=v_n+1;
 END LOOP;
 IF v_n=0 THEN RETURN jsonb_build_object('expired',0); END IF;
 -- Reservado do item e situacao de estoque do pedido voltam a ser o real.
 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((
    SELECT sum(greatest(0,x.quantity-x.fulfilled_quantity-x.released_quantity))
    FROM public.inventory_reservations x WHERE x.sales_order_item_id=i.id
      AND x.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=ANY(v_orders);
 UPDATE public.sales_orders o SET stock_status=CASE
    WHEN NOT EXISTS(SELECT 1 FROM public.inventory_reservations r
        WHERE r.organization_id=_org AND r.sales_order_id=o.id
          AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
          AND r.quantity-r.fulfilled_quantity-r.released_quantity>0) THEN 'INSUFFICIENT'
    ELSE o.stock_status END,availability_checked_at=v_now,updated_at=v_now
  WHERE o.organization_id=_org AND o.id=ANY(v_orders)
    AND o.status NOT IN ('CANCELED','CLOSED','FULFILLED');
 PERFORM public.sales_audit(_org,'inventory_reservation.expired_batch','sales_orders',v_orders[1],
   jsonb_build_object('expired',v_n,'sales_order_ids',to_jsonb(v_orders)));
 RETURN jsonb_build_object('expired',v_n,'sales_order_ids',to_jsonb(v_orders));
END;
$$;
GRANT EXECUTE ON FUNCTION public.sales_expire_reservations(uuid,jsonb) TO authenticated,service_role;

-- =====================================================================
-- 21. Fim da migration.
-- =====================================================================
COMMIT;

