-- ============================================================
-- Inventory Ledger — fonte oficial do estoque (LOVABLE MASTER 003).
--
-- Princípios garantidos neste schema:
--   * SALDO = SOMA DOS MOVIMENTOS VÁLIDOS (POSTED). Nenhuma tabela guarda
--     saldo "à parte": `products.stock` / `product_variants.stock` NÃO existem.
--   * Movimento consolidado NÃO é editado nem excluído. Correção = novo
--     movimento de REVERSAL (ou ADJUSTMENT / MANUAL_CORRECTION).
--   * Remessa para parceiro (PARTNER_SHIPMENT) NÃO é venda: apenas altera a
--     posição física/operacional da mercadoria.
--   * Escrita no ledger acontece SOMENTE pelas funções transacionais abaixo
--     (SECURITY DEFINER). Nenhuma escrita direta via PostgREST.
--   * Concorrência: advisory lock por (organização, variante, local, lote)
--     dentro da transação — duas saídas simultâneas nunca validam o mesmo
--     saldo antigo.
--   * Idempotência: `idempotency_key` por organização impede movimentos
--     duplicados de um mesmo evento externo (marketplace, importação, API).
--   * tenant = organization_id em todas as tabelas; RLS ligada.
-- ============================================================

-- ============ ENUMS ============
CREATE TYPE public.inventory_location_type AS ENUM (
  'FACTORY', 'WAREHOUSE', 'OWN_STORE', 'MARKETPLACE', 'PARTNER', 'TRANSIT', 'OTHER'
);
CREATE TYPE public.inventory_location_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE public.inventory_movement_direction AS ENUM ('IN', 'OUT');
CREATE TYPE public.inventory_movement_type AS ENUM (
  'OPENING_BALANCE',
  'PURCHASE_RECEIPT',
  'PRODUCTION_OUTPUT',
  'PRODUCTION_CONSUMPTION',
  'SALE',
  'SALE_RETURN',
  'PARTNER_SHIPMENT',
  'PARTNER_RETURN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'LOSS',
  'MANUAL_CORRECTION',
  'REVERSAL'
);
CREATE TYPE public.inventory_movement_status AS ENUM ('PENDING', 'POSTED', 'REVERSED', 'CANCELED');
CREATE TYPE public.inventory_transfer_status AS ENUM (
  'DRAFT', 'PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'CANCELED'
);
CREATE TYPE public.inventory_batch_status AS ENUM ('ACTIVE', 'EXPIRED', 'DISABLED');
CREATE TYPE public.inventory_count_status AS ENUM (
  'DRAFT', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELED'
);
CREATE TYPE public.inventory_count_item_status AS ENUM ('PENDING', 'COUNTED', 'ADJUSTED');

-- ============ INVENTORY LOCATIONS ============
-- A localização descreve a POSIÇÃO FÍSICA/OPERACIONAL da mercadoria, não a
-- propriedade. Mercadoria em posse de parceiro (type = PARTNER) pode continuar
-- sendo propriedade da organização até a regra comercial correspondente.
CREATE TABLE public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type public.inventory_location_type NOT NULL DEFAULT 'WAREHOUSE',
  status public.inventory_location_status NOT NULL DEFAULT 'ACTIVE',
  -- Campos opcionais para evolução: parceiro / loja de marketplace / endereço.
  -- Sem FK ainda — os módulos não existem; relacionamento será criado depois.
  partner_id uuid,
  marketplace_store_id uuid,
  address_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, code)
);
CREATE INDEX inventory_locations_org_type_idx
  ON public.inventory_locations (organization_id, type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;
GRANT ALL ON public.inventory_locations TO service_role;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

-- ============ INVENTORY BATCHES ============
-- Lote é opcional: nem todo produto/variante exige controle por lote.
CREATE TABLE public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  batch_code text NOT NULL,
  manufactured_at timestamptz,
  expires_at timestamptz,
  status public.inventory_batch_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id, batch_code)
);
CREATE INDEX inventory_batches_org_variant_idx
  ON public.inventory_batches (organization_id, variant_id);
GRANT SELECT, INSERT, UPDATE ON public.inventory_batches TO authenticated;
GRANT ALL ON public.inventory_batches TO service_role;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

