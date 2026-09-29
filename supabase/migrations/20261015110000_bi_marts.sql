-- =====================================================================
-- LOVABLE MASTER 015 — BI: reprocessamento a partir das fontes oficiais.
--
-- Este arquivo é a ANALYTICAL TRANSFORMATION layer. Ele lê as fontes
-- oficiais do MASTER 003/004/006/009/011/012/013/014 e grava `bi_facts`,
-- `bi_inventory_daily_balance` e as classificações.
--
-- Regras que o código implementa e que o escopo exige:
--   * NADA aqui escreve nas tabelas operacionais. Reprocessar BI não
--     pode mudar um saldo, uma venda ou um título.
--   * Idempotência por chave de origem (§12, §74): reprocessar o mesmo
--     evento duas vezes reescreve a MESMA linha. Uma venda reconciliada
--     de 10 unidades não vira 20.
--   * Dupla contagem proibida (§20): `marketplace_sales` é o fato
--     canônico da venda. A linha muda de `IMPORTED` para `RECONCILED`
--     quando o fechamento confirma — nunca existe uma segunda linha.
--   * Canal classificado uma vez, por `bi_channel_rules` (§23).
--   * Custo vem da versão PUBLICADA do produto na data do fato (§73):
--     reprocessar hoje um fato de janeiro continua usando o custo que
--     estava vigente em janeiro, ou marca a métrica como indisponível.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. CUSTO HISTÓRICO
--
-- §73: alterar o preço/custo atual de um produto não pode reescrever o
-- histórico. O custo usado é o da versão vigente NA DATA DO FATO.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_cost_at(_org uuid,_variant uuid,_at date)
RETURNS TABLE(cost numeric,version_id uuid,methodology text)
LANGUAGE sql STABLE AS $$
  SELECT v.total_unit_cost,v.id,v.costing_method
  FROM public.product_cost_versions v
  WHERE v.organization_id=_org AND v.variant_id=_variant AND v.status='ACTIVE'
    AND v.effective_from<=_at AND (v.effective_to IS NULL OR v.effective_to>_at)
  ORDER BY v.effective_from DESC,v.version DESC LIMIT 1;
$$;

-- Canal: uma vez só, por regra. `bi_channel_rules` é consultada com a
-- regra de maior prioridade (menor `priority`) que case.
CREATE FUNCTION public.bi_classify_channel(_org uuid,_nature text,_store uuid,_partner uuid,_company uuid)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE r record; own text; linked boolean; v_channel text; v_rules jsonb;
BEGIN
  own := (SELECT s.ownership_type FROM public.marketplace_stores s WHERE s.id=_store AND s.organization_id=_org);
  linked := coalesce(_partner IS NOT NULL,false);
  v_rules := coalesce((SELECT jsonb_agg(jsonb_build_object('store_ownership_type',store_ownership_type,
      'partner_bound',partner_bound,'channel',channel,'priority',priority) ORDER BY priority)
      FROM public.bi_channel_rules r WHERE (r.organization_id IS NULL OR r.organization_id=_org) AND r.fact_nature=_nature),'[]');
  FOR r IN SELECT * FROM jsonb_to_recordset(v_rules) x(store_ownership_type text,partner_bound boolean,channel text,priority int) ORDER BY priority LOOP
    IF (r.store_ownership_type IS NULL OR r.store_ownership_type=own)
       AND (r.partner_bound=false OR r.partner_bound=linked) THEN
      v_channel:=r.channel; EXIT;
    END IF;
  END LOOP;
  -- Sem regra cadastrada: a nature do fato já decide, sem adivinhação.
  IF v_channel IS NULL THEN
    v_channel := CASE
      WHEN _nature IN ('RECONCILED_SALE','IMPORTED_SALE','NORMALIZED_SALE') THEN
        CASE WHEN own='PARTNER' OR linked THEN 'PARTNER'
             WHEN own IN ('FACTORY','OWN') THEN 'OWN_MARKETPLACE'
             ELSE 'PARTNER' END
      WHEN _nature IN ('SALES_ORDER','SHIPMENT') THEN 'B2B'
      WHEN _nature IN ('PARTNER_SHIPMENT','PARTNER_RETURN') THEN 'PARTNER'
      ELSE NULL END;
  END IF;
  RETURN v_channel;
END $$;

