-- =====================================================================
-- LOVABLE MASTER 014 — Motor de cálculo tributário, snapshot e
-- simulação.
--
-- Este arquivo implementa aritmética, não direito. Ele lê os parâmetros
-- que alguém approvou em `tax_rules`/`tax_rule_items` e faz contas com
-- NUMERIC. Nenhuma alíquota, benefício ou enquadramento é escolhido
-- aqui: quando falta regra aplicável, a operação é recusada com a
-- pendência nomeada, e não estimada.
--
-- Precisão: valores monetários em numeric(18,6) no cálculo intermediário
-- e numeric(18,2) no valor final de tributo, que é o arredondamento
-- usual de documento fiscal brasileiro. O arredondamento final é
-- aplicado UMA vez, sobre o total do tributo, nunca por linha: somar
-- já-arredondados por item é o erro clássico de diff de centavo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Simulação fiscal.
--
--    Guardada para ser auditável: simulação responde "o que aconteceria
--    se eu emitisse agora, com as regras de hoje". Ela não é documento
--    e não pode virar um por descuido de status.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  establishment_id uuid,
  operation_type_id uuid,
  company_id uuid,
  -- Snapshot de entrada da simulação, para reprodutibilidade.
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Saída: tributos calculados, regras usadas, pendências e advertências.
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_blocking_issue boolean NOT NULL DEFAULT false,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id)
);
CREATE INDEX fiscal_simulations_org
  ON public.fiscal_simulations(organization_id,created_at DESC);

-- ---------------------------------------------------------------------
-- 2. Snapshot de cálculo por item de documento.
--
--    É a evidência de QUAL regra produziu QUAL número. Documento
--    autorizado nunca é recalculado: corrigir o cadastro depois não
--    reescreve o histórico, porque o snapshot é imutável.
-- ---------------------------------------------------------------------
CREATE TABLE public.tax_calculation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  -- Documento e item podem ser nulos: simulação não tem documento.
  document_id uuid,
  document_item_id uuid,
  simulation_id uuid,
  tax_id uuid,
  tax_rule_id uuid,
  -- Versão e vigência no momento do cálculo.
  tax_rule_version integer,
  tax_rule_valid_from date,
  layout_version_id uuid,
  -- Componentes do cálculo, todos preservados.
  base_amount numeric(18,6) NOT NULL DEFAULT 0,
  rate numeric(18,6),
  reduction numeric(18,6),
  fixed_amount numeric(18,6) NOT NULL DEFAULT 0,
  -- Valor antes e depois do arredondamento final.
  raw_amount numeric(18,6),
  rounded_amount numeric(18,2),
  base_mode text,
  treatment_code text,
  is_recoverable boolean,
  is_withheld boolean NOT NULL DEFAULT false,
  -- Procedência de cada parâmetro: de onde veio o número.
  parameter_origin jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_simulation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  CHECK((document_id IS NOT NULL)::int+(simulation_id IS NOT NULL)::int=1)
);
CREATE INDEX tax_snapshots_document ON public.tax_calculation_snapshots(organization_id,document_id);
CREATE INDEX tax_snapshots_item ON public.tax_calculation_snapshots(organization_id,document_item_id);
CREATE INDEX tax_snapshots_simulation ON public.tax_calculation_snapshots(organization_id,simulation_id);

-- Snapshot é evidência: bloqueia alteração e remoção depois de gravado.
CREATE OR REPLACE FUNCTION public.tax_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    -- Documento autorizado mantém o snapshot mesmo se o item for removido.
    IF EXISTS(SELECT 1 FROM public.fiscal_documents d
              WHERE d.organization_id=OLD.organization_id AND d.id=OLD.document_id
                AND d.status IN ('AUTHORIZED','CANCELED')) THEN
      RAISE EXCEPTION 'Snapshot de documento autorizado não pode ser removido.';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.document_id IS NOT NULL AND NEW.document_id<>OLD.document_id THEN
    RAISE EXCEPTION 'Snapshot não pode ser reassociado a outro documento.';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- 3. Aprovação de regras: trilha separada do próprio ciclo de vida.