-- ============ INVENTORY MOVEMENTS (LEDGER) ============
-- Movimentos são IMUTÁVEIS depois de POSTED. Reversão marca o original como
-- REVERSED e cria um movimento compensatório (movement_type = REVERSAL).
-- quantity é sempre positiva; a direção (IN/OUT) é decidida pelo campo
-- direction, consistente com o tipo de movimento.
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  batch_id uuid REFERENCES public.inventory_batches(id),
  movement_type public.inventory_movement_type NOT NULL,
  direction public.inventory_movement_direction NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'un',
  reference_type text,
  reference_id uuid,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  status public.inventory_movement_status NOT NULL DEFAULT 'POSTED',
  -- Correção por estorno: reversal_of_id aponta o original quando este
  -- movimento é uma REVERSAL; reversed_by_id marca o original revertido.
  reversal_of_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  reversed_by_id uuid REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  -- Idempotência para eventos externos (marketplace/ERP/API/importação/webhook).
  idempotency_key text,
  source text,
  external_reference text,
  UNIQUE (organization_id, idempotency_key),
  -- PARTNER_SHIPMENT/PARTNER_RETURN podem aparecer em ambas as direções: a
  -- perna que SAI da posição física (OUT) e a perna que ENTRA na localização
  -- do parceiro (IN) / sempre geradas pelo par atômico do transfer.
  CHECK (
    (direction = 'IN'  AND movement_type IN (
      'OPENING_BALANCE','PURCHASE_RECEIPT','PRODUCTION_OUTPUT','SALE_RETURN',
      'PARTNER_SHIPMENT','PARTNER_RETURN','TRANSFER_IN','ADJUSTMENT_IN','MANUAL_CORRECTION','REVERSAL'))
    OR
    (direction = 'OUT' AND movement_type IN (
      'PRODUCTION_CONSUMPTION','SALE','PARTNER_SHIPMENT','PARTNER_RETURN','TRANSFER_OUT',
      'ADJUSTMENT_OUT','LOSS','MANUAL_CORRECTION','REVERSAL'))
  )
);
CREATE INDEX inventory_movements_org_occurred_idx
  ON public.inventory_movements (organization_id, occurred_at DESC);
CREATE INDEX inventory_movements_org_variant_idx
  ON public.inventory_movements (organization_id, variant_id, occurred_at DESC);
CREATE INDEX inventory_movements_org_location_idx
  ON public.inventory_movements (organization_id, location_id, occurred_at DESC);
CREATE INDEX inventory_movements_org_type_idx
  ON public.inventory_movements (organization_id, movement_type, occurred_at DESC);
CREATE INDEX inventory_movements_org_status_idx
  ON public.inventory_movements (organization_id, status);
CREATE INDEX inventory_movements_org_reference_idx
  ON public.inventory_movements (organization_id, reference_type, reference_id);
GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- ============ INVENTORY TRANSFERS ============
-- Transferência é uma operação única que gera, atomicamente, OUT na origem e
-- IN no destino compartilhando o mesmo reference_id (o id do transfer).
CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  destination_location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  -- TRANSFER = transferência interna; PARTNER_SHIPMENT/PARTNER_RETURN = movem
  -- mercadoria entre posição física e a posição de um parceiro.
  transfer_type text NOT NULL DEFAULT 'TRANSFER'
    CHECK (transfer_type IN ('TRANSFER', 'PARTNER_SHIPMENT', 'PARTNER_RETURN')),
  status public.inventory_transfer_status NOT NULL DEFAULT 'DRAFT',
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz,
  requested_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  notes text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  CHECK (source_location_id <> destination_location_id)
);
CREATE INDEX inventory_transfers_org_status_idx
  ON public.inventory_transfers (organization_id, status, requested_at DESC);
GRANT SELECT ON public.inventory_transfers TO authenticated;
GRANT ALL ON public.inventory_transfers TO service_role;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_transfer_items_transfer_idx
  ON public.inventory_transfer_items (transfer_id);
GRANT SELECT ON public.inventory_transfer_items TO authenticated;
GRANT ALL ON public.inventory_transfer_items TO service_role;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

-- ============ INVENTORY COUNTS ============
-- Contagem física: a diferença observada NÃO altera estoque automaticamente.
-- Somente a conclusão confirmada gera movimentos de ADJUSTMENT.
CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  status public.inventory_count_status NOT NULL DEFAULT 'DRAFT',
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_counts_org_status_idx
  ON public.inventory_counts (organization_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.inventory_counts TO authenticated;
GRANT ALL ON public.inventory_counts TO service_role;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inventory_count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  system_quantity numeric(14,3) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,3),
  difference numeric(14,3),
  status public.inventory_count_item_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_count_items_count_idx
  ON public.inventory_count_items (inventory_count_id);
GRANT SELECT, INSERT, UPDATE ON public.inventory_count_items TO authenticated;
GRANT ALL ON public.inventory_count_items TO service_role;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;

-- ============ ORGANIZATION INVENTORY SETTINGS ============
-- allow_negative_inventory: default false. Quando false, saídas que gerariam
-- saldo negativo são REJEITADAS. Quando true, passam com auditoria (nunca em
-- silêncio: toda saída sempre registra movimento e auditoria).
CREATE TABLE public.organization_inventory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  allow_negative_inventory boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organization_inventory_settings TO authenticated;
GRANT ALL ON public.organization_inventory_settings TO service_role;
ALTER TABLE public.organization_inventory_settings ENABLE ROW LEVEL SECURITY;

