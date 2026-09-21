-- MASTER 003: invariantes transacionais, sem reescrever migrations publicadas.
BEGIN;
ALTER TABLE public.inventory_batches ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.inventory_count_items ADD COLUMN batch_id uuid REFERENCES public.inventory_batches(id);
CREATE UNIQUE INDEX inventory_count_item_key ON public.inventory_count_items
  (inventory_count_id, variant_id, batch_id) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX inventory_one_reversal ON public.inventory_movements(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_one_open_count ON public.inventory_counts(organization_id, location_id)
  WHERE status IN ('DRAFT','IN_PROGRESS','REVIEW');

-- Estornos legados: o original continua POSTED; compensação POSTED cancela seu efeito.
-- Não se removem movimentos nem se alteram quantidades/referências históricas.
UPDATE public.inventory_movements SET status = 'POSTED' WHERE status = 'REVERSED';
CREATE OR REPLACE VIEW public.inventory_balances WITH (security_invoker = true) AS
SELECT organization_id, variant_id, location_id, batch_id,
  sum(CASE direction WHEN 'IN' THEN quantity ELSE -quantity END) AS on_hand,
  max(occurred_at) AS last_movement_at
FROM public.inventory_movements WHERE status = 'POSTED'
GROUP BY organization_id, variant_id, location_id, batch_id;

-- Lock organizacional único: cobre entrada, saída, lote, transferência e contagem.
-- Ordem global evita deadlocks entre transferências cruzadas. Escopo não cruza tenants.
CREATE FUNCTION public.inventory_lock(_organization_id uuid) RETURNS void
LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(_organization_id::text, 903));
$$;
REVOKE ALL ON FUNCTION public.inventory_lock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inventory_get_balance(
  _organization_id uuid, _variant_id uuid, _location_id uuid DEFAULT NULL,
  _batch_id uuid DEFAULT NULL, _user_id uuid DEFAULT auth.uid()
) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() OR NOT public.has_permission(_organization_id, 'inventory.read') THEN
    RAISE EXCEPTION 'Sem permissão para consultar estoque.';
  END IF;
  RETURN coalesce((SELECT sum(on_hand) FROM public.inventory_balances
    WHERE organization_id = _organization_id AND variant_id = _variant_id
    AND (_location_id IS NULL OR location_id = _location_id)
    AND (_batch_id IS NULL OR batch_id = _batch_id)), 0);
END;
$$;

CREATE FUNCTION public.inventory_guard_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before numeric; v_after numeric; v_negative boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Movimento consolidado não é editado nem excluído.'; END IF;
  PERFORM public.inventory_lock(NEW.organization_id);
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 OR NEW.quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Quantidade inválida.';
  END IF;
  IF NEW.unit <> 'un' THEN RAISE EXCEPTION 'Unidade operacional desta etapa: un.'; END IF;
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
  IF NEW.direction='OUT' AND v_after < 0 THEN
    IF NOT v_negative THEN RAISE EXCEPTION 'Saldo insuficiente nesta localização/lote. Saldo: %.', v_before; END IF;
    IF NOT public.has_permission(NEW.organization_id,'inventory.allow_negative') THEN
      RAISE EXCEPTION 'Sem permissão para gerar estoque negativo.';
    END IF;
  END IF;
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES(NEW.organization_id,auth.uid(),CASE WHEN v_after<0 THEN 'inventory.negative_warning' ELSE 'inventory.ledger.post' END,
    'inventory_movements',NEW.id::text,jsonb_build_object('before',v_before,'after',v_after,
    'quantity',NEW.quantity,'direction',NEW.direction,'reason',NEW.reason,'variant_id',NEW.variant_id,
    'location_id',NEW.location_id,'batch_id',NEW.batch_id,'reference_id',NEW.reference_id));
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_movement();
REVOKE ALL ON FUNCTION public.inventory_guard_movement() FROM PUBLIC, anon, authenticated;

