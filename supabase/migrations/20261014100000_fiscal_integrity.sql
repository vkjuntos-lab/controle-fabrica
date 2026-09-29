-- MASTER 014: additive repairs; existing migrations and local changes preserved.
BEGIN;
DROP INDEX public.fiscal_establishments_one_per_org_uq;
ALTER TABLE public.company_fiscal_profiles ADD COLUMN approved_by uuid REFERENCES public.profiles,
 ADD COLUMN approved_at timestamptz;
ALTER TABLE public.fiscal_establishments ADD CONSTRAINT fiscal_est_company_fk
 FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id);
ALTER TABLE public.fiscal_establishments ADD CONSTRAINT fiscal_est_address_fk
 FOREIGN KEY(organization_id,fiscal_address_id) REFERENCES public.company_addresses(organization_id,id);
ALTER TABLE public.product_fiscal_profiles ALTER COLUMN origin_code DROP DEFAULT;
ALTER TABLE public.tax_rule_items ADD CONSTRAINT fiscal_nonnegative_parameters CHECK(reduction>=0 AND fixed_amount>=0 AND rate::text NOT IN ('NaN','Infinity','-Infinity') AND reduction::text NOT IN ('NaN','Infinity','-Infinity') AND fixed_amount::text NOT IN ('NaN','Infinity','-Infinity'));


CREATE OR REPLACE FUNCTION public.fiscal_compute_tax(_base numeric,_rate numeric,_reduction numeric,_fixed numeric)
RETURNS TABLE(raw_value numeric,rounded_value numeric) LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF _base IS NULL OR _rate IS NULL OR _reduction IS NULL OR _fixed IS NULL
 OR _base::text IN ('NaN','Infinity','-Infinity') OR _rate::text IN ('NaN','Infinity','-Infinity')
 OR _reduction::text IN ('NaN','Infinity','-Infinity') OR _fixed::text IN ('NaN','Infinity','-Infinity')
 OR _base<0 OR _rate<0 OR _reduction<0 OR _fixed<0 OR _reduction>_base THEN
 RAISE EXCEPTION 'Parâmetros de cálculo inválidos ou redução superior à base.'; END IF;
 RETURN QUERY SELECT round((_base-_reduction)*_rate+_fixed,6),round(round((_base-_reduction)*_rate+_fixed,6),2);
END $$;
CREATE TABLE public.fiscal_rule_regressions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 tax_rule_id uuid NOT NULL, rule_version integer NOT NULL, fingerprint text NOT NULL, cases jsonb NOT NULL, results jsonb NOT NULL,
 passed boolean NOT NULL, created_by uuid NOT NULL REFERENCES profiles, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,tax_rule_id) REFERENCES tax_rules(organization_id,id)
);
ALTER TABLE fiscal_rule_regressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_rule_regressions FROM anon,authenticated;
GRANT SELECT ON fiscal_rule_regressions TO authenticated;
CREATE POLICY fiscal_regression_read ON fiscal_rule_regressions FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.tax_rules.read'));
CREATE FUNCTION public.fiscal_rule_fingerprint(_org uuid,_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT md5((to_jsonb(r)-ARRAY['status','updated_at','reviewed_by','reviewed_at','approved_by','approved_at','retired_at'])::text
   ||coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)::text FROM tax_rule_items i WHERE i.organization_id=_org AND i.tax_rule_id=_id),'[]'))
 FROM tax_rules r WHERE r.organization_id=_org AND r.id=_id