-- ============ UPDATED_AT TRIGGERS ============
CREATE TRIGGER inventory_locations_updated_at BEFORE UPDATE ON public.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_batches_updated_at BEFORE UPDATE ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_transfers_updated_at BEFORE UPDATE ON public.inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_counts_updated_at BEFORE UPDATE ON public.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_count_items_updated_at BEFORE UPDATE ON public.inventory_count_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER organization_inventory_settings_updated_at BEFORE UPDATE
  ON public.organization_inventory_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ BALANCE VIEW ============
-- Saldo DERIVADO e RECONSTRUÍVEL a partir do ledger. Nenhuma escrita aqui —
-- é a única forma de consulta oficial. A cláusula status IN ('POSTED','REVERSED')
-- define os "movimentos válidos": um original revertido permanece no saldo e
-- seu efeito é anulado pelo REVERSAL de direção oposta (o par soma zero).
CREATE VIEW public.inventory_balances AS
SELECT
  m.organization_id,
  m.variant_id,
  m.location_id,
  m.batch_id,
  SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END) AS on_hand,
  MAX(m.occurred_at) AS last_movement_at
FROM public.inventory_movements m
WHERE m.status IN ('POSTED', 'REVERSED')
GROUP BY m.organization_id, m.variant_id, m.location_id, m.batch_id;
ALTER VIEW public.inventory_balances SET (security_invoker = on);
GRANT SELECT ON public.inventory_balances TO authenticated;
GRANT ALL ON public.inventory_balances TO service_role;

-- ============ SALDO OFICIAL (função centralizada) ============
-- Parâmetros organizacionais obrigatórios; local/lote opcionais. Retorna NULL
-- para quem não é membro da organização (não informa nem a existência).
CREATE OR REPLACE FUNCTION public.inventory_get_balance(
  _organization_id uuid,
  _variant_id uuid,
  _location_id uuid DEFAULT NULL,
  _batch_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_organization_id, _user_id) THEN
    RETURN NULL;
  END IF;
  RETURN COALESCE((
    SELECT SUM(CASE WHEN m.direction = 'IN' THEN m.quantity ELSE -m.quantity END)
    FROM public.inventory_movements m
    WHERE m.organization_id = _organization_id
      AND m.variant_id = _variant_id
      AND m.status IN ('POSTED', 'REVERSED')
      AND (_location_id IS NULL OR m.location_id = _location_id)
      AND (_batch_id IS NULL OR m.batch_id = _batch_id)
  ), 0);
END;
$$;