-- FK de tenant em todos os relacionamentos do domínio, inclusive escrita direta autorizada.
-- Trigger evita adicionar FKs ambíguas ao schema consultado pelo PostgREST.
CREATE FUNCTION public.inventory_guard_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_data jsonb := to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ['variant_id','product_variants'],['location_id','inventory_locations'],
    ['source_location_id','inventory_locations'],['destination_location_id','inventory_locations'],
    ['transfer_id','inventory_transfers'],['inventory_count_id','inventory_counts']]
  LOOP
    v_id := (v_data->>v_pair[1])::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
  END LOOP;
  IF TG_OP='UPDATE' AND OLD.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_locations','inventory_batches','inventory_transfers','inventory_transfer_items','inventory_counts','inventory_count_items'] LOOP
    EXECUTE format('CREATE TRIGGER inventory_tenant_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_relations()',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.inventory_guard_relations() FROM PUBLIC, anon, authenticated;
INSERT INTO public.role_permissions(role,permission) VALUES
 ('admin','inventory.allow_negative'),('gestor','inventory.allow_negative'),('estoque','inventory.allow_negative') ON CONFLICT DO NOTHING;

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
  v_row jsonb;
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

  PERFORM public.inventory_lock(_organization_id);
  IF _allow_negative_override THEN RAISE EXCEPTION 'Override de saldo negativo não permitido.'; END IF;
  IF _movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','LOSS','MANUAL_CORRECTION') AND nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo obrigatório para ajuste.'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;
  IF _movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL',
                        'PARTNER_SHIPMENT', 'PARTNER_RETURN') THEN
    RAISE EXCEPTION 'Este tipo de movimento é gerado pela operação de negócio dedicada.';
  END IF;

  v_direction := CASE _movement_type
    WHEN 'ADJUSTMENT_IN' THEN 'IN'
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
    IF EXISTS (SELECT 1 FROM public.inventory_movements WHERE organization_id=_organization_id AND idempotency_key=_idempotency_key AND (variant_id<>_variant_id OR location_id<>_location_id OR quantity<>_quantity OR movement_type<>_movement_type OR batch_id IS DISTINCT FROM _batch_id OR direction<>v_direction)) THEN RAISE EXCEPTION 'Chave de idempotência já usada com outro conteúdo.'; END IF;
    SELECT id INTO v_existing_id FROM public.inventory_movements
      WHERE organization_id = _organization_id AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT to_jsonb(movements) FROM public.inventory_movements movements
        WHERE movements.id = v_existing_id INTO v_row;
      RETURN jsonb_build_object('deduped', true, 'movement', v_row, 'movement_id', v_existing_id);
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
    'movement_id', (v_row->>'id'),
    'warning', CASE WHEN EXISTS (SELECT 1 FROM public.audit_log WHERE resource_id=v_row->>'id' AND action='inventory.negative_warning') THEN 'Estoque negativo autorizado e auditado.' ELSE NULL END
  );
