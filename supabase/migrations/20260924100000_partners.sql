-- MASTER 006. Remessa não é venda. Estoque permanece exclusivamente no ledger.
BEGIN;
CREATE TABLE public.companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 code text NOT NULL CHECK(length(trim(code))>0), legal_name text NOT NULL CHECK(length(trim(legal_name))>0),
 trade_name text, document_type text CHECK(document_type IN ('CNPJ','CPF','OTHER')), document_number text,
 state_registration text,email text,phone text,website text,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','BLOCKED')),
 notes text,blocked_reason text,blocked_at timestamptz,blocked_by uuid REFERENCES public.profiles,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles,updated_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,code), UNIQUE(organization_id,id), UNIQUE(organization_id,document_type,document_number)
);
CREATE TABLE public.company_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL,role text NOT NULL CHECK(role IN ('PARTNER','CUSTOMER','SUPPLIER','RESELLER')),
 FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),UNIQUE(company_id,role)
);
CREATE TABLE public.company_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL,name text NOT NULL CHECK(length(trim(name))>0),title text,email text,phone text,whatsapp text,
 is_primary boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id)
);
CREATE UNIQUE INDEX company_primary_contact ON public.company_contacts(company_id) WHERE is_primary AND status='ACTIVE';
CREATE TABLE public.company_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL,type text NOT NULL DEFAULT 'SHIPPING' CHECK(type IN ('HEADQUARTERS','SHIPPING','BILLING','OTHER')),
 postal_code text,street text NOT NULL CHECK(length(trim(street))>0),number text,complement text,district text,city text NOT NULL CHECK(length(trim(city))>0),state text,country text NOT NULL DEFAULT 'BR',
 is_primary boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id)
);
CREATE UNIQUE INDEX company_primary_address ON public.company_addresses(company_id,type) WHERE is_primary;
CREATE TABLE public.partner_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL,partner_code text NOT NULL,operational_status text NOT NULL DEFAULT 'ACTIVE' CHECK(operational_status IN ('ACTIVE','INACTIVE','BLOCKED')),
 settlement_frequency text NOT NULL DEFAULT 'MONTHLY' CHECK(settlement_frequency IN ('WEEKLY','BIWEEKLY','MONTHLY','CUSTOM')),
 default_inventory_location_id uuid REFERENCES public.inventory_locations,notes text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),UNIQUE(company_id),UNIQUE(organization_id,id),UNIQUE(organization_id,partner_code)
);
-- partner_id da localização agora aponta o perfil operacional (legados sem perfil continuam válidos).
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_partner_fk FOREIGN KEY(partner_id) REFERENCES public.partner_profiles(id) NOT VALID;
ALTER TABLE public.inventory_locations ADD COLUMN operational_purpose text NOT NULL DEFAULT 'NORMAL' CHECK(operational_purpose IN ('NORMAL','QUARANTINE','INSPECTION'));
CREATE TABLE public.partner_shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 shipment_number text NOT NULL,partner_id uuid NOT NULL,source_location_id uuid NOT NULL REFERENCES public.inventory_locations,
 destination_location_id uuid NOT NULL REFERENCES public.inventory_locations,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PICKING','SHIPPED','DELIVERED','PARTIALLY_RETURNED','RETURNED','CANCELED')),
 shipment_date date NOT NULL DEFAULT current_date,expected_delivery_date date,shipped_at timestamptz,delivered_at timestamptz,received_by text,
 carrier_name text,tracking_code text,notes text,created_by uuid REFERENCES public.profiles,approved_by uuid REFERENCES public.profiles,
 transfer_id uuid REFERENCES public.inventory_transfers,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,partner_id) REFERENCES public.partner_profiles(organization_id,id),UNIQUE(organization_id,shipment_number),UNIQUE(organization_id,id),CHECK(source_location_id<>destination_location_id)
);
CREATE TABLE public.partner_shipment_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,shipment_id uuid NOT NULL,
 variant_id uuid NOT NULL REFERENCES public.product_variants,batch_id uuid REFERENCES public.inventory_batches,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<100000000000),picked_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(picked_quantity>=0 AND picked_quantity<=quantity),notes text,
 FOREIGN KEY(organization_id,shipment_id) REFERENCES public.partner_shipments(organization_id,id),UNIQUE NULLS NOT DISTINCT(shipment_id,variant_id,batch_id)
);
CREATE TABLE public.partner_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 return_number text NOT NULL,partner_id uuid NOT NULL,shipment_id uuid,source_location_id uuid NOT NULL REFERENCES public.inventory_locations,
 destination_location_id uuid NOT NULL REFERENCES public.inventory_locations,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','RECEIVED','CANCELED')),
 return_date date NOT NULL DEFAULT current_date,received_at timestamptz,notes text,created_by uuid REFERENCES public.profiles,
 transfer_id uuid REFERENCES public.inventory_transfers,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,partner_id) REFERENCES public.partner_profiles(organization_id,id),
 FOREIGN KEY(organization_id,shipment_id) REFERENCES public.partner_shipments(organization_id,id),
 UNIQUE(organization_id,return_number),UNIQUE(organization_id,id),CHECK(source_location_id<>destination_location_id)
);
CREATE TABLE public.partner_return_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,return_id uuid NOT NULL,
 variant_id uuid NOT NULL REFERENCES public.product_variants,batch_id uuid REFERENCES public.inventory_batches,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<100000000000),condition text NOT NULL CHECK(condition IN ('SELLABLE','DAMAGED','DEFECTIVE','OTHER')),
 reason text NOT NULL CHECK(length(trim(reason))>0),notes text,
 FOREIGN KEY(organization_id,return_id) REFERENCES public.partner_returns(organization_id,id),UNIQUE NULLS NOT DISTINCT(return_id,variant_id,batch_id)
);
CREATE INDEX company_contacts_org_company ON public.company_contacts(organization_id,company_id);
CREATE INDEX company_addresses_org_company ON public.company_addresses(organization_id,company_id);
CREATE INDEX inventory_locations_partner ON public.inventory_locations(organization_id,partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX partner_shipments_org_date ON public.partner_shipments(organization_id,shipment_date DESC,id);
CREATE INDEX partner_shipments_partner ON public.partner_shipments(organization_id,partner_id,status);
CREATE INDEX partner_returns_org_date ON public.partner_returns(organization_id,return_date DESC,id);
CREATE INDEX partner_returns_shipment ON public.partner_returns(shipment_id);
CREATE INDEX partner_shipment_items_parent ON public.partner_shipment_items(shipment_id);
CREATE INDEX partner_return_items_parent ON public.partner_return_items(return_id);

-- Mesmas permissões/funções de organização; escrita de domínio somente via RPC transacional.
DO $$ DECLARE t text; perm text; BEGIN
 FOREACH t IN ARRAY ARRAY['companies','company_roles','company_contacts','company_addresses','partner_profiles','partner_shipments','partner_shipment_items','partner_returns','partner_return_items'] LOOP
  perm:=CASE WHEN t IN ('partner_shipments','partner_shipment_items') THEN 'partner_shipments.read' WHEN t IN ('partner_returns','partner_return_items') THEN 'partner_returns.read' ELSE 'partners.read' END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
END $$;
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor','estoque']) r CROSS JOIN unnest(ARRAY[
 'partners.read','partners.create','partners.update','partners.block','partner_contacts.manage','partner_addresses.manage',
 'partner_shipments.read','partner_shipments.create','partner_shipments.approve','partner_shipments.pick','partner_shipments.ship','partner_shipments.receive','partner_shipments.cancel',
 'partner_returns.read','partner_returns.create','partner_returns.receive','partner_inventory.read','partner_inventory.adjust']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['comercial','financeiro','marketplace','producao']) r CROSS JOIN unnest(ARRAY['partners.read','partner_shipments.read','partner_returns.read','partner_inventory.read']) p ON CONFLICT DO NOTHING;