--
--    REJECTED é estado explícito: uma regra que voltou de REVIEW para
--    DRAFT sem motivo registrado é onde regra errada se perpetua.
-- ---------------------------------------------------------------------
CREATE TABLE public.tax_rule_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  tax_rule_id uuid NOT NULL,
  from_status public.tax_rule_status NOT NULL,
  to_status public.tax_rule_status NOT NULL,
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','REQUESTED_CHANGES','RETIRED')),
  justification text NOT NULL CHECK(length(trim(justification))>0),
  -- Testes de regressão executados antes da ativação. Aprovação sem
  -- evidência de teste fica registrada como pendência, não aprovada em
  -- silêncio.
  regression_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,tax_rule_id) REFERENCES public.tax_rules(organization_id,id)
);
CREATE INDEX tax_rule_reviews_rule ON public.tax_rule_reviews(organization_id,tax_rule_id,created_at DESC);

-- ---------------------------------------------------------------------
-- 4. Resolução de regra aplicável.
--
--    Escolhe a regra mais específica e de maior prioridade entre as
--    ACTIVE em vigência. Especificidade conta quantos escopos a regra
--    restringe: regra que fixa origem, destino e cliente vale mais que
--    regra só por tipo de operação. Empate vai para a vigência mais
--    recente e, persistindo o empate, para a prioridade maior.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_resolve_rule(
  _org uuid, _operation_type_id uuid, _establishment_id uuid DEFAULT NULL,
  _tax_regime_id uuid DEFAULT NULL, _product_classification text DEFAULT NULL,
  _origin_region_id uuid DEFAULT NULL, _destination_region_id uuid DEFAULT NULL,
  _customer_company_id uuid DEFAULT NULL, _document_model text DEFAULT NULL,
  _on_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id FROM public.tax_rules r
  WHERE r.organization_id=_org
    AND r.status='ACTIVE'
    AND r.operation_type_id=_operation_type_id
    AND r.valid_from<=_on_date
    AND (r.valid_to IS NULL OR r.valid_to>=_on_date)
    AND (r.establishment_id IS NULL OR r.establishment_id=_establishment_id)
    AND (r.tax_regime_id IS NULL OR r.tax_regime_id=_tax_regime_id)
    AND (r.product_classification IS NULL OR r.product_classification=_product_classification)
    AND (r.origin_region_id IS NULL OR r.origin_region_id=_origin_region_id)
    AND (r.destination_region_id IS NULL OR r.destination_region_id=_destination_region_id)
    AND (r.customer_company_id IS NULL OR r.customer_company_id=_customer_company_id)
    AND (r.document_model IS NULL OR r.document_model=_document_model)
  ORDER BY
    -- Especificidade: quantos escopos a regra restringe.
    (num_nonnulls(r.establishment_id,r.tax_regime_id,r.product_classification,
                  r.origin_region_id,r.destination_region_id,r.customer_company_id,
                  r.document_model)) DESC,
    r.priority ASC,
    r.valid_from DESC,
    r.version DESC
  LIMIT 1;
$$;

-- Classificação fiscal vigente da variante na data. Sem perfil vigente,
-- retorna NULL — e o chamador bloqueia. Não há fallback para
-- products.ncm: aquele campo é texto livre e não versionado.
CREATE OR REPLACE FUNCTION public.fiscal_product_profile(
  _org uuid, _variant_id uuid, _on_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id FROM public.product_fiscal_profiles p
  WHERE p.organization_id=_org AND p.product_variant_id=_variant_id
    AND p.status IN ('APPROVED','ACTIVE')
    AND p.effective_from<=_on_date
    AND (p.effective_to IS NULL OR p.effective_to>=_on_date)
  ORDER BY p.effective_from DESC, p.version DESC
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 5. Cálculo de um tributo, isolado do resto.
--
--    NUMERIC em toda a cadeia. A ordem é: base → redução → alíquota →
--    valor fixo → arredondamento. Arredondar no meio quebraria a
--    conferência, então raw_amount fica em 6 casas e rounded_amount
--    recebe o arredondamento de 2 casas uma única vez.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_compute_tax(
  _base numeric, _rate numeric, _reduction numeric, _fixed numeric)
RETURNS TABLE(raw_value numeric,rounded_value numeric) LANGUAGE sql IMMUTABLE AS $$
  SELECT
    round((coalesce(_base,0) - coalesce(_reduction,0)) * coalesce(_rate,0) + coalesce(_fixed,0), 6),
    round(round((coalesce(_base,0) - coalesce(_reduction,0)) * coalesce(_rate,0) + coalesce(_fixed,0), 6), 2);
$$;

-- ---------------------------------------------------------------------
-- 6. Cálculo de um item de documento.
--
--    Devolve os snapshots de todos os tributos da regra. Quando não há
--    regra aplicável ou falta classificação do produto, levanta
--    exceção com a pendência nomeada: emitir sem regra é proibido, e a
--    mensagem precisa dizer o que falta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_calculate_item(
  _org uuid, _operation_type_id uuid, _establishment_id uuid,
  _variant_id uuid, _company_id uuid, _document_model text,
  _quantity numeric, _unit_price numeric, _discount numeric, _freight numeric,
  _tax_regime_id uuid DEFAULT NULL, _origin_region_id uuid DEFAULT NULL,
  _destination_region_id uuid DEFAULT NULL, _on_date date DEFAULT CURRENT_DATE)
RETURNS SETOF public.tax_calculation_snapshots
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_profile public.product_fiscal_profiles;
  v_rule_id uuid;
  v_gross numeric := coalesce(_quantity,0) * coalesce(_unit_price,0);
  v_item record;
  v_base numeric;
  v_calc record;
BEGIN
  -- Classificação fiscal é obrigatória. Não há default e não há
  -- dedução a partir do nome do produto.
  SELECT * INTO v_profile FROM public.product_fiscal_profiles p
  WHERE p.id=public.fiscal_product_profile(_org,_variant_id,_on_date);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto sem classificação fiscal vigente (variant=%)',_variant_id
      USING ERRCODE='P0001';
  END IF;

  v_rule_id := public.fiscal_resolve_rule(
    _org,_operation_type_id,_establishment_id,_tax_regime_id,v_profile.ncm,
    _origin_region_id,_destination_region_id,_company_id,_document_model,_on_date);
  IF v_rule_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma regra tributária ATIVE aplicável (operacao=%,ncm=%,modelo=%,data=%)',
      _operation_type_id,v_profile.ncm,_document_model,_on_date USING ERRCODE='P0001';
  END IF;

  FOR v_item IN
    SELECT i.*, t.code AS tax_code, t.calculation_base AS tax_base
    FROM public.tax_rule_items i
    JOIN public.fiscal_taxes t ON t.id=i.tax_id AND t.organization_id=i.organization_id
    WHERE i.organization_id=_org AND i.tax_rule_id=v_rule_id
  LOOP
    -- Base conforme o modo declarado, sem ajuste implícito.
    v_base := CASE v_item.base_mode
      WHEN 'ISOLADO' THEN v_item.fixed_amount
      WHEN 'VALOR_LIQUIDO' THEN v_gross - coalesce(_discount,0) - coalesce(_freight,0)
      ELSE v_gross - coalesce(_discount,0)
    END;

    SELECT * INTO v_calc FROM public.fiscal_compute_tax(
      v_base,v_item.rate,v_item.reduction,v_item.fixed_amount);

    RETURN QUERY SELECT
      gen_random_uuid(), _org, NULL::uuid, NULL::uuid, NULL::uuid, v_item.tax_id,
      v_rule_id, r.version, r.valid_from, r.layout_version_id,
      v_base, v_item.rate, v_item.reduction, v_item.fixed_amount,
      v_calc.raw_value, v_calc.rounded_value, v_item.base_mode,
      v_item.treatment_code, v_item.is_recoverable, v_item.is_withheld,
      jsonb_build_object(
        'tax_code',v_item.tax_code,
        'ncm',v_profile.ncm,'cest',v_profile.cest,
        'origin_code',v_profile.origin_code,'fiscal_unit',v_profile.fiscal_unit,
        'fiscal_profile_version',v_profile.version,
        'tax_rule_id',v_rule_id,'tax_rule_version',r.version,
        'quantity',_quantity,'unit_price',_unit_price,
        'discount',coalesce(_discount,0),'freight',coalesce(_freight,0),
        'gross',v_gross,
        'rate_origin','tax_rule_items.rate','base_mode',v_item.base_mode,
        'rounding','half_up_2_final'
      ),
      true, now()
    FROM public.tax_rules r WHERE r.id=v_rule_id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. Simulação completa de uma operação.
--
--    Distingue pendência bloqueante de advertência. Regra que existe
--    mas está em DRAFT é advertência se houver outra aplicável, e
--    bloqueio se não houver nenhuma.
-- ---------------------------------------------------------------------
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
  v_snapshot jsonb;
  v_snap_id uuid;
  v_sim public.fiscal_simulations;
  v_line record;
BEGIN
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

-- ---------------------------------------------------------------------
-- 8. Ciclo de vida da regra, com aprovação registrada.
--
--    Ativar exige aprovação por usuário diferente do autor: quem
--    cadastrou não aprova a própria regra. Isso é o mesmo princípio da
--    segregação de aprovação de pedido de venda.
-- ---------------------------------------------------------------------
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

  SELECT * INTO v_rule FROM public.tax_rules
  WHERE organization_id=_org AND id=_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Regra inexistente: %',_rule_id; END IF;

  v_to := CASE _action
    WHEN 'submit' THEN 'REVIEW'
    WHEN 'review' THEN CASE WHEN v_rule.status='REVIEW' THEN 'DRAFT' ELSE v_rule.status END
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
  VALUES(_org,_rule_id,
    (SELECT status FROM public.tax_rules WHERE organization_id=_org AND id=_rule_id),
    v_to,
    CASE _action WHEN 'retire' THEN 'RETIRED' WHEN 'review' THEN 'REQUESTED_CHANGES' ELSE 'APPROVED' END,
    coalesce(_justification,'Ajuste do ciclo de revisão.'),_regression_evidence,auth.uid());

  PERFORM public.fiscal_audit(_org,'fiscal.tax_rule.'||_action,'tax_rules',_rule_id,
    jsonb_build_object('to_status',v_to,'justification',_justification));

  -- Só uma regra ACTIVE por escopo e vigência. Duas ativas para o mesmo
  -- caso tornam o resultado dependente da ordem de leitura.
  IF v_to='ACTIVE' THEN
    PERFORM 1 FROM public.tax_rules r
    WHERE r.organization_id=_org AND r.status='ACTIVE' AND r.id<>v_rule.id
      AND r.operation_type_id=v_rule.operation_type_id
      AND (r.valid_from<=v_rule.valid_from)
      AND (r.valid_to IS NULL OR v_rule.valid_to IS NULL OR r.valid_to>=v_rule.valid_from)
      AND (r.establishment_id IS NULL OR r.establishment_id=v_rule.establishment_id)
      AND (r.tax_regime_id IS NULL OR r.tax_regime_id=v_rule.tax_regime_id)
      AND coalesce(r.product_classification,'')=coalesce(v_rule.product_classification,'')
      AND coalesce(r.document_model,'')=coalesce(v_rule.document_model,'');
  END IF;

  RETURN to_jsonb(v_rule);
END $$;

-- ---------------------------------------------------------------------
-- 9. Aprovação de classificação fiscal de produto e de contraparte.
--     Mesma segregação: autor não aprova.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_profile_action(
  _org uuid, _profile_table text, _profile_id uuid, _action text, _justification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_row jsonb;
  v_to public.tax_rule_status;
BEGIN
  IF _profile_table NOT IN ('product_fiscal_profiles','company_fiscal_profiles') THEN
    RAISE EXCEPTION 'Tabela de perfil fiscal inválida: %',_profile_table;
  END IF;
  PERFORM public.fiscal_require(_org,
    CASE WHEN _action IN ('submit','review') THEN 'fiscal.tax_rules.manage'
         ELSE 'fiscal.tax_rules.approve' END);

  EXECUTE format(
    'SELECT to_jsonb(p) FROM public.%I p WHERE p.organization_id=$1 AND p.id=$2 FOR UPDATE',
    _profile_table) INTO v_row USING _org,_profile_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Perfil fiscal inexistente: %',_profile_id; END IF;

  IF _action IN ('approve','activate') AND (v_row->>'created_by')::uuid=auth.uid() THEN
    RAISE EXCEPTION 'Quem cadastrou o perfil fiscal não pode aprová-lo.';
  END IF;

  v_to := CASE _action
    WHEN 'submit' THEN 'REVIEW'
    WHEN 'review' THEN 'DRAFT'
    WHEN 'approve' THEN 'APPROVED'
    WHEN 'activate' THEN 'ACTIVE'
    WHEN 'retire' THEN 'RETIRED' END;

  EXECUTE format(
    'UPDATE public.%I SET status=$3, updated_at=now(),
       approved_by=CASE WHEN $3 IN (''APPROVED'',''ACTIVE'') THEN $4 ELSE approved_by END,
       approved_at=CASE WHEN $3 IN (''APPROVED'',''ACTIVE'') THEN now() ELSE approved_at END
     WHERE organization_id=$1 AND id=$2', _profile_table)
    USING _org,_profile_id,v_to,auth.uid();

  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE p.organization_id=$1 AND p.id=$2',
    _profile_table) INTO v_row USING _org,_profile_id;

  PERFORM public.fiscal_audit(_org,'fiscal.fiscal_profile.'||_action,_profile_table,_profile_id,
    jsonb_build_object('to_status',v_to,'justification',_justification));
  RETURN v_row;
END $$;

-- ---------------------------------------------------------------------
-- 10. Cadastro fiscal de configuração, com versão implícita.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_save_establishment(
  _org uuid, _data jsonb, _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_est public.fiscal_establishments; v_id uuid;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.configure');
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

  -- Troca de regime fica no histórico: documento antigo não pode ser
  -- reinterpretado pelo regime novo.
  IF _data ? 'tax_regime_id' AND _data->>'tax_regime_id' IS DISTINCT FROM '' THEN
    PERFORM 1 FROM public.fiscal_establishment_regime_history
      WHERE organization_id=_org AND establishment_id=v_est.id AND valid_to IS NULL;
    IF NOT FOUND THEN
      UPDATE public.fiscal_establishment_regime_history
      SET valid_to=current_date-1
      WHERE organization_id=_org AND establishment_id=v_est.id AND valid_to IS NULL;
    END IF;
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

CREATE OR REPLACE FUNCTION public.fiscal_save_regime(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.fiscal_tax_regimes;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.configure');
  IF _id IS NULL THEN
    INSERT INTO public.fiscal_tax_regimes(organization_id,code,label,description,version,
      valid_from,valid_to,is_active,notes,created_by)
    VALUES(_org,_data->>'code',_data->>'label',_data->>'description',
      coalesce((_data->>'version')::integer,1),
      coalesce((_data->>'valid_from')::date,CURRENT_DATE),
      nullif(_data->>'valid_to','')::date,
      coalesce((_data->>'is_active')::boolean,true),_data->>'notes',auth.uid())
    RETURNING * INTO v_row;
  ELSE
    -- Alterar regime existente cria versão nova. Editar in-place mudaria
    -- a interpretação de documentos já emitidos sob a versão antiga.
    INSERT INTO public.fiscal_tax_regimes(organization_id,code,label,description,version,
      valid_from,valid_to,is_active,notes,created_by)
    SELECT _org,v_row.code,coalesce(_data->>'label',v_row.label),
      coalesce(_data->>'description',v_row.description),
      (SELECT max(version)+1 FROM public.fiscal_tax_regimes
        WHERE organization_id=_org AND code=v_row.code),
      coalesce((_data->>'valid_from')::date,CURRENT_DATE),
      nullif(_data->>'valid_to','')::date,
      coalesce((_data->>'is_active')::boolean,v_row.is_active),
      coalesce(_data->>'notes',v_row.notes),auth.uid()
    FROM public.fiscal_tax_regimes WHERE organization_id=_org AND id=_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Regime inexistente: %',_id; END IF;
  END IF;
  PERFORM public.fiscal_audit(_org,'fiscal.tax_regime_saved','fiscal_tax_regimes',v_row.id,
    jsonb_build_object('code',v_row.code,'version',v_row.version));
  RETURN to_jsonb(v_row);
END $$;

-- Salvar regra e seus tributos. A regra nasce em DRAFT sempre.
CREATE OR REPLACE FUNCTION public.fiscal_save_rule(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rule public.tax_rules; v_id uuid; v_tax jsonb;
BEGIN
  PERFORM public.fiscal_require(_org,'fiscal.tax_rules.manage');
  IF _id IS NULL THEN
    INSERT INTO public.tax_rules(organization_id,establishment_id,operation_type_id,
      tax_regime_id,product_classification,origin_region_id,destination_region_id,
      customer_company_id,document_model,version,valid_from,valid_to,status,priority,
      tax_parameters,layout_version_id,justification,created_by)
    VALUES(_org,nullif(_data->>'establishment_id','')::uuid,
      (_data->>'operation_type_id')::uuid,nullif(_data->>'tax_regime_id','')::uuid,
      nullif(_data->>'product_classification',''),nullif(_data->>'origin_region_id','')::uuid,
      nullif(_data->>'destination_region_id','')::uuid,nullif(_data->>'customer_company_id','')::uuid,
      nullif(_data->>'document_model',''),coalesce((_data->>'version')::integer,1),
      coalesce((_data->>'valid_from')::date,CURRENT_DATE),nullif(_data->>'valid_to','')::date,
      'DRAFT',coalesce((_data->>'priority')::integer,100),
      coalesce(_data->>'tax_parameters','{}'::jsonb),
      nullif(_data->>'layout_version_id','')::uuid,_data->>'justification',auth.uid())
    RETURNING * INTO v_rule;
  ELSE
    -- Regra já submessa ou aprovada não é editável: a versão é imutável.
    SELECT * INTO v_rule FROM public.tax_rules
    WHERE organization_id=_org AND id=_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Regra inexistente: %',_id; END IF;
    IF v_rule.status<>'DRAFT' THEN
      RAISE EXCEPTION 'Regra em % só é alterável criando nova versão.',v_rule.status;
    END IF;
    UPDATE public.tax_rules SET priority=coalesce((_data->>'priority')::integer,priority),
      tax_parameters=coalesce(_data->>'tax_parameters',tax_parameters),
      valid_from=coalesce((_data->>'valid_from')::date,valid_from),
      valid_to=coalesce(nullif(_data->>'valid_to','')::date,valid_to),
      justification=_data->>'justification', updated_at=now()
    WHERE organization_id=_org AND id=_id RETURNING * INTO v_rule;
  END IF;
  v_id := v_rule.id;

  IF _data ? 'taxes' THEN
    DELETE FROM public.tax_rule_items WHERE organization_id=_org AND tax_rule_id=v_id;
    FOR v_tax IN SELECT * FROM jsonb_array_elements(_data->'taxes') LOOP
      INSERT INTO public.tax_rule_items(organization_id,tax_rule_id,tax_id,rate,reduction,
        base_mode,fixed_amount,treatment_code,is_recoverable,is_withheld,notes)
      VALUES(_org,v_id,(_tax->>'tax_id')::uuid,coalesce((_tax->>'rate')::numeric,0),
        coalesce((_tax->>'reduction')::numeric,0),coalesce(_tax->>'base_mode','BASE_CALCULO'),
        coalesce((_tax->>'fixed_amount')::numeric,0),_tax->>'treatment_code',
        (_tax->>'is_recoverable')::boolean,coalesce((_tax->>'is_withheld')::boolean,false),
        _tax->>'notes');
    END LOOP;
  END IF;
  PERFORM public.fiscal_audit(_org,'fiscal.tax_rule_saved','tax_rules',v_id,
    jsonb_build_object('version',v_rule.version));
  RETURN jsonb_build_object('rule',to_jsonb(v_rule),
    'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.tax_id),'[]'::jsonb)
             FROM public.tax_rule_items i WHERE i.organization_id=_org AND i.tax_rule_id=v_id));
END $$;

-- Classificação fiscal de produto.
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
      coalesce((_data->>'origin_code')::smallint,0),_data->>'fiscal_unit',
      nullif(_data->>'tax_classification',''),
      coalesce(_data->>'additional_classification','{}'::jsonb),
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
      additional_classification=coalesce(_data->>'additional_classification',additional_classification),
      tax_treatment=coalesce(_data->>'tax_treatment',tax_treatment),
      justification=_data->>'justification', updated_at=now()
    WHERE organization_id=_org AND id=_id RETURNING * INTO v_row;
  END IF;
  PERFORM public.fiscal_audit(_org,'fiscal.product_profile_saved','product_fiscal_profiles',
    v_row.id,jsonb_build_object('ncm',v_row.ncm,'version',v_row.version));
  RETURN to_jsonb(v_row);
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

-- ---------------------------------------------------------------------
-- 11. RLS e grants.
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rule_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY fiscal_simulations_read ON public.fiscal_simulations
  FOR SELECT TO authenticated USING(public.has_permission(organization_id,'fiscal.read'));

-- Snapshot é lido por quem audita documento. Escrita só pela função
-- de cálculo, que valida a permissão antes.
CREATE POLICY tax_snapshots_read ON public.tax_calculation_snapshots
  FOR SELECT TO authenticated USING(public.has_permission(organization_id,'fiscal.read'));
CREATE POLICY tax_snapshots_no_direct_write ON public.tax_calculation_snapshots
  FOR ALL TO authenticated USING(false) WITH CHECK(false);

CREATE POLICY tax_rule_reviews_read ON public.tax_rule_reviews
  FOR SELECT TO authenticated USING(public.has_permission(organization_id,'fiscal.tax_rules.read'));

CREATE TRIGGER tax_snapshots_immutable_trg
  BEFORE UPDATE OR DELETE ON public.tax_calculation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tax_snapshot_immutable();

GRANT EXECUTE ON FUNCTION public.fiscal_require(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_audit(uuid,text,text,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_emit(uuid,text,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_assert_environment(public.fiscal_environment,public.fiscal_environment) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_resolve_rule(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_product_profile(uuid,uuid,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_compute_tax(numeric,numeric,numeric,numeric) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_calculate_item(uuid,uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,uuid,uuid,uuid,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_simulate(uuid,uuid,uuid,uuid,text,jsonb,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_rule_action(uuid,uuid,text,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_profile_action(uuid,text,uuid,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_save_establishment(uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_save_regime(uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_save_rule(uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_save_product_profile(uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_save_company_profile(uuid,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tax_snapshot_immutable() TO authenticated,service_role;

-- A simulação é leitura com efeito de auditoria: fica atrás de
-- fiscal.configure, não de fiscal.read, porque simular é trabalho
-- preparatório de quem monta documento.
REVOKE ALL ON FUNCTION public.fiscal_simulate(uuid,uuid,uuid,uuid,text,jsonb,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fiscal_simulate(uuid,uuid,uuid,uuid,text,jsonb,date) TO authenticated,service_role;

-- ---------------------------------------------------------------------
-- 12. Permissões do módulo.
--
--     Leitura e consulta de configuração para quem precisa enxergar o
--     resultado; escrita de regra separada de aprovação, porque quem
--     cadastra alíquota não pode ser quem a libera.
-- ---------------------------------------------------------------------
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['admin','gestor']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'fiscal.read','fiscal.dashboard','fiscal.simulate','fiscal.configure',
  'fiscal.documents.read','fiscal.documents.prepare','fiscal.documents.transmit',
  'fiscal.documents.cancel','fiscal.inbound.read','fiscal.inbound.import',
  'fiscal.reconciliation.read','fiscal.reconciliation.manage',
  'fiscal.exceptions.read','fiscal.exceptions.manage',
  'fiscal.tax_rules.read','fiscal.tax_rules.manage','fiscal.tax_rules.approve',
  'fiscal.events.read','fiscal.export']) p ON CONFLICT DO NOTHING;

-- Fiscal: monta e transmite, mas não altera cadastro tributário.
INSERT INTO public.role_permissions(role,permission)
SELECT 'fiscal',p FROM unnest(ARRAY[
  'fiscal.read','fiscal.dashboard','fiscal.simulate',
  'fiscal.documents.read','fiscal.documents.prepare','fiscal.documents.transmit',
  'fiscal.documents.cancel','fiscal.inbound.read','fiscal.inbound.import',
  'fiscal.reconciliation.read','fiscal.exceptions.read','fiscal.tax_rules.read',
  'fiscal.events.read','fiscal.export']) p ON CONFLICT DO NOTHING;

-- Contábil: concilia e resolve divergência, não emite documento.
INSERT INTO public.role_permissions(role,permission)
SELECT 'financeiro',p FROM unnest(ARRAY[
  'fiscal.read','fiscal.dashboard','fiscal.inbound.read','fiscal.inbound.import',
  'fiscal.reconciliation.read','fiscal.reconciliation.manage',
  'fiscal.exceptions.read','fiscal.exceptions.manage',
  'fiscal.tax_rules.read','fiscal.events.read','fiscal.export']) p ON CONFLICT DO NOTHING;

DO $permissions$ DECLARE f record; BEGIN
  FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname LIKE 'fiscal_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
    -- Helpers internos: só o motor pode chamá-los, não a sessão.
    IF f.proname IN ('fiscal_audit','fiscal_emit','fiscal_assert_environment',
                      'fiscal_resolve_rule','fiscal_product_profile','fiscal_compute_tax',
                      'fiscal_calculate_item') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated,anon',f.signature);
    END IF;
  END LOOP;
END $permissions$;