$$;
REVOKE ALL ON FUNCTION fiscal_rule_fingerprint(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.fiscal_test_rule(_org uuid,_id uuid,_cases jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r tax_rules; c jsonb; item tax_rule_items; total numeric; base numeric; amount numeric;
 applicable boolean; passed boolean:=true; result jsonb:='[]'; saved fiscal_rule_regressions;
BEGIN
 PERFORM fiscal_require(_org,'fiscal.tax_rules.manage');
 SELECT * INTO r FROM tax_rules WHERE organization_id=_org AND id=_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('REVIEW','APPROVED') THEN RAISE EXCEPTION 'Teste exige regra submetida e imutável.'; END IF;
 IF jsonb_typeof(_cases)<>'array' OR jsonb_array_length(_cases) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Informe entre 3 e 100 cenários de regressão.'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(_cases) LOOP
  IF c->>'on_date' IS NULL OR c->>'expected_applicable' IS NULL OR c->>'expected_total' IS NULL
   OR coalesce((c->>'quantity')::numeric,0)<=0 OR coalesce((c->>'unit_price')::numeric,-1)<0 THEN RAISE EXCEPTION 'Cenário incompleto.'; END IF;
  applicable:=(c->>'on_date')::date>=r.valid_from AND (r.valid_to IS NULL OR (c->>'on_date')::date<=r.valid_to);
  total:=0;
  IF applicable THEN
   FOR item IN SELECT * FROM tax_rule_items WHERE organization_id=_org AND tax_rule_id=r.id LOOP
    base:=CASE item.base_mode WHEN 'ISOLADO' THEN item.fixed_amount
    WHEN 'VALOR_LIQUIDO' THEN (c->>'quantity')::numeric*(c->>'unit_price')::numeric-coalesce((c->>'discount')::numeric,0)-coalesce((c->>'freight')::numeric,0)
    ELSE (c->>'quantity')::numeric*(c->>'unit_price')::numeric-coalesce((c->>'discount')::numeric,0) END;
    SELECT rounded_value INTO amount FROM fiscal_compute_tax(base,item.rate,item.reduction,item.fixed_amount);
    total:=total+amount;
   END LOOP;
  END IF;
  passed:=passed AND applicable=(c->>'expected_applicable')::boolean AND total=(c->>'expected_total')::numeric;
  result:=result||jsonb_build_array(jsonb_build_object('date',c->>'on_date','applicable',applicable,'total',total,
   'passed',applicable=(c->>'expected_applicable')::boolean AND total=(c->>'expected_total')::numeric));
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_cases) test_case WHERE (test_case->>'on_date')::date<r.valid_from)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_cases) test_case WHERE (test_case->>'on_date')::date=r.valid_from)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_cases) test_case WHERE (test_case->>'on_date')::date>coalesce(r.valid_to,r.valid_from)) THEN
 RAISE EXCEPTION 'Inclua cenários antes da vigência, no início e após o fim (ou após o início se vigência aberta).'; END IF;
 INSERT INTO fiscal_rule_regressions(organization_id,tax_rule_id,rule_version,fingerprint,cases,results,passed,created_by)
 VALUES(_org,r.id,r.version,fiscal_rule_fingerprint(_org,r.id),_cases,result,passed,auth.uid()) RETURNING * INTO saved;
 PERFORM fiscal_audit(_org,'fiscal.rule_tested','fiscal_rule_regressions',saved.id,jsonb_build_object('passed',passed));
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION fiscal_test_rule(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fiscal_test_rule(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fiscal_rule_action(
  _org uuid, _rule_id uuid, _action text, _justification text,
  _regression_evidence jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rule public.tax_rules;
  v_perm text;
  v_to public.tax_rule_status;
  v_from public.tax_rule_status;
BEGIN
  v_perm := CASE _action
    WHEN 'submit' THEN 'fiscal.tax_rules.manage'
    WHEN 'review' THEN 'fiscal.tax_rules.read'
    WHEN 'approve' THEN 'fiscal.tax_rules.approve'
    WHEN 'activate' THEN 'fiscal.tax_rules.approve'
    WHEN 'retire' THEN 'fiscal.tax_rules.approve'
    ELSE NULL END;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'Ação de regra inválida: %',_action; END IF;
  PERFORM public.fiscal_require(_org,v_perm);

  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_rule FROM public.tax_rules
  WHERE organization_id=_org AND id=_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Regra inexistente: %',_rule_id; END IF;
  v_from := v_rule.status;

  -- Guarda de transição. Sem ela, ativar uma regra RETIRED a
  -- ressuscitaria, e "aprovar" duas vezes re-selo o mesmo documento.
  -- RETIRED é terminal: quem aposenta regra cria outra, versionada.
  IF _action='submit' AND v_from NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'Regra em % não pode ir para revisão.',v_from;
  ELSIF _action='review' AND v_from<>'REVIEW' THEN
    RAISE EXCEPTION 'Devolver ajuste só vale para regra em REVIEW, não em %.',v_from;
  ELSIF _action='approve' AND v_from<>'REVIEW' THEN
    RAISE EXCEPTION 'Regra em % não pode ser aprovada.',v_from;
  ELSIF _action='activate' AND v_from<>'APPROVED' THEN
    RAISE EXCEPTION 'Regra em % não pode ativar: exige aprovação registrada.',v_from;
  ELSIF _action='retire' AND v_from NOT IN ('DRAFT','REVIEW','APPROVED','ACTIVE') THEN
    RAISE EXCEPTION 'Regra em % já está encerrada.',v_from;
  END IF;

  v_to := CASE _action
    WHEN 'submit' THEN 'REVIEW'
    WHEN 'review' THEN 'DRAFT'
    WHEN 'approve' THEN 'APPROVED'
    WHEN 'activate' THEN 'ACTIVE'
    WHEN 'retire' THEN 'RETIRED'
  END;

  IF _action IN ('approve','activate') THEN
    IF length(trim(coalesce(_justification,'')))=0 THEN
      RAISE EXCEPTION 'Aprovação exige justificativa registrada.';
    END IF;
    IF v_rule.created_by IS NOT NULL AND v_rule.created_by=auth.uid() THEN
      RAISE EXCEPTION 'Quem cadastrou a regra não pode aprová-la.';
    END IF;
  END IF;

  UPDATE public.tax_rules SET
    status=v_to, updated_at=now(),
    reviewed_by=CASE WHEN _action='review' THEN auth.uid() ELSE reviewed_by END,
    reviewed_at=CASE WHEN _action='review' THEN now() ELSE reviewed_at END,
    approved_by=CASE WHEN _action IN ('approve','activate') THEN auth.uid() ELSE approved_by END,
    approved_at=CASE WHEN _action IN ('approve','activate') THEN now() ELSE approved_at END,
    retired_at=CASE WHEN _action='retire' THEN now() ELSE retired_at END
  WHERE organization_id=_org AND id=_rule_id
  RETURNING * INTO v_rule;

  INSERT INTO public.tax_rule_reviews(
    organization_id,tax_rule_id,from_status,to_status,decision,justification,
    regression_evidence,reviewed_by)
  VALUES(_org,_rule_id,v_from,v_to,
    CASE _action WHEN 'retire' THEN 'RETIRED' WHEN 'review' THEN 'REQUESTED_CHANGES' ELSE 'APPROVED' END,
    coalesce(_justification,'Ajuste do ciclo de revisão.'),_regression_evidence,auth.uid());

  PERFORM public.fiscal_audit(_org,'fiscal.tax_rule.'||_action,'tax_rules',_rule_id,
    jsonb_build_object('from_status',v_from,'to_status',v_to,'justification',_justification));

  -- Duas regras ACTIVE com o MESMO escopo e vigência sobreposta tornam
  -- o resultado dependente da ordem de leitura. Escopos diferentes são
  -- legítimos: fiscal_resolve_rule desempata por especificidade.
  IF v_to='ACTIVE' THEN
    IF NOT EXISTS(SELECT 1 FROM fiscal_rule_regressions WHERE organization_id=_org AND tax_rule_id=_rule_id
      AND rule_version=v_rule.version AND passed AND fingerprint=fiscal_rule_fingerprint(_org,_rule_id) AND id::text=_regression_evidence->>'reference') THEN
      RAISE EXCEPTION 'Ativação exige regressão executada no servidor e aprovada para esta regra.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM tax_rule_items WHERE organization_id=_org AND tax_rule_id=_rule_id) THEN
      RAISE EXCEPTION 'Regra exige tratamentos explícitos, inclusive para isenção.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.tax_rules r
      WHERE r.organization_id=_org AND r.status='ACTIVE' AND r.id<>v_rule.id
        AND r.operation_type_id=v_rule.operation_type_id
        AND daterange(r.valid_from,r.valid_to,'[]') && daterange(v_rule.valid_from,v_rule.valid_to,'[]')
        AND coalesce(r.establishment_id::text,'')=coalesce(v_rule.establishment_id::text,'')
        AND coalesce(r.tax_regime_id::text,'')=coalesce(v_rule.tax_regime_id::text,'')
        AND coalesce(r.product_classification,'')=coalesce(v_rule.product_classification,'')
        AND coalesce(r.origin_region_id::text,'')=coalesce(v_rule.origin_region_id::text,'')
        AND coalesce(r.destination_region_id::text,'')=coalesce(v_rule.destination_region_id::text,'')
        AND coalesce(r.customer_company_id::text,'')=coalesce(v_rule.customer_company_id::text,'')
        AND coalesce(r.document_model,'')=coalesce(v_rule.document_model,'')) THEN
      RAISE EXCEPTION 'Já existe regra ATIVE com o mesmo escopo e vigência sobreposta.';
    END IF;
  END IF;

  RETURN to_jsonb(v_rule);
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_save_establishment(
  _org uuid, _data jsonb, _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_est public.fiscal_establishments; v_id uuid;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.configure');
  PERFORM public.inventory_lock(_org);
  IF _id IS NULL THEN
    INSERT INTO public.fiscal_establishments(
      organization_id,business_unit_id,company_id,legal_name,trade_name,tax_registration,
      state_registration,municipal_registration,tax_regime_id,fiscal_address_id,
      environment,status,notes,created_by)
    VALUES(_org,nullif(_data->>'business_unit_id','')::uuid,nullif(_data->>'company_id','')::uuid,
      _data->>'legal_name',_data->>'trade_name',nullif(_data->>'tax_registration',''),
      nullif(_data->>'state_registration',''),nullif(_data->>'municipal_registration',''),
      nullif(_data->>'tax_regime_id','')::uuid,nullif(_data->>'fiscal_address_id','')::uuid,
      coalesce((_data->>'environment')::public.fiscal_environment,'HOMOLOGATION'),
      coalesce(_data->>'status','ACTIVE'),_data->>'notes',auth.uid())
    RETURNING * INTO v_est;
  ELSE
    UPDATE public.fiscal_establishments SET
      business_unit_id=coalesce(nullif(_data->>'business_unit_id','')::uuid,business_unit_id),
      company_id=coalesce(nullif(_data->>'company_id','')::uuid,company_id),
      legal_name=coalesce(_data->>'legal_name',legal_name),
      trade_name=_data->>'trade_name',
      tax_registration=coalesce(nullif(_data->>'tax_registration',''),tax_registration),
      state_registration=coalesce(nullif(_data->>'state_registration',''),state_registration),
      municipal_registration=coalesce(nullif(_data->>'municipal_registration',''),municipal_registration),
      fiscal_address_id=coalesce(nullif(_data->>'fiscal_address_id','')::uuid,fiscal_address_id),
      status=coalesce(_data->>'status',status), notes=_data->>'notes',
      updated_at=now(), updated_by=auth.uid()
    WHERE organization_id=_org AND id=_id RETURNING * INTO v_est;
    IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento inexistente: %',_id; END IF;
  END IF;

  IF v_est.fiscal_address_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_addresses
    WHERE organization_id=_org AND id=v_est.fiscal_address_id AND company_id=v_est.company_id) THEN
    RAISE EXCEPTION 'Endereço fiscal deve pertencer à empresa do estabelecimento.';
  END IF;
  IF v_est.business_unit_id IS NOT NULL THEN RAISE EXCEPTION 'Unidade empresarial ainda não modelada; use estabelecimento e vínculo de localização.'; END IF;
  -- Troca de regime fica no histórico: documento antigo não pode ser
  -- reinterpretado pelo regime novo.
  IF _data ? 'tax_regime_id' AND _data->>'tax_regime_id' IS DISTINCT FROM '' THEN
    IF EXISTS(SELECT 1 FROM fiscal_establishment_regime_history WHERE organization_id=_org
      AND establishment_id=v_est.id AND valid_to IS NULL AND tax_regime_id=(_data->>'tax_regime_id')::uuid) THEN
      RETURN to_jsonb(v_est);
    END IF;
    IF EXISTS(SELECT 1 FROM fiscal_establishment_regime_history WHERE organization_id=_org
      AND establishment_id=v_est.id AND valid_from=current_date) THEN
      RAISE EXCEPTION 'Já há regime registrado hoje; alteração exige vigência posterior.';
    END IF;
    UPDATE fiscal_establishment_regime_history SET valid_to=current_date-1
      WHERE organization_id=_org AND establishment_id=v_est.id AND valid_to IS NULL;
    INSERT INTO public.fiscal_establishment_regime_history(
      organization_id,establishment_id,tax_regime_id,valid_from,reason,changed_by)
    VALUES(_org,v_est.id,(_data->>'tax_regime_id')::uuid,current_date,
      coalesce(_data->>'regime_reason','Vigência registrada na configuração.'),auth.uid());
    UPDATE public.fiscal_establishments SET tax_regime_id=(_data->>'tax_regime_id')::uuid
      WHERE organization_id=_org AND id=v_est.id;
    v_est.tax_regime_id := (_data->>'tax_regime_id')::uuid;
  END IF;

  PERFORM public.fiscal_audit(_org,'fiscal.establishment_saved','fiscal_establishments',v_est.id,
    jsonb_build_object('environment',v_est.environment));
  RETURN to_jsonb(v_est);
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_save_company_profile(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.company_fiscal_profiles;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.configure');
  IF _id IS NULL THEN
    INSERT INTO public.company_fiscal_profiles(organization_id,company_id,tax_registration,
      state_registration,municipal_registration,tax_regime_id,ie_status,email_fiscal,
      phone_fiscal,is_final_consumer,version,effective_from,effective_to,status,notes,created_by)
    VALUES(_org,(_data->>'company_id')::uuid,nullif(_data->>'tax_registration',''),
      nullif(_data->>'state_registration',''),nullif(_data->>'municipal_registration',''),
      nullif(_data->>'tax_regime_id','')::uuid,_data->>'ie_status',
      nullif(_data->>'email_fiscal',''),nullif(_data->>'phone_fiscal',''),
      coalesce((_data->>'is_final_consumer')::boolean,false),
      coalesce((_data->>'version')::integer,1),
      coalesce((_data->>'effective_from')::date,CURRENT_DATE),
      nullif(_data->>'effective_to','')::date,'DRAFT',_data->>'notes',auth.uid())
    RETURNING * INTO v_row;
  ELSE
    PERFORM 1 FROM company_fiscal_profiles WHERE organization_id=_org AND id=_id AND status='DRAFT' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil aprovado é imutável; crie nova versão.'; END IF;
    UPDATE public.company_fiscal_profiles SET
      tax_registration=coalesce(nullif(_data->>'tax_registration',''),tax_registration),
      state_registration=coalesce(nullif(_data->>'state_registration',''),state_registration),
      municipal_registration=coalesce(nullif(_data->>'municipal_registration',''),municipal_registration),
      tax_regime_id=coalesce(nullif(_data->>'tax_regime_id','')::uuid,tax_regime_id),
      ie_status=coalesce(_data->>'ie_status',ie_status),
      email_fiscal=coalesce(nullif(_data->>'email_fiscal',''),email_fiscal),
      phone_fiscal=coalesce(nullif(_data->>'phone_fiscal',''),phone_fiscal),
      is_final_consumer=coalesce((_data->>'is_final_consumer')::boolean,is_final_consumer),
      notes=_data->>'notes', updated_at=now()
    WHERE organization_id=_org AND id=_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil fiscal da empresa inexistente: %',_id; END IF;
  END IF;
  PERFORM public.fiscal_audit(_org,'fiscal.company_profile_saved','company_fiscal_profiles',
    v_row.id,jsonb_build_object('company_id',v_row.company_id));
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_save_product_profile(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.product_fiscal_profiles;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.tax_rules.manage');
  IF _id IS NULL THEN
    INSERT INTO public.product_fiscal_profiles(organization_id,product_variant_id,ncm,cest,
      origin_code,fiscal_unit,tax_classification,additional_classification,tax_treatment,
      version,effective_from,effective_to,status,justification,created_by)
    VALUES(_org,(_data->>'product_variant_id')::uuid,_data->>'ncm',nullif(_data->>'cest',''),
      (_data->>'origin_code')::smallint,_data->>'fiscal_unit',
      nullif(_data->>'tax_classification',''),
      coalesce(_data->'additional_classification','{}'::jsonb),
      coalesce(_data->>'tax_treatment','DEFAULT'),
      coalesce((_data->>'version')::integer,1),
      coalesce((_data->>'effective_from')::date,CURRENT_DATE),
      nullif(_data->>'effective_to','')::date,'DRAFT',_data->>'justification',auth.uid())
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.product_fiscal_profiles
    WHERE organization_id=_org AND id=_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil fiscal inexistente: %',_id; END IF;
    IF v_row.status<>'DRAFT' THEN
      RAISE EXCEPTION 'Perfil em % só é alterável criando nova versão.',v_row.status;
    END IF;
    UPDATE public.product_fiscal_profiles SET ncm=coalesce(_data->>'ncm',ncm),
      cest=coalesce(nullif(_data->>'cest',''),cest),
      origin_code=coalesce((_data->>'origin_code')::smallint,origin_code),
      fiscal_unit=coalesce(_data->>'fiscal_unit',fiscal_unit),
      tax_classification=coalesce(nullif(_data->>'tax_classification',''),tax_classification),
      additional_classification=coalesce(_data->'additional_classification',additional_classification),
      tax_treatment=coalesce(_data->>'tax_treatment',tax_treatment),
      justification=_data->>'justification', updated_at=now()
    WHERE organization_id=_org AND id=_id RETURNING * INTO v_row;
  END IF;
  PERFORM public.fiscal_audit(_org,'fiscal.product_profile_saved','product_fiscal_profiles',
    v_row.id,jsonb_build_object('ncm',v_row.ncm,'version',v_row.version));
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_save_layout(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_row public.fiscal_layout_versions; v_to text;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.configure');
  IF _id IS NULL THEN
    INSERT INTO public.fiscal_layout_versions(organization_id,document_model,version,
      source_reference,published_at,valid_from,valid_to,implanted_at,required_fields,
      reform_fields,status,homologation_notes,created_by)
    VALUES(_org,_data->>'document_model',_data->>'version',_data->>'source_reference',
      nullif(_data->>'published_at','')::date,coalesce((_data->>'valid_from')::date,CURRENT_DATE),
      nullif(_data->>'valid_to','')::date,nullif(_data->>'implanted_at','')::date,
      coalesce(_data->'required_fields','[]'::jsonb),coalesce(_data->'reform_fields','{}'::jsonb),
      'DRAFT',_data->>'homologation_notes',auth.uid())
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.fiscal_layout_versions
    WHERE organization_id=_org AND id=_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Versão de leiaute inexistente: %',_id; END IF;
    IF v_row.status<>'DRAFT' AND (_data - 'status' - 'homologation_notes') <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Leiaute em % só muda criando nova versão.',v_row.status;
    END IF;
    UPDATE public.fiscal_layout_versions SET
      source_reference=coalesce(_data->>'source_reference',source_reference),
      published_at=coalesce(nullif(_data->>'published_at','')::date,published_at),
      valid_from=coalesce((_data->>'valid_from')::date,valid_from),
      valid_to=coalesce(nullif(_data->>'valid_to','')::date,valid_to),
      required_fields=coalesce(_data->'required_fields',required_fields),
      reform_fields=coalesce(_data->'reform_fields',reform_fields),
      homologation_notes=_data->>'homologation_notes', updated_at=now()
    WHERE organization_id=_org AND id=v_row.id RETURNING * INTO v_row;
  END IF;
  IF _data ? 'status' THEN
    v_to := _data->>'status';
    IF v_to NOT IN ('HOMOLOGATION','ACTIVE','RETIRED') THEN
      RAISE EXCEPTION 'Transição de leiaute inválida: %',v_to;
    END IF;
    -- Leiaute só fica ACTIVE depois de implantado. Ativar um leiaute
    -- não implantado faz o documento nascer com formato que ninguém
    -- homologou.
    IF v_to='ACTIVE' AND (v_row.implanted_at IS NULL OR length(trim(coalesce(v_row.homologation_notes,'')))=0) THEN
      RAISE EXCEPTION 'Leiaute exige data de implantação antes de virar ACTIVE.';
    END IF;
    UPDATE public.fiscal_layout_versions SET status=v_to, updated_at=now(),
      approved_by=CASE WHEN v_to='ACTIVE' THEN auth.uid() ELSE approved_by END,
      approved_at=CASE WHEN v_to='ACTIVE' THEN now() ELSE approved_at END
    WHERE organization_id=_org AND id=v_row.id RETURNING * INTO v_row;
  END IF;
  PERFORM public.fiscal_audit(_org,'fiscal.layout_saved','fiscal_layout_versions',v_row.id,
    jsonb_build_object('model',v_row.document_model,'version',v_row.version,'status',v_row.status));
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_simulate(
  _org uuid, _establishment_id uuid, _operation_type_id uuid, _company_id uuid,
  _document_model text, _items jsonb, _on_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_establishment public.fiscal_establishments;
  v_regime uuid;
  v_item jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_blocking boolean := false;
  v_total numeric := 0;
  v_pending jsonb := '[]'::jsonb;
  v_sim public.fiscal_simulations;
  v_line record;
BEGIN
  -- SECURITY DEFINER sem guarda de permissão é função pública com o
  -- nome de privada. A checagem é a primeira coisa, antes de ler dado
  -- de cadastro fiscal de qualquer organização.
  PERFORM public.fiscal_require(_org,'fiscal.simulate');
  IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Informe de 1 a 500 itens.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM companies WHERE organization_id=_org AND id=_company_id)
    OR NOT EXISTS(SELECT 1 FROM fiscal_operation_types WHERE organization_id=_org AND id=_operation_type_id AND is_active) THEN
    RAISE EXCEPTION 'Contraparte ou operação inválida para a organização.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) i WHERE
    coalesce((i->>'quantity')::numeric,0)<=0 OR coalesce((i->>'unit_price')::numeric,-1)<0
    OR coalesce((i->>'discount')::numeric,0)<0 OR coalesce((i->>'freight')::numeric,0)<0
    OR coalesce((i->>'discount')::numeric,0)+coalesce((i->>'freight')::numeric,0)>(i->>'quantity')::numeric*(i->>'unit_price')::numeric) THEN
    RAISE EXCEPTION 'Quantidade, preço, desconto ou frete inválido.';
  END IF;

  SELECT * INTO v_establishment FROM public.fiscal_establishments
  WHERE organization_id=_org AND id=_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento fiscal inexistente: %',_establishment_id;
  END IF;
  -- O regime vigente vem do histórico; nunca é deduzido.
  SELECT tax_regime_id INTO v_regime FROM public.fiscal_establishment_regime_history
  WHERE organization_id=_org AND establishment_id=_establishment_id
    AND valid_from<=_on_date AND (valid_to IS NULL OR valid_to>=_on_date)
  ORDER BY valid_from DESC LIMIT 1;

  IF v_regime IS NULL THEN
    v_blocking := true;
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object('code','MISSING_TAX_CONFIGURATION',
        'message','Estabelecimento sem regime tributário vigente na data da operação.'));
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      FOR v_line IN
        SELECT * FROM public.fiscal_calculate_item(
          _org,_operation_type_id,_establishment_id,
          (v_item->>'product_variant_id')::uuid,_company_id,_document_model,
          coalesce((v_item->>'quantity')::numeric,0),
          coalesce((v_item->>'unit_price')::numeric,0),
          coalesce((v_item->>'discount')::numeric,0),
          coalesce((v_item->>'freight')::numeric,0),
          v_regime,NULL,NULL,_on_date)
      LOOP
        v_total := v_total + coalesce(v_line.rounded_amount,0);
        -- O snapshot da simulação é acumulado e gravado depois, com o
        -- id da simulação: assim "qual regra eu usaria hoje" fica
        -- respondível, e não só o número final.
        v_pending := v_pending || jsonb_build_object(
          'tax_id',v_line.tax_id,'tax_rule_id',v_line.tax_rule_id,
          'tax_rule_version',v_line.tax_rule_version,
          'tax_rule_valid_from',v_line.tax_rule_valid_from,
          'layout_version_id',v_line.layout_version_id,
          'base_amount',v_line.base_amount,'rate',v_line.rate,
          'reduction',v_line.reduction,'fixed_amount',v_line.fixed_amount,
          'raw_amount',v_line.raw_amount,'rounded_amount',v_line.rounded_amount,
          'base_mode',v_line.base_mode,'treatment_code',v_line.treatment_code,
          'is_recoverable',v_line.is_recoverable,'is_withheld',v_line.is_withheld,
          'parameter_origin',v_line.parameter_origin,
          'product_variant_id',v_item->>'product_variant_id');
        v_rows := v_rows || jsonb_build_object(
          'product_variant_id',v_item->>'product_variant_id',
          'tax_code',v_line.parameter_origin->>'tax_code',
          'base',v_line.base_amount,'rate',v_line.rate,
          'reduction',v_line.reduction,'fixed',v_line.fixed_amount,
          'raw',v_line.raw_amount,'rounded',v_line.rounded_amount,
          'treatment_code',v_line.treatment_code,
          'is_withheld',v_line.is_withheld,'is_recoverable',v_line.is_recoverable,
          'tax_rule_id',v_line.tax_rule_id,
          'tax_rule_version',v_line.tax_rule_version);
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_blocking := true;
      v_warnings := v_warnings || jsonb_build_object(
        'code','MISSING_TAX_CONFIGURATION',
        'product_variant_id',v_item->>'product_variant_id',
        'message',SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.fiscal_simulations(
    organization_id,establishment_id,operation_type_id,company_id,
    input_snapshot,result,has_blocking_issue,warnings,requested_by)
  VALUES(_org,_establishment_id,_operation_type_id,_company_id,
    jsonb_build_object('document_model',_document_model,'on_date',_on_date,'items',_items),
    jsonb_build_object('lines',v_rows,'total_taxes',round(v_total,2)),
    v_blocking,v_warnings,auth.uid())
  RETURNING * INTO v_sim;

  INSERT INTO public.tax_calculation_snapshots(
    organization_id,simulation_id,tax_id,tax_rule_id,tax_rule_version,tax_rule_valid_from,
    layout_version_id,base_amount,rate,reduction,fixed_amount,raw_amount,rounded_amount,
    base_mode,treatment_code,is_recoverable,is_withheld,parameter_origin,is_simulation)
  SELECT _org,v_sim.id,s.tax_id,s.tax_rule_id,s.tax_rule_version,s.tax_rule_valid_from,
    s.layout_version_id,s.base_amount,s.rate,s.reduction,s.fixed_amount,s.raw_amount,
    s.rounded_amount,s.base_mode,s.treatment_code,s.is_recoverable,s.is_withheld,
    s.parameter_origin || jsonb_build_object('simulated_for',s.product_variant_id),true
  FROM jsonb_to_recordset(v_pending) AS s(
    product_variant_id uuid,tax_id uuid,tax_rule_id uuid,tax_rule_version integer,
    tax_rule_valid_from date,layout_version_id uuid,
    base_amount numeric(18,6),rate numeric(18,6),reduction numeric(18,6),
    fixed_amount numeric(18,6),raw_amount numeric(18,6),rounded_amount numeric(18,2),
    base_mode text,treatment_code text,is_recoverable boolean,is_withheld boolean,
    parameter_origin jsonb)
  WHERE (s.parameter_origin->>'ncm') IS NOT NULL;

  PERFORM public.fiscal_audit(_org,'fiscal.simulation_run','fiscal_simulations',v_sim.id,
    jsonb_build_object('establishment_id',_establishment_id,'operation_type_id',_operation_type_id,
      'blocking',v_blocking,'total_taxes',round(v_total,2)));

  -- A simulação é explicitamente não autoritativa.
  RETURN jsonb_build_object(
    'simulation_id',v_sim.id,
    'is_authorized_document',false,
    'disclaimer','Simulação não representa documento fiscal autorizado.',
    'lines',v_rows,'total_taxes',round(v_total,2),
    'has_blocking_issue',v_blocking,'warnings',v_warnings,
    'regime_id',v_regime,'on_date',_on_date);
END $$;

COMMIT;
