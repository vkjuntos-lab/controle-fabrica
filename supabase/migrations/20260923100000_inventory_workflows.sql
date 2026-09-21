-- Complemento do MASTER 003: APIs de contagem, lotes, auditoria e retries.
BEGIN;

CREATE OR REPLACE FUNCTION public.inventory_post_movement_internal(
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
      'allow_negative', coalesce((SELECT allow_negative_inventory FROM public.organization_inventory_settings WHERE organization_id=_organization_id),false)
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
BEGIN
 IF _reference_type IN ('INVENTORY_COUNT','TRANSFER','PARTNER_SHIPMENT','PARTNER_RETURN','REVERSAL') THEN
   RAISE EXCEPTION 'Referência reservada à operação dedicada.';
 END IF;
 RETURN public.inventory_post_movement_internal(_organization_id,_variant_id,_location_id,_movement_type,
   _quantity,_reason,_occurred_at,_unit,_reference_type,_reference_id,_batch_id,_idempotency_key,_direction,_user_id,_allow_negative_override);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_post_movement_internal(uuid,uuid,uuid,public.inventory_movement_type,numeric,text,timestamptz,text,text,uuid,uuid,text,public.inventory_movement_direction,uuid,boolean) FROM PUBLIC,anon,authenticated;

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

    v_posted := public.inventory_post_movement_internal(
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

CREATE OR REPLACE FUNCTION public.inventory_start_count(_organization_id uuid,_location_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid; n integer;
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.count') THEN RAISE EXCEPTION 'Sem permissão para contagem.'; END IF;
 PERFORM public.inventory_lock(_organization_id);
 IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=_location_id AND organization_id=_organization_id AND status='ACTIVE') THEN RAISE EXCEPTION 'Localização inválida.'; END IF;
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

ALTER TABLE public.inventory_transfers ADD COLUMN request_payload jsonb;
ALTER TABLE public.inventory_transfer_items ADD COLUMN batch_id uuid REFERENCES public.inventory_batches(id);

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
  v_batch_id uuid;
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
      IF EXISTS(SELECT 1 FROM public.inventory_transfers WHERE id=v_existing_id AND
       (source_location_id<>_source_location_id OR destination_location_id<>_destination_location_id
        OR transfer_type<>_transfer_type OR (request_payload IS NOT NULL AND request_payload<>_items))) THEN
        RAISE EXCEPTION 'Chave de idempotência já usada com outro conteúdo.'; END IF;
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
    v_batch_id := (v_item.value->>'batch_id')::uuid;
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
    notes, idempotency_key, request_payload
  ) VALUES (
    _organization_id, _source_location_id, _destination_location_id, _transfer_type,
    'COMPLETED', now(), now(), _user_id, _user_id, _notes, _idempotency_key, _items
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.inventory_transfer_items (
    organization_id, transfer_id, variant_id, quantity, batch_id
  )
  SELECT _organization_id, v_transfer_id,
         (it->>'variant_id')::uuid, (it->>'quantity')::numeric, (it->>'batch_id')::uuid
  FROM jsonb_array_elements(_items) AS it;

  -- Movimentos OUT (origem) + IN (destino) na mesma transação.
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) AS it
  LOOP
    v_variant_id := (v_item.value->>'variant_id')::uuid;
    v_quantity := (v_item.value->>'quantity')::numeric;
    v_batch_id := (v_item.value->>'batch_id')::uuid;

    INSERT INTO public.inventory_movements (
      organization_id, variant_id, location_id, batch_id,
      movement_type, direction, quantity, unit,
      reference_type, reference_id, reason, occurred_at, created_by, status
    ) VALUES (
      _organization_id, v_variant_id, _source_location_id, v_batch_id,
      v_out_type, 'OUT', v_quantity, 'un',
      _transfer_type, v_transfer_id, _notes, now(), _user_id, 'POSTED'
    ) RETURNING id INTO v_movement_id;
    v_movement_ids := array_append(v_movement_ids, v_movement_id);

    INSERT INTO public.inventory_movements (
      organization_id, variant_id, location_id, batch_id,
      movement_type, direction, quantity, unit,
      reference_type, reference_id, reason, occurred_at, created_by, status
    ) VALUES (
      _organization_id, v_variant_id, _destination_location_id, v_batch_id,
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

CREATE FUNCTION public.inventory_read_count(_organization_id uuid,_count_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.read') THEN RAISE EXCEPTION 'Sem permissão para consultar contagem.'; END IF;
 SELECT to_jsonb(c)||jsonb_build_object('location_name',l.name,'location_code',l.code,'items',coalesce((
  SELECT jsonb_agg(jsonb_build_object('id',i.id,'variant_id',i.variant_id,'sku',v.sku,'barcode',v.barcode,
   'product_name',p.name,'size',v.size,'color',v.color,'batch_id',i.batch_id,'batch_code',b.batch_code,
   'system_quantity',i.system_quantity,'counted_quantity',i.counted_quantity,'difference',i.difference,'status',i.status)
   ORDER BY p.name,v.sku,b.batch_code) FROM public.inventory_count_items i
   JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=v.product_id
   LEFT JOIN public.inventory_batches b ON b.id=i.batch_id WHERE i.inventory_count_id=c.id AND i.organization_id=_organization_id),'[]'::jsonb))
 INTO result FROM public.inventory_counts c JOIN public.inventory_locations l ON l.id=c.location_id
 WHERE c.id=_count_id AND c.organization_id=_organization_id;
 IF result IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada.'; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.inventory_read_count(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_read_count(uuid,uuid) TO authenticated;
-- Audit location/settings changes atomically, including direct authorized API writes.
CREATE FUNCTION public.inventory_audit_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
 INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
 VALUES(NEW.organization_id,auth.uid(),'inventory.'||CASE TG_TABLE_NAME WHEN 'inventory_locations' THEN 'location' ELSE 'settings' END||'.'||lower(TG_OP),
 TG_TABLE_NAME,NEW.id::text,jsonb_build_object('before',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,'after',to_jsonb(NEW)));
 RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_location_audit AFTER INSERT OR UPDATE ON public.inventory_locations FOR EACH ROW EXECUTE FUNCTION public.inventory_audit_catalog();
CREATE TRIGGER inventory_settings_audit AFTER INSERT OR UPDATE ON public.organization_inventory_settings FOR EACH ROW EXECUTE FUNCTION public.inventory_audit_catalog();
REVOKE ALL ON FUNCTION public.inventory_audit_catalog() FROM PUBLIC,anon,authenticated;
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
    'location_id',NEW.location_id,'batch_id',NEW.batch_id,'reference_id',NEW.reference_id,'unit',NEW.unit));
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.inventory_search_variants(_organization_id uuid,_query text DEFAULT '',_active_only boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.read') AND NOT public.has_permission(_organization_id,'inventory.movements.read') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT v.id,v.sku,v.size,v.color,p.name AS product_name,
 concat_ws(' — ',v.sku,p.name,concat_ws(' / ',v.size,v.color)) AS label
 FROM public.product_variants v JOIN public.products p ON p.id=v.product_id AND p.organization_id=v.organization_id
 WHERE v.organization_id=_organization_id AND (NOT _active_only OR v.status='ACTIVE')
 AND (coalesce(_query,'')='' OR strpos(lower(concat_ws(' ',v.sku,v.barcode,p.name,v.size,v.color)),lower(_query))>0)
 ORDER BY CASE WHEN v.barcode=_query OR v.sku=_query THEN 0 ELSE 1 END,v.sku,v.id LIMIT 50)q),'[]'::jsonb);