END;
$$;

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
  v_row jsonb;
  v_out_type public.inventory_movement_type;
  v_in_type public.inventory_movement_type;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuário inválido para esta operação.';
  END IF;
  PERFORM public.inventory_lock(_organization_id);
  IF _transfer_type IS NULL OR _transfer_type NOT IN ('TRANSFER', 'PARTNER_SHIPMENT', 'PARTNER_RETURN') THEN
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

  IF _transfer_type='PARTNER_SHIPMENT' AND NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=_destination_location_id AND type='PARTNER') THEN RAISE EXCEPTION 'Destino deve ser parceiro.'; END IF;
  IF _transfer_type='PARTNER_RETURN' AND NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=_source_location_id AND type='PARTNER') THEN RAISE EXCEPTION 'Origem deve ser parceiro.'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
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
      v_variant_id := (v_item.value->>'variant_id')::uuid;
      v_quantity := (v_item.value->>'quantity')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Item de transferência inválido (variant_id e quantity numérica são obrigatórios).';
    END;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity::text IN ('NaN','Infinity','-Infinity') THEN
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
    v_variant_id := (v_item.value->>'variant_id')::uuid;
    v_quantity := (v_item.value->>'quantity')::numeric;

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
    'warning', CASE WHEN EXISTS (SELECT 1 FROM public.audit_log WHERE action='inventory.negative_warning' AND context->>'reference_id'=v_transfer_id::text) THEN 'Estoque negativo autorizado e auditado.' ELSE NULL END,
    'movement_ids', to_jsonb(v_movement_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_reverse_movement(
 _organization_id uuid, _movement_id uuid, _reason text, _user_id uuid DEFAULT auth.uid()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original public.inventory_movements; m public.inventory_movements; r uuid; result_id uuid; ids uuid[] := '{}';
BEGIN
 IF _user_id IS DISTINCT FROM auth.uid() OR NOT public.has_permission(_organization_id,'inventory.reverse') THEN
   RAISE EXCEPTION 'Sem permissão para reverter movimentos.'; END IF;
 IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo obrigatório para reversão.'; END IF;
 PERFORM public.inventory_lock(_organization_id);
 SELECT * INTO original FROM public.inventory_movements WHERE organization_id=_organization_id AND id=_movement_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento não encontrado.'; END IF;
 IF original.reversal_of_id IS NOT NULL THEN RAISE EXCEPTION 'Uma compensação não pode ser estornada novamente.'; END IF;
 SELECT id INTO result_id FROM public.inventory_movements WHERE reversal_of_id=_movement_id;
 IF FOUND THEN RETURN jsonb_build_object('deduped',true,'movement_id',result_id); END IF;
 IF original.status<>'POSTED' THEN RAISE EXCEPTION 'Somente POSTED pode ser estornado.'; END IF;
 -- Transferências/remessas são compensadas por inteiro, nunca apenas uma perna.
 FOR m IN SELECT * FROM public.inventory_movements WHERE organization_id=_organization_id
   AND (id=_movement_id OR (original.reference_type IN ('TRANSFER','PARTNER_SHIPMENT','PARTNER_RETURN')
     AND reference_id=original.reference_id AND reference_type=original.reference_type))
   AND reversal_of_id IS NULL ORDER BY direction DESC, id
 LOOP
   IF EXISTS (SELECT 1 FROM public.inventory_movements WHERE reversal_of_id=m.id) THEN
     RAISE EXCEPTION 'Operação já possui compensação parcial; requer reconciliação.'; END IF;
   INSERT INTO public.inventory_movements(organization_id,variant_id,location_id,batch_id,movement_type,
     direction,quantity,unit,reference_type,reference_id,reason,created_by,reversal_of_id)
   VALUES(_organization_id,m.variant_id,m.location_id,m.batch_id,'REVERSAL',
     CASE m.direction WHEN 'IN' THEN 'OUT'::public.inventory_movement_direction ELSE 'IN'::public.inventory_movement_direction END,
     m.quantity,m.unit,'REVERSAL',m.id,_reason,_user_id,m.id) RETURNING id INTO r;
   ids:=array_append(ids,r);
   IF m.id=_movement_id THEN result_id:=r; END IF;
 END LOOP;
 INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
 VALUES(_organization_id,_user_id,'inventory.reverse','inventory_movements',_movement_id::text,
   jsonb_build_object('reason',_reason,'reversal_ids',ids));
 RETURN jsonb_build_object('deduped',false,'movement_id',result_id,'movement_ids',ids,
   'warning',CASE WHEN EXISTS (SELECT 1 FROM public.audit_log WHERE action='inventory.negative_warning' AND resource_id=ANY(ids::text[])) THEN 'Estoque negativo autorizado e auditado.' ELSE NULL END);
END;
$$;

-- A contagem bloqueia movimentações na localização até conclusão/cancelamento.
-- Snapshot por lote; nunca usa saldo agregado para ajustar um lote diferente.
REVOKE INSERT, UPDATE ON public.inventory_counts, public.inventory_count_items FROM authenticated;
CREATE FUNCTION public.inventory_start_count(_organization_id uuid,_location_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid; n integer;
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.count') THEN RAISE EXCEPTION 'Sem permissão para contagem.'; END IF;
 PERFORM public.inventory_lock(_organization_id);
 INSERT INTO public.inventory_counts(organization_id,location_id,status,started_at,created_by)
 VALUES(_organization_id,_location_id,'IN_PROGRESS',now(),auth.uid()) RETURNING id INTO c;
 INSERT INTO public.inventory_count_items(organization_id,inventory_count_id,variant_id,batch_id,system_quantity)
 SELECT _organization_id,c,variant_id,batch_id,on_hand FROM public.inventory_balances
 WHERE organization_id=_organization_id AND location_id=_location_id;
 INSERT INTO public.inventory_count_items(organization_id,inventory_count_id,variant_id,system_quantity)
 SELECT _organization_id,c,id,0 FROM public.product_variants v WHERE organization_id=_organization_id AND status='ACTIVE'
 AND NOT EXISTS(SELECT 1 FROM public.inventory_count_items WHERE inventory_count_id=c AND variant_id=v.id);
 SELECT count(*) INTO n FROM public.inventory_count_items WHERE inventory_count_id=c;
 INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
 VALUES(_organization_id,auth.uid(),'inventory.count.create','inventory_counts',c::text,jsonb_build_object('location_id',_location_id,'items',n));
 RETURN jsonb_build_object('id',c,'items',n);
END;
$$;
CREATE FUNCTION public.inventory_save_count_item(_organization_id uuid,_count_id uuid,_item_id uuid,_quantity numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d numeric;
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.count') THEN RAISE EXCEPTION 'Sem permissão para contagem.'; END IF;
 PERFORM public.inventory_lock(_organization_id);
 IF NOT EXISTS(SELECT 1 FROM public.inventory_counts WHERE id=_count_id AND organization_id=_organization_id AND status IN ('IN_PROGRESS','REVIEW')) THEN RAISE EXCEPTION 'Contagem não está aberta.'; END IF;
 IF _quantity<0 OR _quantity::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;
 UPDATE public.inventory_count_items SET counted_quantity=_quantity,difference=_quantity-system_quantity,
 status=CASE WHEN _quantity IS NULL THEN 'PENDING'::public.inventory_count_item_status ELSE 'COUNTED'::public.inventory_count_item_status END
 WHERE id=_item_id AND inventory_count_id=_count_id AND organization_id=_organization_id RETURNING difference INTO d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
 RETURN jsonb_build_object('ok',true,'difference',d);
END;
$$;
CREATE FUNCTION public.inventory_cancel_count(_organization_id uuid,_count_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.count') THEN RAISE EXCEPTION 'Sem permissão para contagem.'; END IF;
 PERFORM public.inventory_lock(_organization_id);
 UPDATE public.inventory_counts SET status='CANCELED' WHERE id=_count_id AND organization_id=_organization_id AND status IN ('DRAFT','IN_PROGRESS','REVIEW');
 IF NOT FOUND THEN RAISE EXCEPTION 'Contagem não está aberta.'; END IF;
 INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id) VALUES(_organization_id,auth.uid(),'inventory.count.cancel','inventory_counts',_count_id::text);
 RETURN jsonb_build_object('ok',true);
END;
$$;

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

  PERFORM public.inventory_lock(_organization_id);
  IF NOT public.has_permission(_organization_id,'inventory.adjust') THEN RAISE EXCEPTION 'Sem permissão para ajustar estoque.'; END IF;
  SELECT * INTO v_count FROM public.inventory_counts
    WHERE id = _count_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contagem não encontrada nesta organização.'; END IF;
  IF v_count.status NOT IN ('IN_PROGRESS', 'REVIEW') THEN
    RAISE EXCEPTION 'Contagem precisa estar em andamento para ser concluída.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.inventory_count_items WHERE inventory_count_id=_count_id AND counted_quantity IS NOT NULL) THEN RAISE EXCEPTION 'Conte ao menos um item.'; END IF;
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
      v_item.batch_id, md5(concat(_count_id, v_item.id)) || ':COUNT',
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

-- Posição agregada no banco. Zero é físico; não representa reserva/disponibilidade.
CREATE VIEW public.inventory_positions WITH (security_invoker=true) AS
SELECT v.organization_id,v.id AS variant_id,l.id AS location_id,p.id AS product_id,p.category_id,
 v.sku,v.barcode,v.size,v.color,v.status AS variant_status,p.name AS product_name,p.code AS product_code,
 l.name AS location_name,l.code AS location_code,l.type AS location_type,l.status AS location_status,
 coalesce(b.on_hand,0) AS on_hand,b.last_movement_at,v.minimum_stock,v.reorder_point,
 coalesce(b.on_hand,0)<v.minimum_stock AS below_minimum
FROM public.product_variants v
JOIN public.products p ON p.id=v.product_id AND p.organization_id=v.organization_id
JOIN public.inventory_locations l ON l.organization_id=v.organization_id
LEFT JOIN (SELECT organization_id,variant_id,location_id,sum(on_hand) on_hand,max(last_movement_at) last_movement_at
 FROM public.inventory_balances GROUP BY organization_id,variant_id,location_id) b
 ON b.organization_id=v.organization_id AND b.variant_id=v.id AND b.location_id=l.id;
REVOKE ALL ON public.inventory_positions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.inventory_query_positions(_organization_id uuid,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1,_page_size integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.read') THEN RAISE EXCEPTION 'Sem permissão para consultar estoque.'; END IF;
 IF _page<1 OR _page_size NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Paginação inválida.'; END IF;
 WITH filtered AS MATERIALIZED (
 SELECT * FROM public.inventory_positions WHERE organization_id=_organization_id
 AND (nullif(_filters->>'locationId','') IS NULL OR location_id=(_filters->>'locationId')::uuid)
 AND (nullif(_filters->>'locationType','') IS NULL OR location_type::text=_filters->>'locationType')
 AND (nullif(_filters->>'productId','') IS NULL OR product_id=(_filters->>'productId')::uuid)
 AND (nullif(_filters->>'categoryId','') IS NULL OR category_id=(_filters->>'categoryId')::uuid)
 AND (nullif(_filters->>'status','') IS NULL OR variant_status::text=_filters->>'status')
 AND (NOT coalesce((_filters->>'onlyBelowMinimum')::boolean,false) OR below_minimum)
 AND (nullif(_filters->>'query','') IS NULL OR strpos(lower(concat_ws(' ',product_name,product_code,sku,barcode,size,color,location_name,location_code)),lower(_filters->>'query'))>0)
 ), paged AS (
 SELECT * FROM filtered ORDER BY product_name,sku,location_name,variant_id,location_id LIMIT _page_size OFFSET (_page-1)*_page_size
 ), grouped AS (
 SELECT CASE WHEN _filters->>'groupBy'='location' THEN location_id ELSE product_id END AS id,
 CASE WHEN _filters->>'groupBy'='location' THEN location_name ELSE product_name END AS name,
 sum(on_hand) AS on_hand FROM filtered GROUP BY 1,2
 )
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged),'[]'::jsonb),
 'total',(SELECT count(*) FROM filtered),'total_on_hand',coalesce((SELECT sum(on_hand) FROM filtered),0),
 'page',_page,'pageSize',_page_size,'groups',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM
 (SELECT * FROM grouped ORDER BY name,id LIMIT _page_size OFFSET (_page-1)*_page_size) g),'[]'::jsonb),
 'group_total',(SELECT count(*) FROM grouped)) INTO result;
 RETURN result;