-- ============ POST MOVEMENT (função única de escrita no ledger) ============
-- Toda alteração de estoque passa por aqui (posso ser chamada pelos módulos
-- futuros: produção, vendas, marketplace, parceiro). TRANSFER_* e REVERSAL
-- têm operações de negócio dedicadas e são recusadas aqui.
CREATE OR REPLACE FUNCTION public.inventory_post_movement(
  _organization_id uuid,
  _variant_id uuid,
  _location_id uuid,
  _movement_type public.inventory_movement_type,
  _quantity numeric,
  _reason text DEFAULT NULL,
  _occurred_at timestamptz DEFAULT now(),
  _unit text DEFAULT 'un',
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _batch_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _direction public.inventory_movement_direction DEFAULT NULL,
  _user_id uuid DEFAULT auth.uid(),
  _allow_negative_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_direction public.inventory_movement_direction;
  v_expected_permission text;
  v_balance numeric;
  v_allow_negative boolean;
  v_existing_id uuid;
  v_row record;
  v_audit_action text;
  v_lock_key bigint;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuário inválido para esta operação.';
  END IF;

  -- Permissão exigida por tipo de movimento.
  v_expected_permission := CASE _movement_type
    WHEN 'OPENING_BALANCE' THEN 'inventory.opening_balance'
    WHEN 'ADJUSTMENT_IN' THEN 'inventory.adjust'
    WHEN 'ADJUSTMENT_OUT' THEN 'inventory.adjust'
    WHEN 'LOSS' THEN 'inventory.adjust'
    WHEN 'MANUAL_CORRECTION' THEN 'inventory.adjust'
    ELSE 'inventory.move'
  END;
  IF NOT public.has_permission(_organization_id, v_expected_permission, _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação de estoque.';
  END IF;

  IF _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;
  IF _movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL',
                        'PARTNER_SHIPMENT', 'PARTNER_RETURN') THEN
    RAISE EXCEPTION 'Este tipo de movimento é gerado pela operação de negócio dedicada.';
  END IF;

  v_direction := CASE _movement_type
    WHEN 'OPENING_BALANCE' THEN 'IN'
    WHEN 'PURCHASE_RECEIPT' THEN 'IN'
    WHEN 'PRODUCTION_OUTPUT' THEN 'IN'
    WHEN 'SALE_RETURN' THEN 'IN'
    WHEN 'PRODUCTION_CONSUMPTION' THEN 'OUT'
    WHEN 'SALE' THEN 'OUT'
    WHEN 'ADJUSTMENT_OUT' THEN 'OUT'
    WHEN 'LOSS' THEN 'OUT'
    ELSE NULL
  END::public.inventory_movement_direction;

  -- MANUAL_CORRECTION é o único tipo com direção livre.
  IF _movement_type = 'MANUAL_CORRECTION' THEN
    IF _direction IS NULL THEN
      RAISE EXCEPTION 'Direção obrigatória para MANUAL_CORRECTION.';
    END IF;
    v_direction := _direction;
  ELSIF v_direction IS NULL THEN
    RAISE EXCEPTION 'Tipo de movimento inválido para postagem direta.';
  ELSIF _direction IS NOT NULL AND _direction <> v_direction THEN
    RAISE EXCEPTION 'Direção incompatível com o tipo de movimento.';
  END IF;

  PERFORM 1 FROM public.product_variants
    WHERE id = _variant_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Variante não encontrada nesta organização.'; END IF;
  PERFORM 1 FROM public.inventory_locations
    WHERE id = _location_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Localização não encontrada nesta organização.'; END IF;
  IF _batch_id IS NOT NULL THEN
    PERFORM 1 FROM public.inventory_batches
      WHERE id = _batch_id AND organization_id = _organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado nesta organização.'; END IF;
  END IF;

  -- Idempotência: mesmo evento externo não gera duas movimentações.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.inventory_movements
      WHERE organization_id = _organization_id AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT to_jsonb(movements) FROM public.inventory_movements movements
        WHERE movements.id = v_existing_id INTO v_row;
      RETURN jsonb_build_object('deduped', true, 'movement', v_row, 'movement_id', v_existing_id);
    END IF;
  END IF;

  -- Concorrência: serializa validação de saldo para a mesma chave dentro da
  -- transação. Dois movimentos simultâneos nunca veem o saldo antigo.
  IF v_direction = 'OUT' THEN
    v_lock_key := hashtextextended(
      concat_ws('|', _organization_id, _variant_id, _location_id,
        coalesce(_batch_id::text, '')), 771::bigint);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT ois.allow_negative_inventory FROM public.organization_inventory_settings ois
      WHERE ois.organization_id = _organization_id INTO v_allow_negative;
    v_allow_negative := COALESCE(v_allow_negative, false);

    IF NOT v_allow_negative AND NOT _allow_negative_override THEN
      v_balance := public.inventory_get_balance(
        _organization_id, _variant_id, _location_id, _batch_id, _user_id);
      IF COALESCE(v_balance, 0) - _quantity < 0 THEN
        RAISE EXCEPTION 'Saldo insuficiente nesta localização. Disponível: %; solicitado: %.',
          COALESCE(v_balance, 0), _quantity;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.inventory_movements (
    organization_id, variant_id, location_id, batch_id,
    movement_type, direction, quantity, unit,
    reference_type, reference_id, reason, occurred_at,
    created_by, status, idempotency_key, source
  ) VALUES (
    _organization_id, _variant_id, _location_id, _batch_id,
    _movement_type, v_direction, _quantity, _unit,
    _reference_type, _reference_id, _reason, _occurred_at,
    _user_id, 'POSTED', _idempotency_key, 'INTERNAL'
  )
  RETURNING to_jsonb(inventory_movements.*) INTO v_row;

  v_audit_action := CASE
    WHEN _movement_type = 'OPENING_BALANCE' THEN 'inventory.opening_balance'
    WHEN _movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','LOSS','MANUAL_CORRECTION')
      THEN 'inventory.adjustment'
    ELSE 'inventory.movement.post'
  END;

  INSERT INTO public.audit_log (organization_id, user_id, action, resource, resource_id, context)
  VALUES (
    _organization_id, _user_id, v_audit_action, 'inventory_movements',
    (v_row->>'id'),
    jsonb_build_object(
      'movement_type', _movement_type,
      'direction', v_direction,
      'quantity', _quantity,
      'unit', _unit,
      'variant_id', _variant_id,
      'location_id', _location_id,
      'batch_id', _batch_id,
      'reference_type', _reference_type,
      'reference_id', _reference_id,
      'allow_negative', COALESCE(v_allow_negative, false)
    )
  );

  RETURN jsonb_build_object(
    'deduped', false,
    'movement', v_row,
    'movement_id', (v_row->>'id')
  );
END;
$$;

-- ============ POST TRANSFER (atômico) ============
-- Cria a operação origem->destino e os movimentos OUT/IN na MESMA transação.
-- Suporta três operações (o par out/in é sempre atômico — ou tudo ou nada):
--   * TRANSFER          -> transferência interna (TRANSFER_OUT / TRANSFER_IN)
--   * PARTNER_SHIPMENT  -> remessa a parceiro (OUT do físico, IN do parceiro)
--   * PARTNER_RETURN    -> retorno de parceiro (OUT do parceiro, IN do físico)
-- Ambos os movimentos compartilham o mesmo reference_id (id da operação).
CREATE OR REPLACE FUNCTION public.inventory_post_transfer(
  _organization_id uuid,
  _source_location_id uuid,
  _destination_location_id uuid,
  _items jsonb,
  _transfer_type text DEFAULT 'TRANSFER',
  _notes text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_variant_id uuid;
  v_quantity numeric;
  v_balance numeric;
  v_allow_negative boolean;
  v_transfer_id uuid;
  v_lock_key bigint;
  v_movement_id uuid;
  v_movement_ids uuid[] := '{}';
  v_existing_id uuid;
  v_row record;
  v_out_type public.inventory_movement_type;
  v_in_type public.inventory_movement_type;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuário inválido para esta operação.';
  END IF;
  IF _transfer_type NOT IN ('TRANSFER', 'PARTNER_SHIPMENT', 'PARTNER_RETURN') THEN
    RAISE EXCEPTION 'Tipo de operação desconhecido.';
  END IF;
  IF _transfer_type = 'TRANSFER' THEN
    IF NOT public.has_permission(_organization_id, 'inventory.transfer', _user_id) THEN
      RAISE EXCEPTION 'Sem permissão para transferências de estoque.';
    END IF;
  ELSIF NOT public.has_permission(_organization_id, 'inventory.move', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para remessas de estoque.';
  END IF;
  IF _source_location_id = _destination_location_id THEN
    RAISE EXCEPTION 'Origem e destino devem ser diferentes.';
  END IF;
  PERFORM 1 FROM public.inventory_locations
    WHERE id = _source_location_id AND organization_id = _organization_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Localização de origem inválida.'; END IF;
  PERFORM 1 FROM public.inventory_locations
    WHERE id = _destination_location_id AND organization_id = _organization_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Localização de destino inválida.'; END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item para a transferência.';
  END IF;

  -- Idempotência da operação.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.inventory_transfers
      WHERE organization_id = _organization_id AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT to_jsonb(transfers) FROM public.inventory_transfers transfers
        WHERE transfers.id = v_existing_id INTO v_row;
      RETURN jsonb_build_object('deduped', true, 'transfer', v_row, 'transfer_id', v_existing_id);
    END IF;
  END IF;

  SELECT ois.allow_negative_inventory FROM public.organization_inventory_settings ois
    WHERE ois.organization_id = _organization_id INTO v_allow_negative;
  v_allow_negative := COALESCE(v_allow_negative, false);

  -- Valida todos os itens E garante saldo na origem ANTES de qualquer escrita.
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) AS it
  LOOP
    BEGIN
      v_variant_id := (v_item.it->>'variant_id')::uuid;
      v_quantity := (v_item.it->>'quantity')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Item de transferência inválido (variant_id e quantity numérica são obrigatórios).';
    END;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
    END IF;
    PERFORM 1 FROM public.product_variants
      WHERE id = v_variant_id AND organization_id = _organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variante inválida na transferência.'; END IF;

    IF NOT v_allow_negative THEN
      v_lock_key := hashtextextended(
        concat_ws('|', _organization_id, v_variant_id, _source_location_id, ''), 771::bigint);
      PERFORM pg_advisory_xact_lock(v_lock_key);
      v_balance := public.inventory_get_balance(
        _organization_id, v_variant_id, _source_location_id, NULL, _user_id);
      IF COALESCE(v_balance, 0) - v_quantity < 0 THEN
        RAISE EXCEPTION
          'Saldo insuficiente na origem para a variante %. Disponível: %; solicitado: %.',
          v_variant_id, COALESCE(v_balance, 0), v_quantity;
      END IF;
    END IF;
  END LOOP;

  v_out_type := CASE _transfer_type
    WHEN 'TRANSFER' THEN 'TRANSFER_OUT'
    WHEN 'PARTNER_SHIPMENT' THEN 'PARTNER_SHIPMENT'
    ELSE 'PARTNER_RETURN'
  END;
  v_in_type := CASE _transfer_type
    WHEN 'TRANSFER' THEN 'TRANSFER_IN'
    WHEN 'PARTNER_SHIPMENT' THEN 'PARTNER_SHIPMENT'
    ELSE 'PARTNER_RETURN'
  END;

  INSERT INTO public.inventory_transfers (
    organization_id, source_location_id, destination_location_id, transfer_type,
    status, requested_at, completed_at, requested_by, approved_by,
    notes, idempotency_key
  ) VALUES (
    _organization_id, _source_location_id, _destination_location_id, _transfer_type,
    'COMPLETED', now(), now(), _user_id, _user_id, _notes, _idempotency_key
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.inventory_transfer_items (
    organization_id, transfer_id, variant_id, quantity
  )
  SELECT _organization_id, v_transfer_id,
         (it->>'variant_id')::uuid, (it->>'quantity')::numeric
  FROM jsonb_array_elements(_items) AS it;

  -- Movimentos OUT (origem) + IN (destino) na mesma transação.
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) AS it
  LOOP
    v_variant_id := (v_item.it->>'variant_id')::uuid;
    v_quantity := (v_item.it->>'quantity')::numeric;

    INSERT INTO public.inventory_movements (
      organization_id, variant_id, location_id,
      movement_type, direction, quantity, unit,
      reference_type, reference_id, reason, occurred_at, created_by, status
    ) VALUES (
      _organization_id, v_variant_id, _source_location_id,
      v_out_type, 'OUT', v_quantity, 'un',
      _transfer_type, v_transfer_id, _notes, now(), _user_id, 'POSTED'
    ) RETURNING id INTO v_movement_id;
    v_movement_ids := array_append(v_movement_ids, v_movement_id);

    INSERT INTO public.inventory_movements (
      organization_id, variant_id, location_id,
      movement_type, direction, quantity, unit,
      reference_type, reference_id, reason, occurred_at, created_by, status
    ) VALUES (
      _organization_id, v_variant_id, _destination_location_id,
      v_in_type, 'IN', v_quantity, 'un',
      _transfer_type, v_transfer_id, _notes, now(), _user_id, 'POSTED'
    ) RETURNING id INTO v_movement_id;
    v_movement_ids := array_append(v_movement_ids, v_movement_id);
  END LOOP;

  INSERT INTO public.audit_log (organization_id, user_id, action, resource, resource_id, context)
  VALUES (
    _organization_id, _user_id, 'inventory.transfer.create', 'inventory_transfers',
    v_transfer_id::text,
    jsonb_build_object(
      'transfer_type', _transfer_type,
      'source_location_id', _source_location_id,
      'destination_location_id', _destination_location_id,
      'items', _items,
      'movements', to_jsonb(v_movement_ids)
    )
  );

  RETURN jsonb_build_object(
    'deduped', false,
    'transfer_id', v_transfer_id,
    'transfer_type', _transfer_type,
    'movement_ids', to_jsonb(v_movement_ids)
  );
END;
$$;

-- ============ REVERSE MOVEMENT ============
-- Não edita o movimento original: cria um REVERSAL compensatório e relaciona
-- ambos. O original permanece no histórico com status REVERSED.
CREATE OR REPLACE FUNCTION public.inventory_reverse_movement(
  _organization_id uuid,
  _movement_id uuid,
  _reason text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original record;
  v_reversal_id uuid;
  v_reversal_row record;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuário inválido para esta operação.';
  END IF;
  IF NOT public.has_permission(_organization_id, 'inventory.reverse', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para reverter movimentos.';
  END IF;
  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'Motivo obrigatório para reversão.';
  END IF;

  SELECT * INTO v_original FROM public.inventory_movements
    WHERE id = _movement_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento não encontrado nesta organização.'; END IF;
  IF v_original.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Somente movimentos POSTED podem ser revertidos.';
  END IF;

  -- Idempotente por construção: uma mesma reversão para o mesmo movimento não
  -- duplica (double-click, chamada repetida).
  SELECT id INTO v_reversal_id FROM public.inventory_movements
    WHERE organization_id = _organization_id
      AND reversal_of_id = _movement_id
    LIMIT 1;
  IF v_reversal_id IS NOT NULL THEN
    SELECT to_jsonb(movements) FROM public.inventory_movements movements
      WHERE movements.id = v_reversal_id INTO v_reversal_row;
    RETURN jsonb_build_object(
      'deduped', true, 'movement_id', v_reversal_id, 'reversal', v_reversal_row);
  END IF;

  INSERT INTO public.inventory_movements (
    organization_id, variant_id, location_id, batch_id,
    movement_type, direction, quantity, unit,
    reference_type, reference_id, reason, occurred_at, created_by, status,
    reversal_of_id
  ) VALUES (
    _organization_id, v_original.variant_id, v_original.location_id, v_original.batch_id,
    'REVERSAL',
    CASE WHEN v_original.direction = 'IN' THEN 'OUT'::public.inventory_movement_direction
         ELSE 'IN'::public.inventory_movement_direction END,
    v_original.quantity, v_original.unit,
    'REVERSAL', v_original.id, _reason, now(), _user_id, 'POSTED',
    v_original.id
  )
  RETURNING id, to_jsonb(inventory_movements.*) INTO v_reversal_id, v_reversal_row;

  UPDATE public.inventory_movements
    SET status = 'REVERSED', reversed_by_id = v_reversal_id
    WHERE id = v_original.id AND organization_id = _organization_id;

  INSERT INTO public.audit_log (organization_id, user_id, action, resource, resource_id, context)
  VALUES (
    _organization_id, _user_id, 'inventory.reverse', 'inventory_movements',
    v_original.id::text,
    jsonb_build_object(
      'reversal_id', v_reversal_id,
      'original_direction', v_original.direction,
      'quantity', v_original.quantity,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'deduped', false, 'movement_id', v_reversal_id, 'reversal', v_reversal_row);
END;
$$;

-- ============ COMPLETE COUNT ============
-- Fluxo: INICIAR -> CONTAR -> COMPARAR -> REVISAR -> AJUSTAR.
-- A diferença só vira estoque quando a contagem é confirmada; cada divergência
-- gera um ADJUSTMENT_IN/OUT com reference INVENTORY_COUNT.
CREATE OR REPLACE FUNCTION public.inventory_complete_count(
  _organization_id uuid,
  _count_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count record;
  v_item record;
  v_diff numeric;
  v_type public.inventory_movement_type;
  v_result jsonb;
  v_differences jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_posted jsonb;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuário inválido para esta operação.';
  END IF;
  IF NOT public.has_permission(_organization_id, 'inventory.count', _user_id) THEN
    RAISE EXCEPTION 'Sem permissão para contagens de estoque.';
  END IF;

  SELECT * INTO v_count FROM public.inventory_counts
    WHERE id = _count_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contagem não encontrada nesta organização.'; END IF;
  IF v_count.status NOT IN ('IN_PROGRESS', 'REVIEW') THEN
    RAISE EXCEPTION 'Contagem precisa estar em andamento para ser concluída.';
  END IF;

  FOR v_item IN
    SELECT * FROM public.inventory_count_items
    WHERE inventory_count_id = _count_id
      AND counted_quantity IS NOT NULL
  LOOP
    v_diff := v_item.counted_quantity - v_item.system_quantity;
    IF v_diff = 0 THEN CONTINUE; END IF;

    IF v_diff > 0 THEN
      v_type := 'ADJUSTMENT_IN';
    ELSE
      v_type := 'ADJUSTMENT_OUT';
      v_diff := -v_diff;
    END IF;

    v_posted := public.inventory_post_movement(
      _organization_id, v_item.variant_id, v_count.location_id,
      v_type, v_diff,
      'Ajuste decorrente de contagem física (motivo de inventário).',
      now(), 'un', 'INVENTORY_COUNT', _count_id,
      NULL, md5(concat(_count_id, v_item.id)) || ':COUNT',
      NULL, _user_id, false
    );
    v_created := v_created + 1;

    v_differences := v_differences || jsonb_build_object(
      'variant_id', v_item.variant_id,
      'system_quantity', v_item.system_quantity,
      'counted_quantity', v_item.counted_quantity,
      'movement_id', (v_posted->>'movement_id')
    );
  END LOOP;

  UPDATE public.inventory_counts
    SET status = 'COMPLETED', completed_at = now()
    WHERE id = _count_id AND organization_id = _organization_id;

  UPDATE public.inventory_count_items
    SET status = 'ADJUSTED'
    WHERE inventory_count_id = _count_id AND counted_quantity IS NOT NULL;

  INSERT INTO public.audit_log (organization_id, user_id, action, resource, resource_id, context)
  VALUES (
    _organization_id, _user_id, 'inventory.count.complete', 'inventory_counts',
    _count_id::text,
    jsonb_build_object('adjustments_created', v_created, 'differences', v_differences)
  );

  v_result := jsonb_build_object(
    'count_id', _count_id,
    'adjustments_created', v_created,
    'differences', v_differences
  );
  RETURN v_result;
END;
$$;

-- ============ GRANT EXECUTE RPCS ============
REVOKE ALL ON FUNCTION public.inventory_get_balance(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_post_movement(uuid, uuid, uuid, public.inventory_movement_type, numeric, text, timestamptz, text, text, uuid, uuid, text, public.inventory_movement_direction, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_post_transfer(uuid, uuid, uuid, jsonb, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_reverse_movement(uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_complete_count(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.inventory_get_balance(uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_get_balance(uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_post_movement(uuid, uuid, uuid, public.inventory_movement_type, numeric, text, timestamptz, text, text, uuid, uuid, text, public.inventory_movement_direction, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_post_movement(uuid, uuid, uuid, public.inventory_movement_type, numeric, text, timestamptz, text, text, uuid, uuid, text, public.inventory_movement_direction, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_post_transfer(uuid, uuid, uuid, jsonb, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_post_transfer(uuid, uuid, uuid, jsonb, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_reverse_movement(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_reverse_movement(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_complete_count(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_complete_count(uuid, uuid, uuid) TO service_role;

-- ============ RLS POLICIES ============
-- Leitura: qualquer membro ativo da organização.
CREATE POLICY "members read inventory_locations" ON public.inventory_locations
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read inventory_batches" ON public.inventory_batches
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read inventory_movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read inventory_transfers" ON public.inventory_transfers
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read inventory_transfer_items" ON public.inventory_transfer_items
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read inventory_counts" ON public.inventory_counts
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read inventory_count_items" ON public.inventory_count_items
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "members read organization_inventory_settings" ON public.organization_inventory_settings
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Escrita do cadastro de localizações.
CREATE POLICY "inventory.manage_locations insert inventory_locations" ON public.inventory_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'inventory.manage_locations'));
CREATE POLICY "inventory.manage_locations update inventory_locations" ON public.inventory_locations
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'inventory.manage_locations'))
  WITH CHECK (public.has_permission(organization_id, 'inventory.manage_locations'));
CREATE POLICY "inventory.manage_locations delete inventory_locations" ON public.inventory_locations
  FOR DELETE TO authenticated
  USING (public.has_permission(organization_id, 'inventory.manage_locations'));

-- Escrita do cadastro de lotes.
CREATE POLICY "inventory.move insert inventory_batches" ON public.inventory_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'inventory.move'));
CREATE POLICY "inventory.move update inventory_batches" ON public.inventory_batches
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'inventory.move'))
  WITH CHECK (public.has_permission(organization_id, 'inventory.move'));

-- Escrita dos movimentos do ledger: SEM política. Somente as funções
-- transacionais (SECURITY DEFINER) escrevem — o PostgREST não consegue.

-- Contagens: escrita exclusiva de quem tem inventory.count (criar, marcar,
-- finalizar); exclusão não é permitida — contagem cancelada muda o status.
CREATE POLICY "inventory.count insert inventory_counts" ON public.inventory_counts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'inventory.count'));
CREATE POLICY "inventory.count update inventory_counts" ON public.inventory_counts
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'inventory.count'))
  WITH CHECK (public.has_permission(organization_id, 'inventory.count'));
CREATE POLICY "inventory.count insert inventory_count_items" ON public.inventory_count_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'inventory.count'));
CREATE POLICY "inventory.count update inventory_count_items" ON public.inventory_count_items
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'inventory.count'))
  WITH CHECK (public.has_permission(organization_id, 'inventory.count'));

-- Configuração organizacional (negativo permitido): escrita de quem gerencia
-- localizações/estoque.
CREATE POLICY "inventory.manage_locations insert settings" ON public.organization_inventory_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(organization_id, 'inventory.manage_locations'));
CREATE POLICY "inventory.manage_locations update settings" ON public.organization_inventory_settings
  FOR UPDATE TO authenticated
  USING (public.has_permission(organization_id, 'inventory.manage_locations'))
  WITH CHECK (public.has_permission(organization_id, 'inventory.manage_locations'));

-- ============ PERMISSION MATRIX ============
-- Estoque é fonte de verdade quantitativa: leitura para todos os papéis;
-- gestão (movimento, ajuste, transferência, contagem, abertura, reversão e
-- localizações) para admin, gestor e estoque.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','inventory.read'),('admin','inventory.movements.read'),
  ('admin','inventory.move'),('admin','inventory.adjust'),
  ('admin','inventory.transfer'),('admin','inventory.count'),
  ('admin','inventory.opening_balance'),('admin','inventory.reverse'),
  ('admin','inventory.manage_locations'),
  ('gestor','inventory.read'),('gestor','inventory.movements.read'),
  ('gestor','inventory.move'),('gestor','inventory.adjust'),
  ('gestor','inventory.transfer'),('gestor','inventory.count'),
  ('gestor','inventory.opening_balance'),('gestor','inventory.reverse'),
  ('gestor','inventory.manage_locations'),
  ('estoque','inventory.read'),('estoque','inventory.movements.read'),
  ('estoque','inventory.move'),('estoque','inventory.adjust'),
  ('estoque','inventory.transfer'),('estoque','inventory.count'),
  ('estoque','inventory.opening_balance'),('estoque','inventory.reverse'),
  ('estoque','inventory.manage_locations'),
  ('producao','inventory.read'),('producao','inventory.movements.read'),
  ('financeiro','inventory.read'),('financeiro','inventory.movements.read'),
  ('comercial','inventory.read'),('comercial','inventory.movements.read'),
  ('marketplace','inventory.read'),('marketplace','inventory.movements.read')
ON CONFLICT DO NOTHING;

-- ============ ALERTA DE ESTOQUE MÍNIMO ============
-- Campos preparatórios por variante (quantitativo; sem previsão inteligente).
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS minimum_stock numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS reorder_point numeric(14,3) NOT NULL DEFAULT 0;