CREATE FUNCTION public.partner_require(_org uuid,_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Sem permissão: %.',_permission; END IF; END;
$$;
CREATE FUNCTION public.partner_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context) VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;
CREATE FUNCTION public.partner_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW); pair text[]; v_org uuid; b record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico não pode ser excluído.'; END IF;
 IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='partner_shipment_items' THEN
  IF (to_jsonb(NEW)-'picked_quantity')<>(to_jsonb(OLD)-'picked_quantity') OR
    NOT EXISTS(SELECT 1 FROM public.partner_shipments WHERE id=(j->>'shipment_id')::uuid AND status='PICKING') THEN
   RAISE EXCEPTION 'Item histórico imutável; somente separação em PICKING.';
  END IF;
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='partner_return_items' THEN
  RAISE EXCEPTION 'Item de devolução imutável.';
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='partner_shipments' THEN
  IF (to_jsonb(NEW)-ARRAY['status','shipped_at','delivered_at','received_by','approved_by','transfer_id','updated_at']) <>
     (to_jsonb(OLD)-ARRAY['status','shipped_at','delivered_at','received_by','approved_by','transfer_id','updated_at']) THEN
   RAISE EXCEPTION 'Dados históricos da remessa imutáveis.';
  END IF;
  IF OLD.transfer_id IS NOT NULL AND (NEW.transfer_id IS DISTINCT FROM OLD.transfer_id OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at) THEN RAISE EXCEPTION 'Expedição consolidada imutável.'; END IF;
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='partner_returns' THEN
  IF OLD.status='RECEIVED' OR (to_jsonb(NEW)-ARRAY['status','received_at','transfer_id','updated_at'])<>(to_jsonb(OLD)-ARRAY['status','received_at','transfer_id','updated_at']) THEN RAISE EXCEPTION 'Devolução histórica imutável.'; END IF;
 END IF;
 IF TG_OP='INSERT' AND TG_TABLE_NAME='partner_shipment_items' AND NOT EXISTS(SELECT 1 FROM public.partner_shipments WHERE id=(j->>'shipment_id')::uuid AND status='DRAFT') THEN RAISE EXCEPTION 'Itens apenas em rascunho.'; END IF;
 IF TG_OP='INSERT' AND TG_TABLE_NAME='partner_return_items' AND NOT EXISTS(SELECT 1 FROM public.partner_returns WHERE id=(j->>'return_id')::uuid AND status='DRAFT') THEN RAISE EXCEPTION 'Itens apenas em rascunho.'; END IF;
 FOREACH pair SLICE 1 IN ARRAY ARRAY[['variant_id','product_variants'],['batch_id','inventory_batches'],['source_location_id','inventory_locations'],['destination_location_id','inventory_locations'],['default_inventory_location_id','inventory_locations']] LOOP
  IF j->>pair[1] IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',pair[2]) INTO v_org USING (j->>pair[1])::uuid;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
 END LOOP;
 IF TG_TABLE_NAME='partner_profiles' AND j->>'default_inventory_location_id' IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=(j->>'default_inventory_location_id')::uuid AND type='PARTNER' AND partner_id=NEW.id) THEN RAISE EXCEPTION 'Localização padrão não pertence ao parceiro.'; END IF;
 END IF;
 IF j->>'batch_id' IS NOT NULL THEN
  SELECT * INTO b FROM public.inventory_batches WHERE id=(j->>'batch_id')::uuid;
  IF b.variant_id<>(j->>'variant_id')::uuid THEN RAISE EXCEPTION 'Lote de outra variante.'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['companies','company_roles','company_contacts','company_addresses','partner_profiles','partner_shipments','partner_shipment_items','partner_returns','partner_return_items'] LOOP
  EXECUTE format('CREATE TRIGGER partner_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.partner_guard()',t);
 END LOOP;