END;
$$;
CREATE FUNCTION public.inventory_dashboard(_organization_id uuid,_from timestamptz,_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.read') THEN RAISE EXCEPTION 'Sem permissão para consultar estoque.'; END IF;
 RETURN jsonb_build_object(
 'skus_with_balance',(SELECT count(*) FROM (SELECT variant_id FROM public.inventory_balances WHERE organization_id=_organization_id GROUP BY variant_id HAVING sum(on_hand)<>0) q),
 'zero_skus',(SELECT count(*) FROM public.product_variants v WHERE organization_id=_organization_id AND NOT EXISTS (SELECT 1 FROM public.inventory_balances b WHERE b.organization_id=_organization_id AND b.variant_id=v.id GROUP BY variant_id HAVING sum(on_hand)<>0)),
 'in_quantity',(SELECT coalesce(sum(quantity),0) FROM public.inventory_movements WHERE organization_id=_organization_id AND status='POSTED' AND direction='IN' AND occurred_at>=_from AND occurred_at<_to),
 'out_quantity',(SELECT coalesce(sum(quantity),0) FROM public.inventory_movements WHERE organization_id=_organization_id AND status='POSTED' AND direction='OUT' AND occurred_at>=_from AND occurred_at<_to),
 'adjustments',(SELECT count(*) FROM public.inventory_movements WHERE organization_id=_organization_id AND status='POSTED' AND movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT') AND occurred_at>=_from AND occurred_at<_to),
 'open_differences',(SELECT count(*) FROM public.inventory_count_items i JOIN public.inventory_counts c ON c.id=i.inventory_count_id WHERE i.organization_id=_organization_id AND c.status IN ('IN_PROGRESS','REVIEW') AND i.difference<>0),
 'locations',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT l.id,l.name,coalesce(sum(b.on_hand),0) AS on_hand FROM public.inventory_locations l LEFT JOIN public.inventory_balances b ON b.location_id=l.id AND b.organization_id=l.organization_id WHERE l.organization_id=_organization_id GROUP BY l.id,l.name ORDER BY l.name) q),'[]'::jsonb));
END;
$$;
-- Read policies respect explicit permissions, including direct PostgREST calls.
DO $$ DECLARE t text; p text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_locations','inventory_batches','inventory_movements','inventory_transfers','inventory_transfer_items','inventory_counts','inventory_count_items','organization_inventory_settings'] LOOP
   p:=CASE WHEN t='inventory_movements' THEN 'inventory.movements.read' ELSE 'inventory.read' END;
   EXECUTE format('DROP POLICY %I ON public.%I','members read '||t,t);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_permission(organization_id,%L))','members read '||t,t,p);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.inventory_start_count(uuid,uuid),public.inventory_save_count_item(uuid,uuid,uuid,numeric),public.inventory_cancel_count(uuid,uuid),public.inventory_query_positions(uuid,jsonb,integer,integer),public.inventory_dashboard(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_start_count(uuid,uuid),public.inventory_save_count_item(uuid,uuid,uuid,numeric),public.inventory_cancel_count(uuid,uuid),public.inventory_query_positions(uuid,jsonb,integer,integer),public.inventory_dashboard(uuid,timestamptz,timestamptz) TO authenticated;
COMMIT;