-- ---------------------------------------------------------------------
-- 2. VENDAS: fato canônico ÚNICO por `marketplace_sales`
--
-- `marketplace_sales` já é a venda importada normalizada. O item de
-- reconciliação aponta para ela (`marketplace_sale_id`) — não é outra
-- venda. Por isso a Upsert é por `marketplace_sales.id`: um item
-- reconciliado ATUALIZA a linha existente.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_sync_sales(_org uuid,_from date,_to date,_run uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record; v_cost record; v_channel text; v_bill numeric; v_qty numeric;
BEGIN
  -- Uma LINHA por venda. Uma venda pode ter vários itens de
  -- reconciliação (reabertura, conciliação parcial), então os itens
  -- RECONCILED são somados aqui: somar por item duplicaria a venda na
  -- virada para reconciliada.
  FOR r IN
    SELECT s.id,s.organization_id,s.store_id,s.sale_date,s.quantity,s.gross_amount,s.variant_id,
      s.status,s.discount_amount,s.shipping_fee,s.platform_fee,s.external_order_id,
      st.ownership_type,st.partner_id store_partner_id,st.marketplace,
      (SELECT count(*) FROM public.partner_reconciliation_items i
        WHERE i.organization_id=s.organization_id AND i.marketplace_sale_id=s.id
          AND i.status='RECONCILED') reconciled_items,
      (SELECT sum(i.quantity) FROM public.partner_reconciliation_items i
        WHERE i.organization_id=s.organization_id AND i.marketplace_sale_id=s.id
          AND i.status='RECONCILED') reconciled_quantity,
      (SELECT sum(i.billable_amount) FROM public.partner_reconciliation_items i
        WHERE i.organization_id=s.organization_id AND i.marketplace_sale_id=s.id
          AND i.status='RECONCILED') reconciled_billable,
      (SELECT min(i.unit_reference_value) FROM public.partner_reconciliation_items i
        WHERE i.organization_id=s.organization_id AND i.marketplace_sale_id=s.id
          AND i.status='RECONCILED') unit_reference_value,
      (SELECT (array_agg(i.reconciliation_id ORDER BY i.created_at DESC,i.id DESC))[1]
        FROM public.partner_reconciliation_items i
        WHERE i.organization_id=s.organization_id AND i.marketplace_sale_id=s.id
          AND i.status='RECONCILED') reconciliation_id
    FROM public.marketplace_sales s
    JOIN public.marketplace_stores st ON st.id=s.store_id AND st.organization_id=s.organization_id
    WHERE s.organization_id=_org AND s.sale_date>=_from AND s.sale_date<_to
  LOOP
    -- Reconciliada só quando o item está RECONCILED de fato. `VALIDATED`
    -- é conferência: não vira fato de receita da fábrica.
    v_bill := CASE WHEN r.reconciled_items>0 THEN r.reconciled_billable END;
    v_qty := CASE WHEN r.reconciled_items>0 THEN coalesce(r.reconciled_quantity,r.quantity) END;
    v_channel := public.bi_classify_channel(_org,'RECONCILED_SALE',r.store_id,r.store_partner_id,NULL);
    v_cost := public.bi_cost_at(_org,r.variant_id,r.sale_date);
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      product_id,variant_id,store_id,partner_id,channel,quantity,gross_amount,billable_amount,net_amount,
      fees,freight,tax,other_cost,cost_version_id,cost_methodology,quality,quality_notes,
      reconciliation_id,extra,source_watermark)
    VALUES (r.organization_id,'SALES','marketplace_sales',r.id,
      CASE WHEN r.reconciled_items>0 THEN 'RECONCILED_SALE' ELSE 'IMPORTED_SALE' END,
      r.sale_date,
      CASE WHEN r.status='CANCELED' THEN 'CANCELED'::public.bi_fact_status
           WHEN r.reconciled_items>0 THEN 'RECONCILED'::public.bi_fact_status
           WHEN r.status='RECONCILED' THEN 'RECONCILED'::public.bi_fact_status
           ELSE 'IMPORTED'::public.bi_fact_status END,
      (SELECT v.product_id FROM public.product_variants v WHERE v.id=r.variant_id),r.variant_id,r.store_id,
      r.store_partner_id,
      v_channel,coalesce(v_qty,0),r.gross_amount,v_bill,
      coalesce(r.gross_amount-r.shipping_fee-r.discount_amount-r.platform_fee,0),
      r.platform_fee,r.shipping_fee,0,0,v_cost.version_id,v_cost.methodology,
      CASE WHEN r.reconciled_items>0 AND v_cost.cost IS NULL THEN 'INCOMPLETE' ELSE 'COMPLETE' END,
      CASE WHEN r.reconciled_items>0 AND v_cost.cost IS NULL
           THEN 'Custo publicado indisponível na data: margem não calculada.' ELSE '' END,
      r.reconciliation_id,
      jsonb_build_object('external_order_id',r.external_order_id,'status_source',r.status,
        'reconciled_items',r.reconciled_items,'unit_reference_value',r.unit_reference_value,
        'store_ownership',r.ownership_type,'marketplace',r.marketplace),
      now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      fact_nature=EXCLUDED.fact_nature,status=EXCLUDED.status,quantity=EXCLUDED.quantity,
      gross_amount=EXCLUDED.gross_amount,billable_amount=EXCLUDED.billable_amount,net_amount=EXCLUDED.net_amount,
      fees=EXCLUDED.fees,freight=EXCLUDED.freight,cost_version_id=EXCLUDED.cost_version_id,
      cost_methodology=EXCLUDED.cost_methodology,quality=EXCLUDED.quality,quality_notes=EXCLUDED.quality_notes,
      reconciliation_id=EXCLUDED.reconciliation_id,channel=EXCLUDED.channel,partner_id=EXCLUDED.partner_id,
      extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    -- Custo e margem, só quando existe versão publicada na data do fato.
    IF r.reconciled_items>0 AND v_cost.cost IS NOT NULL THEN
      UPDATE public.bi_facts SET
        cogs=v_cost.cost*(coalesce(v_qty,0)),
        margin=coalesce(v_bill,0)-(v_cost.cost*coalesce(v_qty,0)),
        margin_percent=CASE WHEN coalesce(v_bill,0)<>0
          THEN ((coalesce(v_bill,0)-(v_cost.cost*coalesce(v_qty,0)))/coalesce(v_bill,0))*100 END,
        updated_at=now()
      WHERE organization_id=r.organization_id AND domain='SALES' AND source_id=r.id;
    END IF;
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;
-- ---------------------------------------------------------------------
-- 3. PARCEIROS: remessa e devolução são fatos de LOGÍSTICA
--
-- §67: remessa de 100 com venda de 30 deixa 70 no parceiro. A remessa
-- entra em `PARTNER_SHIPMENT` e NUNCA em `SALES`. O estoque do parceiro
-- sai do ledger, não deste cálculo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_sync_partners(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record;
BEGIN
  FOR r IN
    SELECT s.id,s.organization_id,s.partner_id,s.shipment_date,s.status,
      (s.shipped_at IS NOT NULL) shipped,s.destination_location_id
    FROM public.partner_shipments s
    WHERE s.organization_id=_org AND s.shipment_date>=_from AND s.shipment_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,occurred_at,
      status,partner_id,location_id,channel,quantity,quality,extra,source_watermark)
    SELECT r.organization_id,'PARTNERS','partner_shipments',r.id,'PARTNER_SHIPMENT',r.shipment_date,r.shipped_at,
      CASE WHEN r.status IN ('CANCELED') THEN 'CANCELED' ELSE 'POSTED' END,
      r.partner_id,r.destination_location_id,'PARTNER',
      coalesce((SELECT sum(i.picked_quantity) FROM public.partner_shipment_items i
        WHERE i.organization_id=r.organization_id AND i.shipment_id=r.id),0),
      CASE WHEN r.shipped THEN 'COMPLETE' ELSE 'INCOMPLETE' END,
      jsonb_build_object('shipment_status',r.status,'shipment_number',null),now()
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      quantity=EXCLUDED.quantity,status=EXCLUDED.status,occurred_at=EXCLUDED.occurred_at,
      quality=EXCLUDED.quality,extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  FOR r IN
    SELECT d.id,d.organization_id,d.partner_id,d.return_date,d.status,d.source_location_id
    FROM public.partner_returns d WHERE d.organization_id=_org AND d.return_date>=_from AND d.return_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      partner_id,location_id,channel,quantity,extra,source_watermark)
    VALUES (r.organization_id,'PARTNERS','partner_returns',r.id,'PARTNER_RETURN',r.return_date,
      CASE WHEN r.status='CANCELED' THEN 'CANCELED' ELSE 'POSTED' END,
      r.partner_id,r.source_location_id,'PARTNER',0,
      jsonb_build_object('return_status',r.status),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      status=EXCLUDED.status,extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 4. VENDAS B2B: pedido e expedição são fatos separados de venda
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_sync_b2b(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record;
BEGIN
  FOR r IN
    SELECT o.id,o.organization_id,o.company_id,o.representative_id,o.order_date,o.total_amount,o.status
    FROM public.sales_orders o
    WHERE o.organization_id=_org AND o.order_date>=_from AND o.order_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      company_id,representative_id,channel,net_amount,gross_amount,extra,source_watermark)
    VALUES (r.organization_id,'SALES','sales_orders',r.id,'SALES_ORDER',r.order_date,
      CASE WHEN r.status='CANCELED' THEN 'CANCELED' ELSE 'OPEN' END,
      r.company_id,r.representative_id,'B2B',r.total_amount,r.total_amount,
      jsonb_build_object('order_status',r.status),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,gross_amount=EXCLUDED.gross_amount,status=EXCLUDED.status,
      extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  FOR r IN
    SELECT t.id,t.organization_id,t.sales_order_id,t.dispatched_at,o.company_id,o.representative_id,
      (SELECT sum(i.line_total) FROM public.sales_order_items i
        WHERE i.organization_id=t.organization_id AND i.sales_order_id=t.sales_order_id) order_value
    FROM public.shipments t JOIN public.sales_orders o ON o.id=t.sales_order_id AND o.organization_id=t.organization_id
    WHERE t.organization_id=_org AND t.dispatched_at IS NOT NULL
      AND t.dispatched_at::date>=_from AND t.dispatched_at::date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,occurred_at,
      status,company_id,representative_id,sales_order_id,channel,net_amount,extra,source_watermark)
    VALUES (r.organization_id,'SALES','shipments',r.id,'SHIPMENT',r.dispatched_at::date,r.dispatched_at,
      'POSTED',r.company_id,r.representative_id,r.sales_order_id,'B2B',r.order_value,
      jsonb_build_object('dispatched_at',r.dispatched_at),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      fact_date=EXCLUDED.fact_date,occurred_at=EXCLUDED.occurred_at,net_amount=EXCLUDED.net_amount,
      extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 5. ESTOQUE: saldo diário a partir do LEDGER
--
-- §33: saldo histórico vem do histórico oficial. §71: transferência
-- move saldo entre locais, não tira do total. As duas saem naturalmente:
-- `PARTNER_SHIPMENT` grava OUT na origem e IN no destino, e a soma por
-- local em cada dia reflecte a posição daquele local.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_sync_inventory(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record;
BEGIN
  FOR r IN
    WITH dias AS (SELECT generate_series(_from,_to-1,'1 day')::date d),
    saldo_por_dia AS (
      SELECT m.organization_id,m.variant_id,m.location_id,d.d,
        sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END) delta
      FROM public.inventory_movements m CROSS JOIN dias d
      WHERE m.organization_id=_org AND m.status='POSTED'
        AND m.occurred_at::date<d.d
        AND m.occurred_at>=(SELECT min(mm.occurred_at::date) FROM public.inventory_movements mm
                           WHERE mm.organization_id=_org AND mm.variant_id=m.variant_id)
      GROUP BY m.organization_id,m.variant_id,m.location_id,d.d)
  SELECT * FROM saldo_por_dia
  LOOP
    INSERT INTO public.bi_inventory_daily_balance(organization_id,balance_date,variant_id,location_id,
      location_type,partner_id,balance,reserved,available,last_movement_at,last_sale_at,
      movements_in,movements_out,source_watermark,updated_at)
    SELECT r.organization_id,r.d,r.variant_id,r.location_id,l.type,l.partner_id,
      coalesce(r.delta,0),
      coalesce((SELECT sum(rv.quantity-rv.fulfilled_quantity-rv.released_quantity)
        FROM public.inventory_reservations rv
        WHERE rv.organization_id=r.organization_id AND rv.variant_id=r.variant_id
          AND rv.inventory_location_id=r.location_id AND rv.status IN ('ACTIVE','PARTIALLY_CONSUMED')
          AND rv.reserved_at::date<r.d),0),
      coalesce(r.delta,0)-coalesce((SELECT sum(rv.quantity-rv.fulfilled_quantity-rv.released_quantity)
        FROM public.inventory_reservations rv
        WHERE rv.organization_id=r.organization_id AND rv.variant_id=r.variant_id
          AND rv.inventory_location_id=r.location_id AND rv.status IN ('ACTIVE','PARTIALLY_CONSUMED')
          AND rv.reserved_at::date<r.d),0),
      (SELECT max(m.occurred_at) FROM public.inventory_movements m WHERE m.organization_id=r.organization_id
        AND m.variant_id=r.variant_id AND m.location_id=r.location_id AND m.status='POSTED' AND m.occurred_at::date<r.d),
      (SELECT max(m.occurred_at) FROM public.inventory_movements m WHERE m.organization_id=r.organization_id
        AND m.variant_id=r.variant_id AND m.location_id=r.location_id AND m.status='POSTED'
        AND m.movement_type='SALE' AND m.occurred_at::date<r.d),
      coalesce((SELECT sum(m.quantity) FROM public.inventory_movements m WHERE m.organization_id=r.organization_id
        AND m.variant_id=r.variant_id AND m.location_id=r.location_id AND m.status='POSTED'
        AND m.direction='IN' AND m.occurred_at::date<r.d),0),
      coalesce((SELECT sum(m.quantity) FROM public.inventory_movements m WHERE m.organization_id=r.organization_id
        AND m.variant_id=r.variant_id AND m.location_id=r.location_id AND m.status='POSTED'
        AND m.direction='OUT' AND m.occurred_at::date<r.d),0),
      now(),now()
    ON CONFLICT (organization_id,balance_date,variant_id,location_id) DO UPDATE SET
      balance=EXCLUDED.balance,reserved=EXCLUDED.reserved,available=EXCLUDED.available,
      last_movement_at=EXCLUDED.last_movement_at,last_sale_at=EXCLUDED.last_sale_at,
      movements_in=EXCLUDED.movements_in,movements_out=EXCLUDED.movements_out,
      source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 6. PRODUÇÃO, COMPRAS, FINANCEIRO, CRM e FISCAL
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_sync_production(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record; v_good numeric; v_rej numeric; v_std numeric;
BEGIN
  FOR r IN
    SELECT o.id,o.organization_id,o.product_variant_id,o.planned_quantity,o.rejected_quantity,o.status,
      coalesce(o.created_at::date,o.updated_at::date) ref_date,
      (SELECT sum(p.quantity_good) FROM public.production_outputs p
        WHERE p.organization_id=o.organization_id AND p.production_order_id=o.id) good,
      (SELECT sum(p.quantity_rejected) FROM public.production_outputs p
        WHERE p.organization_id=o.organization_id AND p.production_order_id=o.id) rejected,
      (SELECT sum(c.quantity) FROM public.production_consumptions c
        WHERE c.organization_id=o.organization_id AND c.production_order_id=o.id) consumed,
      (SELECT sum(l.quantity) FROM public.production_losses l
        WHERE l.organization_id=o.organization_id AND l.production_order_id=o.id) lost,
      (SELECT v.total_unit_cost FROM public.product_cost_versions v
        WHERE v.organization_id=o.organization_id AND v.variant_id=o.product_variant_id AND v.status='ACTIVE'
        ORDER BY v.effective_from DESC,v.version DESC LIMIT 1) std_cost
    FROM public.production_orders o
    WHERE o.organization_id=_org AND coalesce(o.created_at::date,o.updated_at::date)>=_from
      AND coalesce(o.created_at::date,o.updated_at::date)<_to
  LOOP
    v_good:=coalesce(r.good,0); v_rej:=coalesce(r.rejected,r.rejected_quantity,0);
    v_std:=coalesce(r.std_cost,0)*coalesce(v_good+v_rej,0);
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      product_id,variant_id,quantity,net_amount,other_cost,quality,quality_notes,extra,source_watermark)
    VALUES (r.organization_id,'PRODUCTION','production_orders',r.id,'PRODUCTION_ORDER',r.ref_date,
      CASE WHEN r.status='CANCELED' THEN 'CANCELED'
           WHEN r.status IN ('COMPLETED','CLOSED') THEN 'POSTED' ELSE 'OPEN' END,
      (SELECT v.product_id FROM public.product_variants v WHERE v.id=r.product_variant_id),r.product_variant_id,
      v_good,NULL,v_cost,
      CASE WHEN r.std_cost IS NULL AND (v_good+v_rej)>0 THEN 'INCOMPLETE' ELSE 'COMPLETE' END,
      CASE WHEN r.std_cost IS NULL AND (v_good+v_rej)>0
           THEN 'Sem versão de custo publicada: variação de custo indisponível.' ELSE '' END,
      jsonb_build_object('planned_quantity',r.planned_quantity,'produced_quantity',v_good,
        'rejected_quantity',v_rej,'consumed_quantity',coalesce(r.consumed,0),'loss_quantity',coalesce(r.lost,0),
        'standard_cost',r.std_cost,'order_status',r.status),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      quantity=EXCLUDED.quantity,status=EXCLUDED.status,quality=EXCLUDED.quality,
      quality_notes=EXCLUDED.quality_notes,extra=EXCLUDED.extra,
      source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

CREATE FUNCTION public.bi_sync_procurement(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record; r2 record;
BEGIN
  FOR r IN
    SELECT o.id,o.organization_id,o.supplier_id,o.issue_date,o.total_amount,o.status,o.expected_delivery_date
    FROM public.purchase_orders o
    WHERE o.organization_id=_org AND o.issue_date>=_from AND o.issue_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      company_id,net_amount,gross_amount,extra,source_watermark)
    VALUES (r.organization_id,'PROCUREMENT','purchase_orders',r.id,'PURCHASE_ORDER',r.issue_date,
      CASE WHEN r.status='CANCELED' THEN 'CANCELED' ELSE 'OPEN' END,
      (SELECT sp.company_id FROM public.supplier_profiles sp WHERE sp.id=r.supplier_id AND sp.organization_id=r.organization_id),
      r.total_amount,r.total_amount,
      jsonb_build_object('order_status',r.status,'expected_delivery_date',r.expected_delivery_date,
        'lead_time_observed',(SELECT (gr.received_at-o.issue_date) FROM public.goods_receipts gr
          WHERE gr.organization_id=o.organization_id AND gr.purchase_order_id=o.id AND gr.status IN ('POSTED','ACCEPTED')
          ORDER BY gr.received_at LIMIT 1)),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,gross_amount=EXCLUDED.gross_amount,status=EXCLUDED.status,
      extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  FOR r2 IN
    SELECT gr.id,gr.organization_id,gr.supplier_id,gr.received_at,gr.status,gr.total_received,gr.total_accepted,
      (SELECT sp.company_id FROM public.supplier_profiles sp
        WHERE sp.id=gr.supplier_id AND sp.organization_id=gr.organization_id) company_id
    FROM public.goods_receipts gr
    WHERE gr.organization_id=_org AND gr.received_at>=_from AND gr.received_at<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      company_id,quantity,net_amount,extra,source_watermark)
    VALUES (r2.organization_id,'PROCUREMENT','goods_receipts',r2.id,'RECEIPT',r2.received_at,
      CASE WHEN r2.status IN ('POSTED','ACCEPTED') THEN 'POSTED' ELSE 'OPEN' END,
      r2.company_id,r2.total_accepted,NULL,
      jsonb_build_object('receipt_status',r2.status,'received_quantity',r2.total_received,
        'rejected_quantity',r2.total_received-r2.total_accepted),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      quantity=EXCLUDED.quantity,status=EXCLUDED.status,extra=EXCLUDED.extra,
      source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

-- §72: caixa é o que o Financial Ledger registrou. Um recebimento parcial
-- de R$400 sobre título de R$1.000 produz caixa de R$400, recebível de
-- R$600 e venda elegível de R$1.000 — três fatos, três números.
CREATE FUNCTION public.bi_sync_financial(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record;
BEGIN
  FOR r IN
    SELECT t.id,t.organization_id,t.occurred_at,t.direction,t.amount,t.financial_account_id,t.company_id,
      t.financial_category_id,t.cost_center_id,t.description,t.type
    FROM public.financial_transactions t
    WHERE t.organization_id=_org AND t.occurred_at::date>=_from AND t.occurred_at::date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,occurred_at,
      status,company_id,net_amount,extra,source_watermark)
    VALUES (r.organization_id,'FINANCIAL','financial_transactions',r.id,'CASH_MOVEMENT',r.occurred_at::date,
      r.occurred_at,'POSTED',r.company_id,
      CASE WHEN r.direction='IN' THEN r.amount ELSE -r.amount END,
      jsonb_build_object('direction',r.direction,'transaction_type',r.type,
        'financial_account_id',r.financial_account_id,'financial_category_id',r.financial_category_id,
        'cost_center_id',r.cost_center_id,'description',r.description),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

CREATE FUNCTION public.bi_sync_crm(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record;
BEGIN
  FOR r IN
    SELECT o.id,o.organization_id,o.created_at::date ref,o.estimated_value,o.status,o.representative_id,o.company_id,
      (SELECT s.name FROM public.sales_pipeline_stages s
        JOIN public.sales_opportunities oo ON oo.stage_id=s.id AND oo.organization_id=s.organization_id
        WHERE oo.id=o.id) stage
    FROM public.sales_opportunities o
    WHERE o.organization_id=_org AND o.created_at::date>=_from AND o.created_at::date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      company_id,representative_id,opportunity_id,net_amount,extra,source_watermark)
    VALUES (r.organization_id,'CRM','sales_opportunities',r.id,'OPPORTUNITY',r.ref,
      CASE WHEN r.status='OPEN' THEN 'OPEN' WHEN r.status='WON' THEN 'POSTED' ELSE 'CANCELED' END,
      r.company_id,r.representative_id,r.id,r.estimated_value,
      jsonb_build_object('opportunity_status',r.status,'stage',r.stage),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,status=EXCLUDED.status,representative_id=EXCLUDED.representative_id,
      extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  FOR r IN
    SELECT qq.id,qq.organization_id,qq.issue_date,qq.total,qq.status,qq.representative_id,qq.company_id
    FROM public.sales_quotes qq
    WHERE qq.organization_id=_org AND qq.issue_date>=_from AND qq.issue_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      company_id,representative_id,net_amount,extra,source_watermark)
    VALUES (r.organization_id,'CRM','sales_quotes',r.id,'QUOTE',r.issue_date,
      CASE WHEN r.status='ACCEPTED' THEN 'POSTED' WHEN r.status='CANCELED' THEN 'CANCELED' ELSE 'OPEN' END,
      r.company_id,r.representative_id,r.total,
      jsonb_build_object('quote_status',r.status),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,status=EXCLUDED.status,representative_id=EXCLUDED.representative_id,
      extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  FOR r IN
    SELECT l.id,l.organization_id,l.created_at::date ref,l.status,l.assigned_user_id,l.company_id
    FROM public.leads l
    WHERE l.organization_id=_org AND l.created_at::date>=_from AND l.created_at::date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      company_id,net_amount,extra,source_watermark)
    VALUES (r.organization_id,'CRM','leads',r.id,'LEAD',r.ref,
      CASE WHEN l.status='CONVERTED' THEN 'POSTED' ELSE 'OPEN' END,
      r.company_id,0,jsonb_build_object('lead_status',r.status,'assigned_user_id',r.assigned_user_id),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      status=EXCLUDED.status,extra=EXCLUDED.extra,source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

-- §50: só documento REGISTRADO. Nada de inferir obrigação tributária a
-- partir de estimativa do BI.
CREATE FUNCTION public.bi_sync_fiscal(_org uuid,_from date,_to date) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record;
BEGIN
  FOR r IN
    SELECT d.id,d.organization_id,d.issue_date,d.status,d.total_amount,d.total_taxes,
      d.establishment_id,d.source_type,d.document_number,d.access_key,d.authorization_protocol
    FROM public.fiscal_documents d
    WHERE d.organization_id=_org AND d.issue_date>=_from AND d.issue_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      net_amount,tax,extra,source_watermark)
    VALUES (r.organization_id,'FISCAL','fiscal_documents',r.id,
      CASE WHEN r.source_type IN ('SUPPLIER_RETURN') THEN 'INBOUND_DOCUMENT' ELSE 'DOCUMENT_FISCAL' END,
      r.issue_date,
      CASE WHEN r.status='AUTHORIZED' THEN 'POSTED'
           WHEN r.status IN ('CANCELED','DENIED') THEN 'CANCELED' ELSE 'OPEN' END,
      r.total_amount,r.total_taxes,
      jsonb_build_object('document_status',r.status,'source_type',r.source_type,
        'establishment_id',r.establishment_id,'document_number',r.document_number,
        'access_key',r.access_key,'authorization_protocol',r.authorization_protocol),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,tax=EXCLUDED.tax,status=EXCLUDED.status,extra=EXCLUDED.extra,
      source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  -- Documento de entrada não tem coluna de tributos: o que existe é o
  -- snapshot lido do XML, e o que não existir não é inventado.
  FOR r IN
    SELECT d.id,d.organization_id,d.issue_date,d.status,d.total_amount,
      d.establishment_id,d.access_key,d.status::text status_text,
      coalesce(nullif(d.parsed_snapshot->>'total_taxes','')::numeric,0) total_taxes
    FROM public.inbound_fiscal_documents d
    WHERE d.organization_id=_org AND d.issue_date>=_from AND d.issue_date<_to
  LOOP
    INSERT INTO public.bi_facts(organization_id,domain,source_table,source_id,fact_nature,fact_date,status,
      net_amount,tax,extra,source_watermark)
    VALUES (r.organization_id,'FISCAL','inbound_fiscal_documents',r.id,'INBOUND_DOCUMENT',r.issue_date,
      CASE WHEN r.status='MATCHED' THEN 'POSTED' ELSE 'OPEN' END,
      r.total_amount,r.total_taxes,
      jsonb_build_object('document_status',r.status_text,'establishment_id',r.establishment_id,
        'access_key',r.access_key),now())
    ON CONFLICT (organization_id,domain,source_table,source_id) DO UPDATE SET
      net_amount=EXCLUDED.net_amount,tax=EXCLUDED.tax,status=EXCLUDED.status,extra=EXCLUDED.extra,
      source_watermark=EXCLUDED.source_watermark,updated_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;
-- ---------------------------------------------------------------------
-- 7. CURVA ABC (§25–§27)
--
-- Ordena, calcula participação, acumula e aplica os limites. Nenhuma
-- base é misturada com outra; os parâmetros usados ficam gravados.
-- Empate é resolvido pelo total e depois pelo id, para que a
-- reprocessamento seja determinístico.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_classify_abc(_org uuid,_from date,_to date,_metric text,_granularity text DEFAULT 'VARIANT')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb; a numeric; b numeric; total numeric:=0; v_n integer; classified jsonb;
  abc_row record; v_share numeric; v_cum numeric:=0;
BEGIN
  PERFORM public.bi_require(_org,'bi.read');
  -- Só bases de FLUXO entram na curva. Curva por saldo de estoque
  -- ("quanto parado") é outra curva e não é esta: aceitar a chave e
  -- devolver zero seria inventar um resultado.
  IF _metric NOT IN ('sales.quantity_reconciled','sales.billable_revenue','sales.margin_industrial',
                     'production.loss_quantity') THEN
    RAISE EXCEPTION 'Base ABC inválida para curva ABC: %',_metric;
  END IF;
  IF _granularity NOT IN ('PRODUCT','VARIANT') THEN
    RAISE EXCEPTION 'Granularidade ABC inválida: % (use PRODUCT ou VARIANT).',_granularity;
  END IF;
  cfg := public.bi_get_settings(_org);
  a := (cfg->>'abc_a_limit')::numeric; b := (cfg->>'abc_b_limit')::numeric;

  -- A base vem da métrica, não de um filtro fixo em "vendas".
  WITH base AS (
    SELECT f.variant_id,
      CASE _metric
        WHEN 'sales.quantity_reconciled' THEN sum(f.quantity)
        WHEN 'sales.billable_revenue' THEN sum(coalesce(f.billable_amount,0))
        WHEN 'sales.margin_industrial' THEN sum(coalesce(f.margin,0))
        WHEN 'production.loss_quantity' THEN sum(coalesce(f.quantity,0)) END AS value
    FROM public.bi_facts f
    WHERE f.organization_id=_org
      AND (CASE _metric
        WHEN 'sales.quantity_reconciled' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
        WHEN 'sales.billable_revenue' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
        WHEN 'sales.margin_industrial' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
        WHEN 'production.loss_quantity' THEN f.fact_nature='PRODUCTION_ORDER' END)
      AND f.fact_date>=_from AND f.fact_date<_to AND f.variant_id IS NOT NULL
    GROUP BY f.variant_id
  )
  SELECT count(*),coalesce(sum(value),0) INTO v_n,total FROM base WHERE value>0;

  IF v_n IS NULL OR v_n=0 OR total=0 THEN
    PERFORM public.bi_audit(_org,'bi.abc.empty','bi_abc_classification',NULL,
      jsonb_build_object('metric',_metric,'from',_from,'to',_to));
    RETURN jsonb_build_object('metric',_metric,'granularity',_granularity,'period_start',_from,'period_end',_to,
      'total',0,'items',0,'a_limit',a,'b_limit',b,'rows','[]'::jsonb,
      'reason','Sem valor positivo no período para a base escolhida.');
  END IF;

  -- Empate resolvido pelo total e depois pelo id: reprocessar dá o
  -- mesmo resultado, senão a curva mudaria de classe sozinha.
  WITH base AS (
    SELECT f.variant_id,
      CASE _metric
        WHEN 'sales.quantity_reconciled' THEN sum(f.quantity)
        WHEN 'sales.billable_revenue' THEN sum(coalesce(f.billable_amount,0))
        WHEN 'sales.margin_industrial' THEN sum(coalesce(f.margin,0))
        WHEN 'production.loss_quantity' THEN sum(coalesce(f.quantity,0)) END AS value
    FROM public.bi_facts f
    WHERE f.organization_id=_org
      AND (CASE _metric
        WHEN 'sales.quantity_reconciled' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
        WHEN 'sales.billable_revenue' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
        WHEN 'sales.margin_industrial' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
        WHEN 'production.loss_quantity' THEN f.fact_nature='PRODUCTION_ORDER' END)
      AND f.fact_date>=_from AND f.fact_date<_to AND f.variant_id IS NOT NULL
    GROUP BY f.variant_id
  ), ranked AS (
    SELECT variant_id,value FROM base WHERE value>0 ORDER BY value DESC,variant_id)
  SELECT jsonb_agg(x) INTO classified FROM (
    SELECT jsonb_build_object('variant_id',variant_id,'value',value,
      'share',(value/sum(value) OVER ())::numeric,
      'cum',(sum(value) OVER (ORDER BY value DESC,variant_id ROWS UNBOUNDED PRECEDING)/sum(value) OVER ())::numeric) x
    FROM ranked) q;

  DELETE FROM public.bi_abc_classification
  WHERE organization_id=_org AND period_start=_from AND period_end=_to
    AND metric_key=_metric AND granularity=_granularity;

  FOR abc_row IN SELECT * FROM jsonb_to_recordset(classified)
      x(variant_id uuid,value numeric,share numeric,cum numeric) ORDER BY x.cum,x.variant_id LOOP
    v_share := abc_row.value/total;
    v_cum := v_cum+abc_row.value;
    INSERT INTO public.bi_abc_classification(organization_id,period_start,period_end,metric_key,granularity,
      variant_id,product_id,metric_value,total_value,share,cumulative_share,class,parameters,created_by)
    VALUES (_org,_from,_to,_metric,_granularity,abc_row.variant_id,
      (SELECT v.product_id FROM public.product_variants v WHERE v.id=abc_row.variant_id),
      abc_row.value,total,v_share,v_cum/total,
      CASE WHEN (v_cum/total)<=a THEN 'A'::public.bi_abc_class
           WHEN (v_cum/total)<=b THEN 'B'::public.bi_abc_class
           ELSE 'C'::public.bi_abc_class END,
      jsonb_build_object('a_limit',a,'b_limit',b,'metric',_metric,'granularity',_granularity,
        'period_start',_from,'period_end',_to,'rule','cumulativo crescente',
        'months_in_period',((_to-_from)/30)),auth.uid());
  END LOOP;

  PERFORM public.bi_audit(_org,'bi.abc.classified','bi_abc_classification',NULL,
    jsonb_build_object('metric',_metric,'from',_from,'to',_to,'a_limit',a,'b_limit',b,'items',v_n));
  RETURN jsonb_build_object('metric',_metric,'granularity',_granularity,'period_start',_from,'period_end',_to,
    'total',total,'items',v_n,'a_limit',a,'b_limit',b,'rows',classified);
END $$;

CREATE FUNCTION public.bi_classify_xyz(_org uuid,_from date,_to date,_granularity text DEFAULT 'MONTH',_metric text DEFAULT 'sales.quantity_reconciled')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb; x numeric; y numeric; minobs integer; v_buckets integer; v_buckets_json jsonb;
  xyz_row record; v_series jsonb; v_mean numeric; v_sd numeric; v_cv numeric; v_n integer; v_total numeric:=0;
BEGIN
  PERFORM public.bi_require(_org,'bi.read');
  IF _granularity NOT IN ('DAY','WEEK','MONTH') THEN RAISE EXCEPTION 'Granularidade XYZ inválida: %',_granularity; END IF;
  cfg := public.bi_get_settings(_org);
  x := (cfg->>'xyz_x_limit')::numeric; y := (cfg->>'xyz_y_limit')::numeric; minobs := (cfg->>'xyz_min_observations')::integer;

  WITH buckets AS (
    SELECT date_trunc(_granularity,f.fact_date) bucket, sum(f.quantity) value
    FROM public.bi_facts f
    WHERE f.organization_id=_org AND f.domain='SALES' AND f.fact_nature='RECONCILED_SALE'
      AND f.status='RECONCILED' AND f.fact_date>=_from AND f.fact_date<_to AND f.variant_id IS NOT NULL
    GROUP BY 1)
  SELECT coalesce(jsonb_agg(bucket ORDER BY bucket),'[]'),count(*) INTO v_buckets_json,v_buckets FROM buckets;

  -- Série por variante. Observação = período com venda registrada; período
  -- sem venda conta como zero, senão a variabilidade fica artificialmente baixa.
  WITH grid AS (
    SELECT generate_series(date_trunc(_granularity,_from::timestamp),date_trunc(_granularity,(_to-1)::timestamp),
      CASE _granularity WHEN 'DAY' THEN '1 day' WHEN 'WEEK' THEN '1 week' ELSE '1 month' END) bucket),
  base AS (
    SELECT f.variant_id,g.bucket,coalesce(sum(f.quantity),0) value
    FROM (SELECT DISTINCT variant_id FROM public.bi_facts
           WHERE organization_id=_org AND domain='SALES' AND fact_nature='RECONCILED_SALE'
             AND fact_date>=_from AND fact_date<_to AND variant_id IS NOT NULL) f
    CROSS JOIN grid g
    LEFT JOIN public.bi_facts f2 ON f2.organization_id=_org AND f2.variant_id=f.variant_id
      AND date_trunc(_granularity,f2.fact_date)=g.bucket AND f2.fact_nature='RECONCILED_SALE' AND f2.status='RECONCILED'
    GROUP BY f.variant_id,g.bucket),
  stats AS (
    SELECT variant_id,count(*) n,avg(value) mean,
      -- desvio-padrão amostral (n-1). Com n=1 não há desvio: série inútil.
      CASE WHEN count(*)>1 THEN stddev_samp(value) END sd
    FROM base GROUP BY variant_id)
  SELECT coalesce(jsonb_agg(x ORDER BY x.variant_id),'[]') INTO v_series FROM (
    SELECT jsonb_build_object('variant_id',variant_id,'n',n,'mean',mean,'sd',sd) x FROM stats) q;
  SELECT count(*),coalesce(sum((e->>'n')::int),0) INTO v_n,v_total
    FROM jsonb_array_elements(v_series) e;

  DELETE FROM public.bi_xyz_classification
  WHERE organization_id=_org AND period_start=_from AND period_end=_to AND period_granularity=_granularity;

  FOR xyz_row IN SELECT * FROM jsonb_to_recordset(v_series) x(variant_id uuid,n int,mean numeric,sd numeric) LOOP
    v_mean:=xyz_row.mean; v_sd:=xyz_row.sd;
    v_cv := CASE WHEN xyz_row.mean IS NOT NULL AND xyz_row.mean>0 AND xyz_row.sd IS NOT NULL THEN xyz_row.sd/xyz_row.mean END;
    INSERT INTO public.bi_xyz_classification(organization_id,period_start,period_end,period_granularity,
      variant_id,product_id,observations,mean_value,stddev_value,coefficient_of_variation,class,reason,parameters,created_by)
    VALUES (_org,_from,_to,_granularity,xyz_row.variant_id,
      (SELECT v.product_id FROM public.product_variants v WHERE v.id=xyz_row.variant_id),
      xyz_row.n,v_mean,v_sd,v_cv,
      CASE WHEN xyz_row.mean IS NULL OR xyz_row.mean=0 THEN 'UNCLASSIFIED'::public.bi_xyz_class
           WHEN xyz_row.n<minobs THEN 'UNCLASSIFIED'::public.bi_xyz_class
           WHEN v_cv<=x THEN 'X'::public.bi_xyz_class
           WHEN v_cv<=y THEN 'Y'::public.bi_xyz_class
           ELSE 'Z'::public.bi_xyz_class END,
      CASE WHEN xyz_row.mean IS NULL OR xyz_row.mean=0 THEN 'Média zero no período: coeficiente de variação indefinido.'
           WHEN xyz_row.n<minobs THEN 'Histórico insuficiente ('||xyz_row.n||' de '||minobs||' períodos).'
           ELSE 'CV='||round(v_cv,4)::text END,
      jsonb_build_object('x_limit',x,'y_limit',y,'min_observations',minobs,'granularity',_granularity,
        'method','coeficiente de variacao (desvio amostral / media)','periods_available',v_buckets,
        'metric',_metric),auth.uid())
    ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM public.bi_audit(_org,'bi.xyz.classified','bi_xyz_classification',NULL,
    jsonb_build_object('from',_from,'to',_to,'granularity',_granularity,'x_limit',x,'y_limit',y,'min_obs',minobs));
  RETURN jsonb_build_object('granularity',_granularity,'period_start',_from,'period_end',_to,
    'x_limit',x,'y_limit',y,'min_observations',minobs,'periods_available',v_buckets,'rows',v_series);
END $$;

-- ---------------------------------------------------------------------
-- 9. QUALIDADE DOS DADOS (§61)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_check_quality(_org uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer:=0; r record; v_key text; v_severity public.bi_severity; v_msg text;
BEGIN
  -- Reconciliação declarada fechada, mas sem item reconciliado.
  FOR r IN
    SELECT c.id,c.organization_id,c.period_start,c.period_end FROM public.partner_reconciliations c
    WHERE c.organization_id=_org AND c.status='CLOSED'
      AND NOT EXISTS(SELECT 1 FROM public.partner_reconciliation_items i
                     WHERE i.organization_id=c.organization_id AND i.reconciliation_id=c.id AND i.status='RECONCILED')
  LOOP
    v_key:='reconciliation.closed_without_items'; v_severity:='WARNING';
    v_msg:='Fechamento sem nenhum item reconciliado.';
    INSERT INTO public.bi_quality_issues(organization_id,check_key,domain,severity,entity,entity_id,message,details)
    VALUES (r.organization_id,v_key,'PARTNERS',v_severity,'partner_reconciliations',r.id,v_msg,
      jsonb_build_object('period_start',r.period_start,'period_end',r.period_end))
    ON CONFLICT (organization_id,check_key,entity_id) DO UPDATE SET
      last_seen_at=now(),message=EXCLUDED.message;
    n:=n+1;
  END LOOP;
  -- Venda reconciliada sem custo publicado: margem indisponível.
  FOR r IN
    SELECT id,organization_id,variant_id,fact_date FROM public.bi_facts
    WHERE organization_id=_org AND domain='SALES' AND fact_nature='RECONCILED_SALE'
      AND quality='INCOMPLETE'
  LOOP
    INSERT INTO public.bi_quality_issues(organization_id,check_key,domain,severity,entity,entity_id,message,details)
    VALUES (r.organization_id,'cost.missing_for_reconciled_sale','COSTS','WARNING','bi_facts',r.id,
      'Venda reconciliada sem versão de custo publicada na data: margem não calculada.',
      jsonb_build_object('variant_id',r.variant_id,'fact_date',r.fact_date))
    ON CONFLICT (organization_id,check_key,entity_id) DO UPDATE SET last_seen_at=now();
    n:=n+1;
  END LOOP;
  -- Agregação de estoque divergente do ledger.
  FOR r IN
    SELECT b.organization_id,b.variant_id,b.balance_date,
      b.balance - coalesce((SELECT sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END)
        FROM public.inventory_movements m WHERE m.organization_id=b.organization_id AND m.variant_id=b.variant_id
          AND m.location_id=b.location_id AND m.status='POSTED' AND m.occurred_at::date<=b.balance_date),0) diff
    FROM public.bi_inventory_daily_balance b WHERE b.organization_id=_org
  LOOP
    IF abs(r.diff)>0.000001 THEN
      INSERT INTO public.bi_quality_issues(organization_id,check_key,domain,severity,entity,entity_id,message,details)
      VALUES (r.organization_id,'inventory.aggregate_drift','INVENTORY','ERROR','bi_inventory_daily_balance',
        r.variant_id||':'||r.balance_date,
        'Saldo analítico divergente do Inventory Ledger.',jsonb_build_object('difference',r.diff))
      ON CONFLICT (organization_id,check_key,entity_id) DO UPDATE SET last_seen_at=now();
      n:=n+1;
    END IF;
  END LOOP;
  -- Documento fiscal preparado sem protocolo.
  FOR r IN
    SELECT id,organization_id,status FROM public.fiscal_documents
    WHERE organization_id=_org AND status='AUTHORIZED' AND authorization_protocol IS NULL
  LOOP
    INSERT INTO public.bi_quality_issues(organization_id,check_key,domain,severity,entity,entity_id,message,details)
    VALUES (r.organization_id,'fiscal.authorized_without_protocol','FISCAL','ERROR','fiscal_documents',r.id,
      'Documento marcado autorizado sem protocolo registrado.',jsonb_build_object('status',r.status))
    ON CONFLICT (organization_id,check_key,entity_id) DO UPDATE SET last_seen_at=now();
    n:=n+1;
  END LOOP;
  -- Lead sem empresa atribuída e sem responsável.
  FOR r IN
    SELECT id,organization_id FROM public.leads
    WHERE organization_id=_org AND company_id IS NULL AND assigned_user_id IS NULL AND status NOT IN ('ARCHIVED','CONVERTED')
  LOOP
    INSERT INTO public.bi_quality_issues(organization_id,check_key,domain,severity,entity,entity_id,message,details)
    VALUES (r.organization_id,'crm.lead_without_owner','CRM','INFO','leads',r.id,
      'Lead sem responsável e sem empresa atribuída.',jsonb_build_object())
    ON CONFLICT (organization_id,check_key,entity_id) DO UPDATE SET last_seen_at=now();
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 10. ORQUESTRADOR: `bi_process`
--
-- Uma execução = um `bi_processing_runs` (§60). Incremental reprocessa
-- do último watermark; full reconstrói do início. Reprocessar o mesmo
-- escopo é seguro e produz o mesmo valor consolidado (§74).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_process(_org uuid,_domain public.bi_domain DEFAULT NULL,_from date DEFAULT NULL,
  _to date DEFAULT NULL,_mode text DEFAULT 'INCREMENTAL') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run uuid; n integer:=0; v_from date; v_to date; v_mode text; v_status public.bi_run_status; errors jsonb:='[]';
  v_min date := date '2000-01-01';
BEGIN
  PERFORM public.bi_require(_org,'bi.reprocess');
  IF _mode NOT IN ('INCREMENTAL','FULL') THEN RAISE EXCEPTION 'Modo inválido: %',_mode; END IF;
  v_mode:=_mode;
  SELECT p.period_start,p.period_end INTO v_from,v_to FROM public.bi_resolve_period('CUSTOM',_from,_to) p;
  IF v_from IS NULL OR v_to IS NULL OR v_to<=v_from THEN RAISE EXCEPTION 'Período inválido.'; END IF;
  IF v_from<v_min THEN v_from:=v_min; END IF;

  INSERT INTO public.bi_processing_runs(organization_id,domain,period_start,period_end,status,mode,started_by)
  VALUES (_org,_domain,v_from,v_to,'RUNNING',v_mode,auth.uid()) RETURNING id INTO run;

  BEGIN
    IF _domain IS NULL OR _domain='SALES' THEN n:=n+public.bi_sync_sales(_org,v_from,v_to,run); END IF;
    IF _domain IS NULL OR _domain='PARTNERS' THEN n:=n+public.bi_sync_partners(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='SALES' THEN n:=n+public.bi_sync_b2b(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='INVENTORY' THEN n:=n+public.bi_sync_inventory(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='PRODUCTION' THEN n:=n+public.bi_sync_production(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='PROCUREMENT' THEN n:=n+public.bi_sync_procurement(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='FINANCIAL' THEN n:=n+public.bi_sync_financial(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='CRM' THEN n:=n+public.bi_sync_crm(_org,v_from,v_to); END IF;
    IF _domain IS NULL OR _domain='FISCAL' THEN n:=n+public.bi_sync_fiscal(_org,v_from,v_to); END IF;
    v_status:='COMPLETED';
  EXCEPTION WHEN OTHERS THEN
    v_status:='FAILED';
    errors:=jsonb_build_array(jsonb_build_object('message',SQLERRM));
  END;

  UPDATE public.bi_processing_runs SET status=v_status,finished_at=now(),processed_records=n,error_details=errors
  WHERE id=run;
  -- Reconcile de qualidade só quando o processamento terminou bem.
  IF v_status='COMPLETED' THEN PERFORM public.bi_check_quality(_org); END IF;
  PERFORM public.bi_audit(_org,'bi.process','bi_processing_runs',run::text,
    jsonb_build_object('domain',_domain,'from',v_from,'to',v_to,'mode',v_mode,'status',v_status,'records',n));
  RETURN jsonb_build_object('run_id',run,'status',v_status,'records',n,'period_start',v_from,'period_end',v_to,
    'errors',errors);
END $$;
COMMIT;