END;
$$;
CREATE FUNCTION public.inventory_list_counts(_organization_id uuid,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.read') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 IF _page<1 THEN RAISE EXCEPTION 'Página inválida.'; END IF;
 RETURN jsonb_build_object('total',(SELECT count(*) FROM public.inventory_counts WHERE organization_id=_organization_id),
 'rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (
 SELECT c.*,l.name AS location_name,coalesce(p.full_name,p.email,c.created_by::text) AS responsible,
 (SELECT count(*) FROM public.inventory_count_items WHERE inventory_count_id=c.id) AS items_count,
 (SELECT count(*) FROM public.inventory_count_items WHERE inventory_count_id=c.id AND counted_quantity IS NOT NULL) AS counted_count,
 (SELECT count(*) FROM public.inventory_count_items WHERE inventory_count_id=c.id AND difference<>0) AS differences
 FROM public.inventory_counts c JOIN public.inventory_locations l ON l.id=c.location_id LEFT JOIN public.profiles p ON p.id=c.created_by
 WHERE c.organization_id=_organization_id ORDER BY c.created_at DESC,c.id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.inventory_actor_options(_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission(_organization_id,'inventory.movements.read') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT p.id,coalesce(p.full_name,p.email,p.id::text) AS name
 FROM public.profiles p WHERE EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.user_id=p.id)
 OR EXISTS(SELECT 1 FROM public.inventory_movements m WHERE m.organization_id=_organization_id AND m.created_by=p.id)
 ORDER BY name)q),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.inventory_search_variants(uuid,text,boolean),public.inventory_list_counts(uuid,integer),public.inventory_actor_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_search_variants(uuid,text,boolean),public.inventory_list_counts(uuid,integer),public.inventory_actor_options(uuid) TO authenticated;

COMMIT;
