-- =====================================================================
-- MASTER 013 (continuacao) — correcoes de_settings de vendas.
--
-- A migration 20261006100000_sales_orders.sql declarava `v_key text` e
-- recebia `cur.id` (uuid). Ao gravar as politicas, a chamada a `sales_audit`
-- recebia um text onde a assinatura exige uuid e a tela de Configuracoes
-- falhava sempre com "function public.sales_audit(uuid, unknown, unknown,
-- text, jsonb) does not exist". Nenhum teste cobria a escrita: o harness
-- apenas lia as politicas.
--
-- A migration publicada e preservada; a correcao vem em arquivo novo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sales_settings_save(_org uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cur public.sales_order_settings; cfg jsonb; v_key uuid;
 v_field text; v_value text;
BEGIN
 PERFORM public.sales_require(_org,'sales.configure');
 PERFORM public.sales_ensure_settings(_org);
 SELECT * INTO cur FROM public.sales_order_settings WHERE organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Politicas de vendas nao encontradas.'; END IF;
 v_key:=cur.id;
 IF nullif(_data->>'reservation_policy','') IS NOT NULL
    AND _data->>'reservation_policy' NOT IN ('FULL_ONLY','ALLOW_PARTIAL','ALLOW_NEGATIVE_AVAILABLE') THEN
  RAISE EXCEPTION 'Politica de reserva invalida.';
 END IF;
 IF nullif(_data->>'price_override_policy','') IS NOT NULL
    AND _data->>'price_override_policy' NOT IN ('BLOCK','ALLOW_WITH_AUTHORIZATION') THEN
  RAISE EXCEPTION 'Politica de preco invalida.';
 END IF;
 IF nullif(_data->>'receivable_trigger','') IS NOT NULL
    AND _data->>'receivable_trigger' NOT IN ('NONE','ON_APPROVAL','ON_DISPATCH') THEN
  RAISE EXCEPTION 'Gatilho financeiro invalido.';
 END IF;
 IF nullif(_data->>'credit_exposure_policy','') IS NOT NULL
    AND _data->>'credit_exposure_policy' NOT IN ('OPEN_RECEIVABLES_ONLY','OPEN_RECEIVABLES_PLUS_OPEN_ORDERS') THEN
  RAISE EXCEPTION 'Politica de exposicao invalida.';
 END IF;
 IF nullif(_data->>'tracking_mode','') IS NOT NULL
    AND _data->>'tracking_mode' NOT IN ('MANUAL','WEBHOOK') THEN
  RAISE EXCEPTION 'Modo de rastreamento invalido.';
 END IF;
 IF nullif(_data->>'max_discount_percent','') IS NOT NULL
    AND (nullif(_data->>'max_discount_percent','')::numeric<0 OR nullif(_data->>'max_discount_percent','')::numeric>100) THEN
  RAISE EXCEPTION 'Desconto maximo deve estar entre 0 e 100.';
 END IF;
 IF nullif(_data->>'reservation_expiry_hours','') IS NOT NULL
    AND (nullif(_data->>'reservation_expiry_hours','')::int<1 OR nullif(_data->>'reservation_expiry_hours','')::int>8760) THEN
  RAISE EXCEPTION 'Validade da reserva deve estar entre 1 e 8760 horas.';
 END IF;
 -- Uma politica de boolean nunca pode ser gravada a partir de texto livre
 -- fora de 'true'/'false'; a tela envia 'true'/'false' e nao o相反.
 FOR v_key,v_action IN
  SELECT * FROM (VALUES
   ('make_to_order_enabled',_data->>'make_to_order_enabled'),
   ('approval_segregation',_data->>'approval_segregation'),
   ('allow_partial_fulfillment',_data->>'allow_partial_fulfillment'),
   ('shipment_requires_full_confirmation',_data->>'shipment_requires_full_confirmation'),
   ('require_shipping_address',_data->>'require_shipping_address')
  ) AS v(field,value)
 LOOP
  IF v_action IS NOT NULL AND nullif(v_action,'') IS NOT NULL
     AND lower(v_action) NOT IN ('true','false') THEN
   RAISE EXCEPTION 'Valor booleano invalido em %.',v_field;
  END IF;
 END LOOP;
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
 PERFORM public.sales_audit(_org,'sales_settings.updated','sales_order_settings',cur.id,_data);
 RETURN public.sales_settings(_org);
END;
$$;