END $$;
CREATE FUNCTION public.partner_save_company(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid:=coalesce(_id,gen_random_uuid()); p uuid; loc uuid; doc text; typ text; old_status text;
BEGIN
 PERFORM public.partner_require(_org,CASE WHEN _id IS NULL THEN 'partners.create' ELSE 'partners.update' END);
 PERFORM public.inventory_lock(_org);
 IF jsonb_typeof(coalesce(_data->'roles','["PARTNER"]'))<>'array' OR jsonb_array_length(coalesce(_data->'roles','["PARTNER"]'))=0 THEN RAISE EXCEPTION 'Informe ao menos uma relação comercial.'; END IF;
 typ:=nullif(_data->>'document_type','');doc:=nullif(regexp_replace(upper(_data->>'document_number'),'[. /-]','','g'),'');
 IF doc IS NOT NULL AND (typ IS NULL OR (typ='CPF' AND doc!~'^[0-9]{11}$') OR (typ='CNPJ' AND doc!~'^[A-Z0-9]{12}[0-9]{2}$')) THEN RAISE EXCEPTION 'Formato de documento inválido.'; END IF;
 IF _id IS NOT NULL THEN
  SELECT status INTO old_status FROM public.companies WHERE id=c AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
 END IF;
 IF _data->>'status'='BLOCKED' OR old_status='BLOCKED' THEN
  PERFORM public.partner_require(_org,'partners.block');
  IF _data->>'status'='BLOCKED' AND nullif(trim(_data->>'blocked_reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo do bloqueio obrigatório.'; END IF;
 END IF;
 INSERT INTO public.companies(id,organization_id,code,legal_name,trade_name,document_type,document_number,state_registration,email,phone,website,status,notes,blocked_reason,blocked_at,blocked_by,created_by,updated_by)
 VALUES(c,_org,trim(_data->>'code'),trim(_data->>'legal_name'),_data->>'trade_name',typ,doc,_data->>'state_registration',_data->>'email',_data->>'phone',_data->>'website',coalesce(_data->>'status','ACTIVE'),_data->>'notes',_data->>'blocked_reason',CASE WHEN _data->>'status'='BLOCKED' THEN now() END,CASE WHEN _data->>'status'='BLOCKED' THEN auth.uid() END,auth.uid(),auth.uid())
 ON CONFLICT(id) DO UPDATE SET code=excluded.code,legal_name=excluded.legal_name,trade_name=excluded.trade_name,document_type=excluded.document_type,document_number=excluded.document_number,state_registration=excluded.state_registration,email=excluded.email,phone=excluded.phone,website=excluded.website,status=excluded.status,notes=excluded.notes,blocked_reason=excluded.blocked_reason,blocked_at=excluded.blocked_at,blocked_by=excluded.blocked_by,updated_by=auth.uid(),updated_at=now();
 -- Papéis são relacionais; remoção não apaga fatos de histórico (registro pode ser reativado).
 INSERT INTO public.company_roles(organization_id,company_id,role) SELECT _org,c,value FROM jsonb_array_elements_text(coalesce(_data->'roles','["PARTNER"]')) ON CONFLICT DO NOTHING;
 SELECT id INTO p FROM public.partner_profiles WHERE company_id=c;
 IF p IS NULL AND EXISTS(SELECT 1 FROM public.company_roles WHERE company_id=c AND role='PARTNER') THEN
  p:=gen_random_uuid();loc:=gen_random_uuid();
  INSERT INTO public.partner_profiles(id,organization_id,company_id,partner_code,settlement_frequency) VALUES(p,_org,c,_data->>'code',coalesce(_data->>'settlement_frequency','MONTHLY'));
  INSERT INTO public.inventory_locations(id,organization_id,code,name,type,partner_id,created_by,updated_by) VALUES(loc,_org,'PARTNER-'||p::text,'Parceiro — '||(_data->>'legal_name'),'PARTNER',p,auth.uid(),auth.uid());
  UPDATE public.partner_profiles SET default_inventory_location_id=loc WHERE id=p;
 END IF;
 UPDATE public.partner_profiles SET operational_status=coalesce(_data->>'status','ACTIVE'),settlement_frequency=coalesce(_data->>'settlement_frequency',settlement_frequency),updated_at=now() WHERE id=p;
 PERFORM public.partner_audit(_org,CASE WHEN _id IS NULL THEN 'partner.company.create' WHEN _data->>'status'='BLOCKED' THEN 'partner.block' ELSE 'partner.company.update' END,'companies',c,_data);
 RETURN c;
END;
$$;
CREATE FUNCTION public.partner_save_detail(_org uuid,_company uuid,_kind text,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid());
BEGIN
 IF _kind NOT IN ('contact','address') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
 PERFORM public.partner_require(_org,CASE _kind WHEN 'contact' THEN 'partner_contacts.manage' ELSE 'partner_addresses.manage' END);
 PERFORM public.inventory_lock(_org);
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_company AND organization_id=_org) THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
 IF _kind='contact' THEN
  IF _id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_contacts WHERE id=v AND company_id=_company AND organization_id=_org) THEN RAISE EXCEPTION 'Contato não encontrado.'; END IF;
  IF coalesce((_data->>'is_primary')::boolean,false) THEN UPDATE public.company_contacts SET is_primary=false WHERE company_id=_company; END IF;
  INSERT INTO public.company_contacts(id,organization_id,company_id,name,title,email,phone,whatsapp,is_primary,status,notes)
  VALUES(v,_org,_company,_data->>'name',_data->>'title',_data->>'email',_data->>'phone',_data->>'whatsapp',coalesce((_data->>'is_primary')::boolean,false),coalesce(_data->>'status','ACTIVE'),_data->>'notes')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,title=excluded.title,email=excluded.email,phone=excluded.phone,whatsapp=excluded.whatsapp,is_primary=excluded.is_primary,status=excluded.status,notes=excluded.notes,updated_at=now();
 ELSE
  IF _id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_addresses WHERE id=v AND company_id=_company AND organization_id=_org) THEN RAISE EXCEPTION 'Endereço não encontrado.'; END IF;
  IF coalesce((_data->>'is_primary')::boolean,false) THEN UPDATE public.company_addresses SET is_primary=false WHERE company_id=_company AND type=coalesce(_data->>'type','SHIPPING'); END IF;
  INSERT INTO public.company_addresses(id,organization_id,company_id,type,postal_code,street,number,complement,district,city,state,country,is_primary)
  VALUES(v,_org,_company,coalesce(_data->>'type','SHIPPING'),_data->>'postal_code',_data->>'street',_data->>'number',_data->>'complement',_data->>'district',_data->>'city',_data->>'state',coalesce(nullif(_data->>'country',''),'BR'),coalesce((_data->>'is_primary')::boolean,false))
  ON CONFLICT(id) DO UPDATE SET type=excluded.type,postal_code=excluded.postal_code,street=excluded.street,number=excluded.number,complement=excluded.complement,district=excluded.district,city=excluded.city,state=excluded.state,country=excluded.country,is_primary=excluded.is_primary,updated_at=now();
 END IF;
 PERFORM public.partner_audit(_org,'partner.'||_kind||'.save',CASE _kind WHEN 'contact' THEN 'company_contacts' ELSE 'company_addresses' END,v,jsonb_build_object('company_id',_company,'data',_data));
 RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_transfer_internal(
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
REVOKE ALL ON FUNCTION public.inventory_transfer_internal(uuid,uuid,uuid,jsonb,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.inventory_post_transfer(
 _organization_id uuid,_source_location_id uuid,_destination_location_id uuid,_items jsonb,
 _transfer_type text DEFAULT 'TRANSFER',_notes text DEFAULT NULL,_idempotency_key text DEFAULT NULL,_user_id uuid DEFAULT auth.uid()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.partner_require(_organization_id,CASE WHEN _transfer_type='TRANSFER' THEN 'inventory.transfer' ELSE 'inventory.move' END);
 IF EXISTS(SELECT 1 FROM public.inventory_locations WHERE id IN (_source_location_id,_destination_location_id) AND partner_id IS NOT NULL) THEN RAISE EXCEPTION 'Use o domínio de remessas/devoluções para localizações vinculadas a parceiros.'; END IF;
 RETURN public.inventory_transfer_internal(_organization_id,_source_location_id,_destination_location_id,_items,_transfer_type,_notes,_idempotency_key,_user_id);
END;
$$;
CREATE FUNCTION public.partner_create_operation(_org uuid,_kind text,_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=gen_random_uuid();p public.partner_profiles; c public.companies; it jsonb; src public.inventory_locations; dst public.inventory_locations; linked public.partner_shipments;
BEGIN
 IF _kind NOT IN ('shipment','return') THEN RAISE EXCEPTION 'Operação inválida.'; END IF;
 PERFORM public.partner_require(_org,CASE _kind WHEN 'shipment' THEN 'partner_shipments.create' ELSE 'partner_returns.create' END);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO p FROM public.partner_profiles WHERE id=(_data->>'partner_id')::uuid AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro não encontrado.'; END IF;
 SELECT * INTO c FROM public.companies WHERE id=p.company_id;
 IF _kind='shipment' AND (c.status<>'ACTIVE' OR p.operational_status<>'ACTIVE') THEN RAISE EXCEPTION 'Parceiro inativo ou bloqueado: %',coalesce(c.blocked_reason,''); END IF;
 SELECT * INTO src FROM public.inventory_locations WHERE id=(_data->>'source_location_id')::uuid AND organization_id=_org AND status='ACTIVE';
 SELECT * INTO dst FROM public.inventory_locations WHERE id=(_data->>'destination_location_id')::uuid AND organization_id=_org AND status='ACTIVE';
 IF src.id IS NULL OR dst.id IS NULL OR src.id=dst.id THEN RAISE EXCEPTION 'Origem/destino inválidos.'; END IF;
 IF _kind='shipment' AND (dst.type<>'PARTNER' OR dst.partner_id IS DISTINCT FROM p.id OR src.type='PARTNER') THEN RAISE EXCEPTION 'Destino deve pertencer ao parceiro; origem deve ser da organização.'; END IF;
 IF _kind='return' AND (src.type<>'PARTNER' OR src.partner_id IS DISTINCT FROM p.id OR dst.type='PARTNER') THEN RAISE EXCEPTION 'Origem deve pertencer ao parceiro; destino deve ser da organização.'; END IF;
 IF jsonb_typeof(_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(_data->'items')=0 THEN RAISE EXCEPTION 'Informe itens.'; END IF;
 IF _kind='shipment' THEN
  INSERT INTO public.partner_shipments(id,organization_id,shipment_number,partner_id,source_location_id,destination_location_id,shipment_date,expected_delivery_date,notes,carrier_name,tracking_code,created_by)
  VALUES(v,_org,'REM-'||v::text,p.id,src.id,dst.id,coalesce((_data->>'date')::date,current_date),nullif(_data->>'expected_delivery_date','')::date,_data->>'notes',_data->>'carrier_name',_data->>'tracking_code',auth.uid());
 ELSE
  IF nullif(_data->>'shipment_id','') IS NOT NULL THEN
   SELECT * INTO linked FROM public.partner_shipments WHERE id=(_data->>'shipment_id')::uuid AND organization_id=_org AND partner_id=p.id AND destination_location_id=src.id AND status IN ('SHIPPED','DELIVERED','PARTIALLY_RETURNED');
   IF NOT FOUND THEN RAISE EXCEPTION 'Remessa de origem inválida.'; END IF;
  END IF;
  INSERT INTO public.partner_returns(id,organization_id,return_number,partner_id,shipment_id,source_location_id,destination_location_id,return_date,notes,created_by)
  VALUES(v,_org,'DEV-'||v::text,p.id,linked.id,src.id,dst.id,coalesce((_data->>'date')::date,current_date),_data->>'notes',auth.uid());
 END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(_data->'items') LOOP
  IF _kind='shipment' THEN
   INSERT INTO public.partner_shipment_items(organization_id,shipment_id,variant_id,batch_id,quantity,notes)
   VALUES(_org,v,(it->>'variant_id')::uuid,nullif(it->>'batch_id','')::uuid,(it->>'quantity')::numeric,it->>'notes');
  ELSE
   IF it->>'condition'<>'SELLABLE' AND dst.operational_purpose NOT IN ('QUARANTINE','INSPECTION') THEN RAISE EXCEPTION 'Devolução não vendável exige destino de quarentena/inspeção.'; END IF;
   INSERT INTO public.partner_return_items(organization_id,return_id,variant_id,batch_id,quantity,condition,reason,notes)
   VALUES(_org,v,(it->>'variant_id')::uuid,nullif(it->>'batch_id','')::uuid,(it->>'quantity')::numeric,it->>'condition',it->>'reason',it->>'notes');
  END IF;
 END LOOP;
 PERFORM public.partner_audit(_org,'partner.'||_kind||'.create',CASE _kind WHEN 'shipment' THEN 'partner_shipments' ELSE 'partner_returns' END,v,_data);
 RETURN v;
END;
$$;
CREATE FUNCTION public.partner_shipment_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.partner_shipments; perm text; items jsonb; result jsonb; next_status text; item public.partner_shipment_items;
BEGIN
 perm:=CASE _action WHEN 'approve' THEN 'approve' WHEN 'pick' THEN 'pick' WHEN 'start_picking' THEN 'pick' WHEN 'ship' THEN 'ship' WHEN 'receive' THEN 'receive' WHEN 'cancel' THEN 'cancel' ELSE NULL END;
 IF perm IS NULL THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 PERFORM public.partner_require(_org,'partner_shipments.'||perm);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO s FROM public.partner_shipments WHERE id=_id AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Remessa não encontrada.'; END IF;
 IF _action='ship' AND s.transfer_id IS NOT NULL THEN RETURN jsonb_build_object('id',s.id,'deduped',true); END IF;
 IF _action IN ('approve','ship') AND EXISTS(SELECT 1 FROM public.partner_profiles p JOIN public.companies c ON c.id=p.company_id WHERE p.id=s.partner_id AND (p.operational_status<>'ACTIVE' OR c.status<>'ACTIVE')) THEN RAISE EXCEPTION 'Parceiro bloqueado ou inativo.'; END IF;
 IF _action='approve' AND s.status IN ('DRAFT','PENDING_APPROVAL') THEN next_status:='APPROVED';
 ELSIF _action='start_picking' AND s.status='APPROVED' THEN next_status:='PICKING';
 ELSIF _action='pick' AND s.status='PICKING' THEN
  SELECT * INTO item FROM public.partner_shipment_items WHERE shipment_id=s.id AND id=(_data->>'item_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não pertence à remessa.'; END IF;
  UPDATE public.partner_shipment_items SET picked_quantity=(_data->>'quantity')::numeric WHERE id=item.id;
  PERFORM public.partner_audit(_org,'partner.shipment.pick','partner_shipments',s.id,_data);
  IF item.picked_quantity<>item.quantity AND NOT EXISTS(SELECT 1 FROM public.partner_shipment_items WHERE shipment_id=s.id AND picked_quantity<>quantity) THEN
   PERFORM public.partner_audit(_org,'partner.shipment.picking_complete','partner_shipments',s.id,'{}');
  END IF;
  RETURN jsonb_build_object('id',s.id);
 ELSIF _action='ship' AND s.status='PICKING' THEN
  IF EXISTS(SELECT 1 FROM public.partner_shipment_items WHERE shipment_id=s.id AND picked_quantity<>quantity) THEN RAISE EXCEPTION 'Separação incompleta.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=s.destination_location_id AND partner_id=s.partner_id AND type='PARTNER') THEN RAISE EXCEPTION 'Destino não pertence ao parceiro.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('variant_id',variant_id,'batch_id',batch_id,'quantity',quantity) ORDER BY id) INTO items FROM public.partner_shipment_items WHERE shipment_id=s.id;
  result:=public.inventory_transfer_internal(_org,s.source_location_id,s.destination_location_id,items,'PARTNER_SHIPMENT',s.notes,'partner-shipment:'||s.id::text,auth.uid());
  UPDATE public.partner_shipments SET transfer_id=(result->>'transfer_id')::uuid,shipped_at=now() WHERE id=s.id;
  next_status:='SHIPPED';
 ELSIF _action='receive' AND s.status IN ('SHIPPED','PARTIALLY_RETURNED','RETURNED') AND s.delivered_at IS NULL THEN
  IF nullif(trim(_data->>'received_by'),'') IS NULL THEN RAISE EXCEPTION 'Informe quem recebeu.'; END IF;
  UPDATE public.partner_shipments SET delivered_at=coalesce((_data->>'delivered_at')::timestamptz,now()),received_by=_data->>'received_by' WHERE id=s.id;
  next_status:=CASE WHEN s.status='SHIPPED' THEN 'DELIVERED' ELSE s.status END;
 ELSIF _action='cancel' AND s.status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PICKING') THEN next_status:='CANCELED';
 ELSE RAISE EXCEPTION 'Transição inválida de % para %.',s.status,_action;
 END IF;
 UPDATE public.partner_shipments SET status=next_status,approved_by=CASE WHEN _action='approve' THEN auth.uid() ELSE approved_by END,updated_at=now() WHERE id=s.id;
 PERFORM public.partner_audit(_org,'partner.shipment.'||_action,'partner_shipments',s.id,jsonb_build_object('before',s.status,'after',next_status,'data',_data,'transfer',result));
 RETURN jsonb_build_object('id',s.id,'status',next_status,'warning',result->>'warning');
END;
$$;
CREATE FUNCTION public.partner_receive_return(_org uuid,_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.partner_returns; i record; sent numeric; returned numeric; items jsonb; result jsonb;
BEGIN
 PERFORM public.partner_require(_org,'partner_returns.receive');PERFORM public.inventory_lock(_org);
 SELECT * INTO r FROM public.partner_returns WHERE id=_id AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada.'; END IF;
 IF r.status='RECEIVED' THEN RETURN jsonb_build_object('id',r.id,'deduped',true); END IF;
 IF r.status<>'DRAFT' THEN RAISE EXCEPTION 'Devolução não está aberta.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=r.source_location_id AND partner_id=r.partner_id AND type='PARTNER') THEN RAISE EXCEPTION 'Origem não pertence ao parceiro.'; END IF;
 FOR i IN SELECT * FROM public.partner_return_items WHERE return_id=r.id LOOP
  IF i.condition<>'SELLABLE' AND NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=r.destination_location_id AND operational_purpose IN ('QUARANTINE','INSPECTION')) THEN RAISE EXCEPTION 'Destino exige quarentena/inspeção.'; END IF;
  IF r.shipment_id IS NOT NULL THEN
   SELECT quantity INTO sent FROM public.partner_shipment_items WHERE shipment_id=r.shipment_id AND variant_id=i.variant_id AND batch_id IS NOT DISTINCT FROM i.batch_id;
   SELECT coalesce(sum(ri.quantity),0) INTO returned FROM public.partner_return_items ri JOIN public.partner_returns rr ON rr.id=ri.return_id WHERE rr.shipment_id=r.shipment_id AND rr.status='RECEIVED' AND ri.variant_id=i.variant_id AND ri.batch_id IS NOT DISTINCT FROM i.batch_id;
   IF sent IS NULL OR returned+i.quantity>sent THEN RAISE EXCEPTION 'Devolução excede quantidade enviada para este item/lote.'; END IF;
  END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('variant_id',variant_id,'batch_id',batch_id,'quantity',quantity) ORDER BY id) INTO items FROM public.partner_return_items WHERE return_id=r.id;
 result:=public.inventory_transfer_internal(_org,r.source_location_id,r.destination_location_id,items,'PARTNER_RETURN',r.notes,'partner-return:'||r.id::text,auth.uid());
 UPDATE public.partner_returns SET status='RECEIVED',received_at=now(),transfer_id=(result->>'transfer_id')::uuid,updated_at=now() WHERE id=r.id;
 IF r.shipment_id IS NOT NULL THEN
  SELECT sum(quantity) INTO sent FROM public.partner_shipment_items WHERE shipment_id=r.shipment_id;
  SELECT sum(return_item.quantity) INTO returned FROM public.partner_return_items return_item JOIN public.partner_returns rr ON rr.id=return_item.return_id WHERE rr.shipment_id=r.shipment_id AND rr.status='RECEIVED';
  UPDATE public.partner_shipments SET status=CASE WHEN returned=sent THEN 'RETURNED' ELSE 'PARTIALLY_RETURNED' END,updated_at=now() WHERE id=r.shipment_id;
 END IF;
 PERFORM public.partner_audit(_org,'partner.return.receive','partner_returns',r.id,result);
 RETURN result;
END;
$$;
-- Operações ligadas ao domínio devem ser corrigidas por devolução, nunca estorno genérico isolado.
ALTER FUNCTION public.inventory_reverse_movement(uuid,uuid,text,uuid) RENAME TO inventory_reverse_movement_core;
REVOKE ALL ON FUNCTION public.inventory_reverse_movement_core(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.inventory_reverse_movement(_organization_id uuid,_movement_id uuid,_reason text,_user_id uuid DEFAULT auth.uid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.partner_require(_organization_id,'inventory.reverse');
 IF EXISTS(SELECT 1 FROM public.inventory_movements m WHERE m.id=_movement_id AND m.organization_id=_organization_id AND
 (EXISTS(SELECT 1 FROM public.partner_shipments s WHERE s.transfer_id=m.reference_id) OR EXISTS(SELECT 1 FROM public.partner_returns r WHERE r.transfer_id=m.reference_id))) THEN RAISE EXCEPTION 'Operação de parceiro consolidada: utilize o fluxo de devolução/correção do domínio.'; END IF;
 RETURN public.inventory_reverse_movement_core(_organization_id,_movement_id,_reason,_user_id);
END;
$$;
CREATE FUNCTION public.partner_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb; perm text;
BEGIN
 perm:=CASE _kind WHEN 'companies' THEN 'partners.read' WHEN 'company' THEN 'partners.read' WHEN 'shipments' THEN 'partner_shipments.read' WHEN 'shipment' THEN 'partner_shipments.read' WHEN 'returns' THEN 'partner_returns.read' WHEN 'return' THEN 'partner_returns.read' WHEN 'positions' THEN 'partner_inventory.read' WHEN 'dashboard' THEN 'partners.read' WHEN 'shipment_report' THEN 'partner_shipments.read' WHEN 'return_report' THEN 'partner_returns.read' WHEN 'history' THEN 'partner_inventory.read' ELSE NULL END;
 IF perm IS NULL OR _page<1 THEN RAISE EXCEPTION 'Consulta inválida.'; END IF;
 PERFORM public.partner_require(_org,perm);
 IF _kind='companies' THEN
  WITH rows AS MATERIALIZED (
  SELECT c.*,p.id partner_id,p.default_inventory_location_id,p.settlement_frequency,
   (SELECT string_agg(role,', ') FROM public.company_roles WHERE company_id=c.id) roles,
   (SELECT concat_ws('/',city,state) FROM public.company_addresses WHERE company_id=c.id ORDER BY is_primary DESC,created_at LIMIT 1) city,
   CASE WHEN public.has_permission(_org,'partner_inventory.read') THEN (SELECT coalesce(sum(b.on_hand),0) FROM public.inventory_balances b JOIN public.inventory_locations l ON l.id=b.location_id WHERE l.partner_id=p.id AND b.organization_id=_org) END on_hand,
   (SELECT max(b.last_movement_at) FROM public.inventory_balances b JOIN public.inventory_locations l ON l.id=b.location_id WHERE l.partner_id=p.id AND b.organization_id=_org) last_movement_at
  FROM public.companies c LEFT JOIN public.partner_profiles p ON p.company_id=c.id WHERE c.organization_id=_org
  AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',c.code,c.legal_name,c.trade_name,c.document_number)),lower(_filters->>'query'))>0)
  AND (coalesce(_filters->>'status','')='' OR c.status=_filters->>'status'))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY legal_name,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
 ELSIF _kind='company' THEN
  SELECT to_jsonb(c)||jsonb_build_object('profile',(SELECT to_jsonb(p) FROM public.partner_profiles p WHERE p.company_id=c.id),
   'roles',coalesce((SELECT jsonb_agg(role) FROM public.company_roles WHERE company_id=c.id),'[]'::jsonb),
   'contacts',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY is_primary DESC,created_at) FROM public.company_contacts t WHERE company_id=c.id),'[]'::jsonb),
   'addresses',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY is_primary DESC,created_at) FROM public.company_addresses t WHERE company_id=c.id),'[]'::jsonb),
   'history',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT action,created_at,user_id,context FROM public.audit_log WHERE organization_id=_org AND (resource_id=c.id::text OR context->>'company_id'=c.id::text) ORDER BY created_at DESC LIMIT 100)q),'[]'::jsonb),
   'location_name',(SELECT l.name FROM public.inventory_locations l JOIN public.partner_profiles pp ON pp.default_inventory_location_id=l.id WHERE pp.company_id=c.id),
   'on_hand',CASE WHEN public.has_permission(_org,'partner_inventory.read') THEN (SELECT coalesce(sum(b.on_hand),0) FROM public.inventory_balances b JOIN public.inventory_locations l ON l.id=b.location_id JOIN public.partner_profiles pp ON pp.id=l.partner_id WHERE pp.company_id=c.id) END,
   'last_shipment',CASE WHEN public.has_permission(_org,'partner_shipments.read') THEN (SELECT max(s.shipped_at) FROM public.partner_shipments s JOIN public.partner_profiles pp ON pp.id=s.partner_id WHERE pp.company_id=c.id) END,
   'marketplace_integration','NOT_IMPLEMENTED_MASTER_005') INTO v_result FROM public.companies c WHERE c.organization_id=_org AND c.id=(_filters->>'id')::uuid;
 ELSIF _kind IN ('shipments','returns') THEN
  WITH rows AS MATERIALIZED (
  SELECT s.id,s.organization_id,s.shipment_number AS number,s.shipment_date AS date,s.status,s.partner_id,s.source_location_id,s.destination_location_id,s.created_by,s.created_at,c.legal_name AS partner_name,
   src.name source_name,dst.name destination_name,(SELECT count(DISTINCT variant_id) FROM public.partner_shipment_items WHERE shipment_id=s.id) item_count,
   (SELECT sum(quantity) FROM public.partner_shipment_items WHERE shipment_id=s.id) units
  FROM public.partner_shipments s JOIN public.partner_profiles p ON p.id=s.partner_id JOIN public.companies c ON c.id=p.company_id JOIN public.inventory_locations src ON src.id=s.source_location_id JOIN public.inventory_locations dst ON dst.id=s.destination_location_id
  WHERE _kind='shipments' AND s.organization_id=_org AND (nullif(_filters->>'variant_id','') IS NULL OR EXISTS(SELECT 1 FROM public.partner_shipment_items WHERE shipment_id=s.id AND variant_id=(_filters->>'variant_id')::uuid))
  AND (coalesce(_filters->>'query','')='' OR strpos(lower(s.shipment_number||' '||c.legal_name),lower(_filters->>'query'))>0 OR EXISTS(SELECT 1 FROM public.partner_shipment_items i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE i.shipment_id=s.id AND strpos(lower(concat_ws(' ',v.sku,pr.name)),lower(_filters->>'query'))>0))
  UNION ALL
  SELECT r.id,r.organization_id,r.return_number,r.return_date,r.status,r.partner_id,r.source_location_id,r.destination_location_id,r.created_by,r.created_at,c.legal_name,src.name,dst.name,
   (SELECT count(DISTINCT variant_id) FROM public.partner_return_items WHERE return_id=r.id),(SELECT sum(quantity) FROM public.partner_return_items WHERE return_id=r.id)
  FROM public.partner_returns r JOIN public.partner_profiles p ON p.id=r.partner_id JOIN public.companies c ON c.id=p.company_id JOIN public.inventory_locations src ON src.id=r.source_location_id JOIN public.inventory_locations dst ON dst.id=r.destination_location_id
  WHERE _kind='returns' AND r.organization_id=_org AND (coalesce(_filters->>'query','')='' OR strpos(lower(r.return_number||' '||c.legal_name),lower(_filters->>'query'))>0 OR EXISTS(SELECT 1 FROM public.partner_return_items i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products pr ON pr.id=v.product_id WHERE i.return_id=r.id AND strpos(lower(concat_ws(' ',v.sku,pr.name)),lower(_filters->>'query'))>0))
  ), filtered AS MATERIALIZED (SELECT * FROM rows WHERE (nullif(_filters->>'partner_id','') IS NULL OR partner_id=(_filters->>'partner_id')::uuid)
   AND (nullif(_filters->>'source_location_id','') IS NULL OR source_location_id=(_filters->>'source_location_id')::uuid)
   AND (nullif(_filters->>'from','') IS NULL OR date>=(_filters->>'from')::date) AND (nullif(_filters->>'to','') IS NULL OR date<=(_filters->>'to')::date)
   AND (coalesce(_filters->>'status','')='' OR status=_filters->>'status'))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM filtered ORDER BY date DESC,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO v_result;
 ELSIF _kind IN ('shipment','return') THEN
  IF _kind='shipment' THEN
   SELECT to_jsonb(s)||jsonb_build_object('number',s.shipment_number,'partner_name',c.legal_name,'company_id',c.id,'source_name',src.name,'destination_name',dst.name,
    'items',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('sku',v.sku,'barcode',v.barcode,'size',v.size,'color',v.color,'product_name',p.name,'batch_code',b.batch_code)) FROM public.partner_shipment_items i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=v.product_id LEFT JOIN public.inventory_batches b ON b.id=i.batch_id WHERE shipment_id=s.id),'[]'::jsonb),
    'returns',CASE WHEN public.has_permission(_org,'partner_returns.read') THEN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.partner_returns r WHERE shipment_id=s.id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'returned_units',(SELECT coalesce(sum(i.quantity),0) FROM public.partner_return_items i JOIN public.partner_returns r ON r.id=i.return_id WHERE r.shipment_id=s.id AND r.status='RECEIVED')) INTO v_result
   FROM public.partner_shipments s JOIN public.partner_profiles pp ON pp.id=s.partner_id JOIN public.companies c ON c.id=pp.company_id JOIN public.inventory_locations src ON src.id=s.source_location_id JOIN public.inventory_locations dst ON dst.id=s.destination_location_id WHERE s.organization_id=_org AND s.id=(_filters->>'id')::uuid;
  ELSE
   SELECT to_jsonb(r)||jsonb_build_object('number',r.return_number,'partner_name',c.legal_name,'company_id',c.id,'source_name',src.name,'destination_name',dst.name,
    'items',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('sku',v.sku,'barcode',v.barcode,'size',v.size,'color',v.color,'product_name',p.name,'batch_code',b.batch_code)) FROM public.partner_return_items i JOIN public.product_variants v ON v.id=i.variant_id JOIN public.products p ON p.id=v.product_id LEFT JOIN public.inventory_batches b ON b.id=i.batch_id WHERE return_id=r.id),'[]'::jsonb)) INTO v_result
   FROM public.partner_returns r JOIN public.partner_profiles pp ON pp.id=r.partner_id JOIN public.companies c ON c.id=pp.company_id JOIN public.inventory_locations src ON src.id=r.source_location_id JOIN public.inventory_locations dst ON dst.id=r.destination_location_id WHERE r.organization_id=_org AND r.id=(_filters->>'id')::uuid;
  END IF;
  IF v_result IS NOT NULL THEN
   v_result:=v_result||jsonb_build_object('movements',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.inventory_movements m WHERE m.organization_id=_org AND m.reference_id=(v_result->>'transfer_id')::uuid),'[]'::jsonb),
   'history',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT action,created_at,user_id,context FROM public.audit_log WHERE organization_id=_org AND resource_id=v_result->>'id' ORDER BY created_at DESC LIMIT 100)q),'[]'::jsonb));
  END IF;
 ELSIF _kind='positions' THEN
  WITH balances AS (SELECT m.variant_id,m.location_id,sum(CASE direction WHEN 'IN' THEN quantity ELSE -quantity END) on_hand,max(occurred_at) last_movement_at,
   sum(CASE WHEN movement_type='PARTNER_SHIPMENT' AND direction='IN' THEN quantity ELSE 0 END) sent,
   sum(CASE WHEN movement_type='PARTNER_RETURN' AND direction='OUT' THEN quantity ELSE 0 END) returned,
   max(occurred_at) FILTER(WHERE movement_type='PARTNER_SHIPMENT' AND direction='IN') last_shipment
   FROM public.inventory_movements m WHERE organization_id=_org AND status='POSTED' AND (nullif(_filters->>'to','') IS NULL OR occurred_at<(((_filters->>'to')::date+1)::timestamp AT TIME ZONE 'UTC')) GROUP BY variant_id,location_id),
  rows AS MATERIALIZED(SELECT pp.id partner_id,c.legal_name partner_name,l.id location_id,l.name location_name,v.id variant_id,p.name product_name,v.sku,v.size,v.color,b.on_hand,b.last_movement_at,b.sent,b.returned,b.last_shipment FROM balances b JOIN public.inventory_locations l ON l.id=b.location_id AND l.organization_id=_org AND l.type='PARTNER' JOIN public.partner_profiles pp ON pp.id=l.partner_id JOIN public.companies c ON c.id=pp.company_id JOIN public.product_variants v ON v.id=b.variant_id JOIN public.products p ON p.id=v.product_id
   WHERE (nullif(_filters->>'partner_id','') IS NULL OR pp.id=(_filters->>'partner_id')::uuid) AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',c.legal_name,p.name,v.sku,v.barcode)),lower(_filters->>'query'))>0)
   AND (nullif(_filters->>'category_id','') IS NULL OR p.category_id=(_filters->>'category_id')::uuid))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY partner_name,sku,location_id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows),'units',(SELECT coalesce(sum(on_hand),0) FROM rows)) INTO v_result;
 ELSIF _kind IN ('shipment_report','return_report') THEN
  WITH lines AS (
   SELECT s.id,s.shipment_number number,s.shipment_date date,s.partner_id,s.source_location_id,s.status,i.id item_id,i.variant_id,i.batch_id,i.quantity,NULL::text condition,NULL::text reason
   FROM public.partner_shipments s JOIN public.partner_shipment_items i ON i.shipment_id=s.id WHERE s.organization_id=_org AND _kind='shipment_report'
   UNION ALL
   SELECT r.id,r.return_number,r.return_date,r.partner_id,r.source_location_id,r.status,i.id,i.variant_id,i.batch_id,i.quantity,i.condition,i.reason
   FROM public.partner_returns r JOIN public.partner_return_items i ON i.return_id=r.id WHERE r.organization_id=_org AND _kind='return_report'
  ), rows AS MATERIALIZED(SELECT x.*,c.legal_name partner_name,p.name product_name,v.sku,v.size,v.color,b.batch_code,src.name source_name
   FROM lines x JOIN public.partner_profiles pp ON pp.id=x.partner_id JOIN public.companies c ON c.id=pp.company_id JOIN public.product_variants v ON v.id=x.variant_id JOIN public.products p ON p.id=v.product_id LEFT JOIN public.inventory_batches b ON b.id=x.batch_id JOIN public.inventory_locations src ON src.id=x.source_location_id
   WHERE (nullif(_filters->>'from','') IS NULL OR x.date>=(_filters->>'from')::date)
   AND (nullif(_filters->>'to','') IS NULL OR x.date<=(_filters->>'to')::date)
   AND (coalesce(_filters->>'status','')='' OR x.status=_filters->>'status')
   AND (nullif(_filters->>'partner_id','') IS NULL OR x.partner_id=(_filters->>'partner_id')::uuid)
   AND (nullif(_filters->>'source_location_id','') IS NULL OR x.source_location_id=(_filters->>'source_location_id')::uuid)
   AND (nullif(_filters->>'category_id','') IS NULL OR p.category_id=(_filters->>'category_id')::uuid)
   AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',x.number,c.legal_name,p.name,v.sku,v.barcode)),lower(_filters->>'query'))>0))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY date DESC,id,item_id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
 ELSIF _kind='history' THEN
  WITH rows AS MATERIALIZED (SELECT m.id,m.occurred_at,m.movement_type,m.direction,m.quantity,m.status,m.reason,m.created_by,m.reference_id,v.sku,p.name product_name,l.name location_name
   FROM public.inventory_movements m JOIN public.inventory_locations l ON l.id=m.location_id JOIN public.product_variants v ON v.id=m.variant_id JOIN public.products p ON p.id=v.product_id
   WHERE m.organization_id=_org AND l.type='PARTNER' AND l.partner_id=(_filters->>'partner_id')::uuid)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY occurred_at DESC,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
 ELSIF _kind='dashboard' THEN
  PERFORM public.partner_require(_org,'partner_inventory.read');
  PERFORM public.partner_require(_org,'partner_shipments.read');PERFORM public.partner_require(_org,'partner_returns.read');
  SELECT jsonb_build_object('active_partners',(SELECT count(*) FROM public.partner_profiles WHERE organization_id=_org AND operational_status='ACTIVE'),
  'on_hand',(SELECT coalesce(sum(b.on_hand),0) FROM public.inventory_balances b JOIN public.inventory_locations l ON l.id=b.location_id WHERE b.organization_id=_org AND l.type='PARTNER' AND l.partner_id IS NOT NULL),
  'pending',(SELECT count(*) FROM public.partner_shipments WHERE organization_id=_org AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PICKING')),
  'shipments',(SELECT count(*) FROM public.partner_shipments WHERE organization_id=_org AND shipped_at>=coalesce(nullif(_filters->>'from','')::timestamptz,date_trunc('month',now())) AND shipped_at<coalesce(nullif(_filters->>'to','')::date+1,current_date+1)),
  'sent',(SELECT coalesce(sum(i.quantity),0) FROM public.partner_shipment_items i JOIN public.partner_shipments s ON s.id=i.shipment_id WHERE s.organization_id=_org AND s.shipped_at>=coalesce(nullif(_filters->>'from','')::timestamptz,date_trunc('month',now())) AND s.shipped_at<coalesce(nullif(_filters->>'to','')::date+1,current_date+1)),
  'returned',(SELECT coalesce(sum(i.quantity),0) FROM public.partner_return_items i JOIN public.partner_returns r ON r.id=i.return_id WHERE r.organization_id=_org AND r.received_at>=coalesce(nullif(_filters->>'from','')::timestamptz,date_trunc('month',now())) AND r.received_at<coalesce(nullif(_filters->>'to','')::date+1,current_date+1)),
  'discrepancies',(SELECT count(*) FROM public.inventory_count_items i JOIN public.inventory_counts c ON c.id=i.inventory_count_id JOIN public.inventory_locations l ON l.id=c.location_id WHERE c.organization_id=_org AND l.type='PARTNER' AND c.status IN ('IN_PROGRESS','REVIEW') AND i.difference<>0)) INTO v_result;
 END IF;
 IF v_result IS NULL THEN RAISE EXCEPTION 'Registro não encontrado nesta organização.'; END IF;
 RETURN v_result;
END;
$$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('partner_require','partner_audit','partner_guard','partner_save_company','partner_save_detail','partner_create_operation','partner_shipment_action','partner_receive_return','partner_query') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname NOT IN ('partner_require','partner_audit','partner_guard') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.inventory_reverse_movement(uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_reverse_movement(uuid,uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.partner_location_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.inventory_lock(NEW.organization_id);
 IF NEW.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_profiles WHERE id=NEW.partner_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Parceiro fora da organização.'; END IF;
 IF NEW.partner_id IS NOT NULL AND NEW.type<>'PARTNER' THEN RAISE EXCEPTION 'Localização vinculada deve ser PARTNER.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.type IS DISTINCT FROM OLD.type) AND (EXISTS(SELECT 1 FROM public.inventory_movements WHERE location_id=OLD.id) OR EXISTS(SELECT 1 FROM public.partner_profiles WHERE default_inventory_location_id=OLD.id) OR EXISTS(SELECT 1 FROM public.partner_shipments WHERE destination_location_id=OLD.id)) THEN RAISE EXCEPTION 'Vínculo da localização possui histórico e é imutável.'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER partner_location_integrity BEFORE INSERT OR UPDATE ON public.inventory_locations FOR EACH ROW EXECUTE FUNCTION public.partner_location_guard();
CREATE FUNCTION public.partner_adjustment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','MANUAL_CORRECTION') AND EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=NEW.location_id AND type='PARTNER') THEN
  PERFORM public.partner_require(NEW.organization_id,'partner_inventory.adjust');
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER partner_adjustment_permission BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.partner_adjustment_guard();
REVOKE ALL ON FUNCTION public.partner_location_guard(),public.partner_adjustment_guard() FROM PUBLIC,anon,authenticated;


-- Preparação de anexos operacionais privados. Nenhum arquivo público ou dado fiscal é gerado.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('partner-documents','partner-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
CREATE FUNCTION public.partner_document_allowed(_name text,_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pieces text[]:=string_to_array(_name,'/');org uuid;shipment uuid;
BEGIN
 IF array_length(pieces,1)<>3 OR pieces[3]!~'^[0-9a-f-]{36}[.](pdf|jpg|jpeg|png)$' THEN RETURN false; END IF;
 BEGIN org:=pieces[1]::uuid;shipment:=pieces[2]::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN auth.uid() IS NOT NULL AND public.has_permission(org,CASE WHEN _write THEN 'partner_shipments.ship' ELSE 'partner_shipments.read' END)
 AND EXISTS(SELECT 1 FROM public.partner_shipments WHERE id=shipment AND organization_id=org);
END;
$$;
REVOKE ALL ON FUNCTION public.partner_document_allowed(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_document_allowed(text,boolean) TO authenticated;
CREATE POLICY partner_documents_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='partner-documents' AND public.partner_document_allowed(name,false));
CREATE POLICY partner_documents_add ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='partner-documents' AND public.partner_document_allowed(name,true));

-- Políticas restritivas limitadas ao novo bucket também resistem a permissões legadas abrangentes.
CREATE POLICY partner_documents_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO public USING(bucket_id<>'partner-documents' OR (auth.uid() IS NOT NULL AND public.partner_document_allowed(name,false)));
CREATE POLICY partner_documents_add_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK(bucket_id<>'partner-documents' OR (auth.uid() IS NOT NULL AND public.partner_document_allowed(name,true)));
CREATE POLICY partner_documents_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING(bucket_id<>'partner-documents') WITH CHECK(bucket_id<>'partner-documents');
CREATE POLICY partner_documents_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO public USING(bucket_id<>'partner-documents');

COMMIT;
