-- MASTER 008: Financeiro — Contas a Receber/Pagar, Financial Ledger e Fluxo de Caixa.
-- Separação obrigatória: FATO OPERACIONAL -> OBRIGAÇÃO FINANCEIRA -> MOVIMENTO FINANCEIRO.
-- "Venda não é recebimento", "despesa não é pagamento", "conta a receber não é caixa".
-- FinancialTransaction é a fonte oficial do caixa realizado (ledger, nunca float/dinheiro editável).
-- Nada de DRE/contabilidade/boletos/PIX reais/integração bancária aqui.
BEGIN;

-- =====================================================================
-- 1. Sequências de documentação interna (exibição apenas; nunca PK).
-- =====================================================================
CREATE SEQUENCE public.finance_receivable_seq;
CREATE SEQUENCE public.finance_payable_seq;

-- =====================================================================
-- 2. Tabelas de configuração financeira.
-- =====================================================================
CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  name text NOT NULL CHECK(length(trim(name))>0),
  type text NOT NULL DEFAULT 'EXPENSE' CHECK(type IN ('REVENUE','EXPENSE')),
  parent_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code), UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,parent_id) REFERENCES public.financial_categories(organization_id,id)
);
CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  name text NOT NULL CHECK(length(trim(name))>0),
  parent_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code), UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,parent_id) REFERENCES public.cost_centers(organization_id,id)
);
CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  name text NOT NULL CHECK(length(trim(name))>0),
  type text NOT NULL DEFAULT 'BANK' CHECK(type IN ('BANK','CASH','DIGITAL_WALLET','PAYMENT_PROVIDER','OTHER')),
  bank_name text,
  agency text,
  account_reference text,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','CLOSED')),
  opening_balance_reference numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,name), UNIQUE(organization_id,id)
);
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  name text NOT NULL CHECK(length(trim(name))>0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code), UNIQUE(organization_id,id)
);
CREATE TABLE public.finance_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations,
  currency text NOT NULL DEFAULT 'BRL',
  partner_receivable_due_days integer NOT NULL DEFAULT 7 CHECK(partner_receivable_due_days>=0),
  partner_receivable_installments integer NOT NULL DEFAULT 1 CHECK(partner_receivable_installments BETWEEN 1 AND 12),
  updated_by uuid REFERENCES public.profiles,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. Financial Ledger e obrigações (DECIMAL, nunca float; BRL default).
-- =====================================================================
CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  financial_account_id uuid NOT NULL,
  type text NOT NULL CHECK(type IN
    ('OPENING_BALANCE','RECEIVABLE_PAYMENT','PAYABLE_PAYMENT','FINANCIAL_TRANSFER','DIRECT','REVERSAL')),
  direction text NOT NULL CHECK(direction IN ('IN','OUT')),
  company_id uuid,
  operation_company_id uuid,
  amount numeric(14,2) NOT NULL CHECK(amount>0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reference_type text,
  reference_id uuid,
  payment_method_id uuid,
  financial_category_id uuid,
  cost_center_id uuid,
  description text,
  status text NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED')),
  reversal_of_id uuid,
  idempotency_key text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,idempotency_key),
  CHECK(reversal_of_id IS NULL OR reversal_of_id<>id),
  FOREIGN KEY(organization_id,financial_account_id) REFERENCES public.financial_accounts(organization_id,id),
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
  FOREIGN KEY(organization_id,payment_method_id) REFERENCES public.payment_methods(organization_id,id),
  FOREIGN KEY(organization_id,financial_category_id) REFERENCES public.financial_categories(organization_id,id),
  FOREIGN KEY(organization_id,cost_center_id) REFERENCES public.cost_centers(organization_id,id)
);
CREATE INDEX financial_transactions_org_date ON public.financial_transactions(organization_id,occurred_at,id);
CREATE INDEX financial_transactions_org_account ON public.financial_transactions(organization_id,financial_account_id,occurred_at);
CREATE INDEX financial_transactions_org_reference ON public.financial_transactions(organization_id,reference_type,reference_id);

CREATE TABLE public.account_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  company_id uuid NOT NULL,
  source_type text NOT NULL CHECK(length(trim(source_type))>0),
  source_id text NOT NULL,
  source_status text NOT NULL DEFAULT 'ACTIVE' CHECK(source_status IN ('ACTIVE','SOURCE_REOPENED')),
  document_number text NOT NULL,
  description text NOT NULL CHECK(length(trim(description))>0),
  issue_date date NOT NULL,
  due_date date NOT NULL,
  competence_date date,
  original_amount numeric(14,2) NOT NULL CHECK(original_amount>=0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  interest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(interest_amount>=0),
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(penalty_amount>=0),
  adjustment_amount numeric(14,2) NOT NULL DEFAULT 0,
  open_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN
    ('DRAFT','OPEN','PARTIALLY_PAID','PAID','OVERDUE','CANCELED','WRITTEN_OFF')),
  financial_category_id uuid,
  cost_center_id uuid,
  installment_number integer NOT NULL DEFAULT 1 CHECK(installment_number>=1),
  total_installments integer NOT NULL DEFAULT 1 CHECK(total_installments>=1),
  parent_id uuid,
  notes text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,document_number),
  UNIQUE(organization_id,source_type,source_id,installment_number),
  CHECK(installment_number<=total_installments),
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
  FOREIGN KEY(organization_id,financial_category_id) REFERENCES public.financial_categories(organization_id,id),
  FOREIGN KEY(organization_id,cost_center_id) REFERENCES public.cost_centers(organization_id,id),
  FOREIGN KEY(organization_id,parent_id) REFERENCES public.account_receivables(organization_id,id)
);
CREATE INDEX account_receivables_org_due ON public.account_receivables(organization_id,due_date,id);
CREATE INDEX account_receivables_org_company ON public.account_receivables(organization_id,company_id,status);

CREATE TABLE public.account_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  company_id uuid,
  source_type text NOT NULL CHECK(length(trim(source_type))>0),
  source_id text NOT NULL,
  source_status text NOT NULL DEFAULT 'ACTIVE' CHECK(source_status IN ('ACTIVE','SOURCE_REOPENED')),
  document_number text NOT NULL,
  description text NOT NULL CHECK(length(trim(description))>0),
  issue_date date NOT NULL,
  due_date date NOT NULL,
  competence_date date,
  original_amount numeric(14,2) NOT NULL CHECK(original_amount>=0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  interest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(interest_amount>=0),
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(penalty_amount>=0),
  adjustment_amount numeric(14,2) NOT NULL DEFAULT 0,
  open_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN
    ('DRAFT','SCHEDULED','OPEN','PARTIALLY_PAID','PAID','OVERDUE','CANCELED')),
  financial_category_id uuid,
  cost_center_id uuid,
  notes text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,document_number),
  UNIQUE(organization_id,source_type,source_id),
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
  FOREIGN KEY(organization_id,financial_category_id) REFERENCES public.financial_categories(organization_id,id),
  FOREIGN KEY(organization_id,cost_center_id) REFERENCES public.cost_centers(organization_id,id)
);
CREATE INDEX account_payables_org_due ON public.account_payables(organization_id,due_date,id);

CREATE TABLE public.receivable_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  receivable_id uuid NOT NULL,
  financial_transaction_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  interest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(interest_amount>=0),
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(penalty_amount>=0),
  settled_at timestamptz NOT NULL DEFAULT now(),
  is_reversal boolean NOT NULL DEFAULT false,
  reversal_of_id uuid,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,reversal_of_id),
  FOREIGN KEY(organization_id,receivable_id) REFERENCES public.account_receivables(organization_id,id),
  FOREIGN KEY(organization_id,financial_transaction_id) REFERENCES public.financial_transactions(organization_id,id)
);
CREATE TABLE public.payable_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  payable_id uuid NOT NULL,
  financial_transaction_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  interest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(interest_amount>=0),
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(penalty_amount>=0),
  settled_at timestamptz NOT NULL DEFAULT now(),
  is_reversal boolean NOT NULL DEFAULT false,
  reversal_of_id uuid,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,reversal_of_id),
  FOREIGN KEY(organization_id,payable_id) REFERENCES public.account_payables(organization_id,id),
  FOREIGN KEY(organization_id,financial_transaction_id) REFERENCES public.financial_transactions(organization_id,id)
);

CREATE TABLE public.financial_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK(amount>0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  transfer_key text,
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,transfer_key),
  CHECK(from_account_id<>to_account_id),
  FOREIGN KEY(organization_id,from_account_id) REFERENCES public.financial_accounts(organization_id,id),
  FOREIGN KEY(organization_id,to_account_id) REFERENCES public.financial_accounts(organization_id,id)
);

CREATE TABLE public.financial_recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  name text NOT NULL CHECK(length(trim(name))>0),
  direction text NOT NULL CHECK(direction IN ('IN','OUT')),
  company_id uuid,
  amount numeric(14,2) NOT NULL CHECK(amount>0),
  financial_category_id uuid,
  cost_center_id uuid,
  payment_method_id uuid,
  frequency text NOT NULL DEFAULT 'MONTHLY' CHECK(frequency IN ('MONTHLY')),
  day_of_month integer NOT NULL DEFAULT 1 CHECK(day_of_month BETWEEN 1 AND 31),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),
  FOREIGN KEY(organization_id,financial_category_id) REFERENCES public.financial_categories(organization_id,id),
  FOREIGN KEY(organization_id,cost_center_id) REFERENCES public.cost_centers(organization_id,id),
  FOREIGN KEY(organization_id,payment_method_id) REFERENCES public.payment_methods(organization_id,id)
);

CREATE TABLE public.financial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  year integer NOT NULL,
  month integer NOT NULL CHECK(month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,year,month), UNIQUE(organization_id,id)
);

-- =====================================================================
-- 4. RLS + grants: leitura por permissão; escrita somente via RPC.
-- =====================================================================
DO $$ DECLARE t text; perm text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_categories','cost_centers','financial_accounts','payment_methods','finance_settings',
  'financial_transactions','account_receivables','account_payables','receivable_settlements','payable_settlements',
  'financial_transfers','financial_recurrence_rules','financial_periods'] LOOP
  perm:='finance.read';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,perm);
 END LOOP;
END $$;

-- =====================================================================
-- 5. Permissões novas do MASTER 008.
-- =====================================================================
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor','financeiro','estoque','producao','comercial','marketplace']) r
 CROSS JOIN unnest(ARRAY['finance.read','finance.dashboard','finance.export','receivables.read','payables.read',
  'financial_accounts.read','financial_categories.read','cost_centers.read','payment_methods.read']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor','financeiro']) r CROSS JOIN unnest(ARRAY[
 'receivables.create','receivables.update','receivables.cancel','receivables.settle','receivables.reverse','receivables.write_off',
 'payables.create','payables.update','payables.approve','payables.cancel','payables.settle','payables.reverse',
 'financial_accounts.manage','financial_categories.manage','cost_centers.manage','financial_transfers.create','finance.manage']) p ON CONFLICT DO NOTHING;

-- =====================================================================
-- 6. Infra (require/audit) e guards.
-- =====================================================================
CREATE FUNCTION public.finance_require(_org uuid,_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Sem permissão: %.',_permission; END IF; END
$$;
CREATE FUNCTION public.finance_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context) VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;

CREATE FUNCTION public.finance_guard_relations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_data jsonb:=to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  IF TG_OP='DELETE' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY CASE TG_TABLE_NAME
    WHEN 'financial_transactions' THEN ARRAY[['financial_account_id','financial_accounts'],['company_id','companies'],['payment_method_id','payment_methods'],['financial_category_id','financial_categories'],['cost_center_id','cost_centers'],['reversal_of_id','financial_transactions']]
    WHEN 'account_receivables' THEN ARRAY[['company_id','companies'],['financial_category_id','financial_categories'],['cost_center_id','cost_centers'],['parent_id','account_receivables']]
    WHEN 'account_payables' THEN ARRAY[['company_id','companies'],['financial_category_id','financial_categories'],['cost_center_id','cost_centers']]
    WHEN 'receivable_settlements' THEN ARRAY[['receivable_id','account_receivables'],['financial_transaction_id','financial_transactions'],['reversal_of_id','receivable_settlements']]
    WHEN 'payable_settlements' THEN ARRAY[['payable_id','account_payables'],['financial_transaction_id','financial_transactions'],['reversal_of_id','payable_settlements']]
    WHEN 'financial_transfers' THEN ARRAY[['from_account_id','financial_accounts'],['to_account_id','financial_accounts']]
    WHEN 'financial_recurrence_rules' THEN ARRAY[['company_id','companies'],['financial_category_id','financial_categories'],['cost_center_id','cost_centers'],['payment_method_id','payment_methods']]
    ELSE ARRAY[]::text[]
  END
  LOOP
    v_id:=(v_data->>v_pair[1])::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_transactions','account_receivables','account_payables','receivable_settlements','payable_settlements',
  'financial_transfers','financial_recurrence_rules'] LOOP
  EXECUTE format('CREATE TRIGGER finance_tenant_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.finance_guard_relations()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.finance_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW); jold jsonb:=to_jsonb(OLD); v_kind text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico financeiro não pode ser excluído.'; END IF;
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  IF TG_TABLE_NAME IN ('financial_transactions','receivable_settlements','payable_settlements','financial_transfers') THEN
    RAISE EXCEPTION 'Movimento financeiro consolidado é imutável; corrija por reversão.';
  ELSIF TG_TABLE_NAME IN ('account_receivables','account_payables') THEN
    IF (j-'organization_id'-'company_id'-'source_type'-'source_id'-'document_number'-'original_amount'-'currency'-'issue_date'-'total_installments'-'parent_id')
       <>(jold-'organization_id'-'company_id'-'source_type'-'source_id'-'document_number'-'original_amount'-'currency'-'issue_date'-'total_installments'-'parent_id')
       THEN RAISE EXCEPTION 'Dados de origem do título imutáveis fora do RPC.'; END IF;
  ELSIF TG_TABLE_NAME IN ('financial_categories','cost_centers') THEN
    IF (j-'code'-'organization_id')<>(jold-'code'-'organization_id') THEN RAISE EXCEPTION 'Código/org imutável.'; END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inative em vez de excluir.'; END IF;
  ELSIF TG_TABLE_NAME IN ('financial_accounts','payment_methods') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inative em vez de excluir.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_transactions','account_receivables','account_payables','receivable_settlements','payable_settlements',
  'financial_transfers','financial_categories','cost_centers','financial_accounts','payment_methods'] LOOP
  EXECUTE format('CREATE TRIGGER finance_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.finance_guard()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finance_require(uuid,text),public.finance_guard_relations(),public.finance_guard() FROM PUBLIC,anon,authenticated;

-- =====================================================================
-- 7. Núcleo financeiro interno.
-- =====================================================================
CREATE FUNCTION public.finance_balance(_org uuid,_account uuid DEFAULT NULL,_at timestamptz DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT round(coalesce(sum(CASE direction WHEN 'IN' THEN amount ELSE -amount END),0),2)
  FROM public.financial_transactions
  WHERE organization_id=_org AND (_account IS NULL OR financial_account_id=_account)
    AND (_at IS NULL OR occurred_at<_at);
$$;

CREATE FUNCTION public.finance_document_paid(_org uuid,_kind text,_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE _kind WHEN 'receivable' THEN
      (SELECT coalesce(sum(CASE WHEN is_reversal THEN -amount ELSE amount END),0) FROM public.receivable_settlements WHERE organization_id=_org AND receivable_id=_id)
    ELSE
      (SELECT coalesce(sum(CASE WHEN is_reversal THEN -amount ELSE amount END),0) FROM public.payable_settlements WHERE organization_id=_org AND payable_id=_id)
    END;
$$;

CREATE FUNCTION public.finance_document_open(_org uuid,_kind text,_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT round(GREATEST(original_amount + interest_amount + penalty_amount + adjustment_amount
    - discount_amount - public.finance_document_paid(_org,_kind,id),0),2)
  FROM CASE _kind
    WHEN 'receivable' THEN public.account_receivables ELSE public.account_payables END
  WHERE organization_id=_org AND id=_id;
$$;

CREATE FUNCTION public.finance_refresh_document(_org uuid,_kind text,_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_open numeric; v_paid numeric; v_total numeric; v_new text;
BEGIN
  v_total:=(SELECT original_amount+interest_amount+penalty_amount+adjustment_amount-discount_amount FROM CASE
      WHEN _kind='receivable' THEN public.account_receivables ELSE public.account_payables END WHERE organization_id=_org AND id=_id);
  v_paid:=public.finance_document_paid(_org,_kind,_id);
  v_open:=round(GREATEST(v_total-v_paid,0),2);
  v_new:=CASE WHEN v_open<=0.005 AND v_paid>0 THEN 'PAID' WHEN v_paid>0 THEN 'PARTIALLY_PAID' ELSE 'OPEN' END;
  IF _kind='receivable' THEN
    UPDATE public.account_receivables SET open_amount=v_open,status=v_new,updated_at=now() WHERE organization_id=_org AND id=_id;
  ELSE
    UPDATE public.account_payables SET open_amount=v_open,status=v_new,updated_at=now() WHERE organization_id=_org AND id=_id;
  END IF;
END;
$$;

-- =====================================================================
-- 8. RPC: catálogo financeiro (categorias, centros de custo, contas, formas).
-- =====================================================================
CREATE FUNCTION public.fin_save_category(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.finance_require(_org,'financial_categories.manage');
  IF _id IS NULL THEN
    INSERT INTO public.financial_categories(organization_id,code,name,type,parent_id,status,sort_order)
    VALUES (_org,trim(_data->>'code'),trim(_data->>'name'),COALESCE(_data->>'type','EXPENSE'),
      nullif((_data->>'parent_id')::uuid::text,'')::uuid,COALESCE(_data->>'status','ACTIVE'),COALESCE((_data->>'sort_order')::int,0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.financial_categories SET name=COALESCE(nullif(trim(_data->>'name'),''),name),
      type=COALESCE(_data->>'type',type),status=COALESCE(_data->>'status',status),
      sort_order=COALESCE((_data->>'sort_order')::int,sort_order),parent_id=nullif((_data->>'parent_id')::uuid::text,'')::uuid,updated_at=now()
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Categoria não encontrada nesta organização.'; END IF;
  END IF;
  PERFORM public.finance_audit(_org,'finance.category.save','financial_categories',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.fin_save_cost_center(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.finance_require(_org,'cost_centers.manage');
  IF _id IS NULL THEN
    INSERT INTO public.cost_centers(organization_id,code,name,parent_id,status)
    VALUES (_org,trim(_data->>'code'),trim(_data->>'name'),nullif((_data->>'parent_id')::uuid::text,'')::uuid,COALESCE(_data->>'status','ACTIVE'))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.cost_centers SET name=COALESCE(nullif(trim(_data->>'name'),''),name),
      status=COALESCE(_data->>'status',status),parent_id=nullif((_data->>'parent_id')::uuid::text,'')::uuid,updated_at=now()
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Centro de custo não encontrado nesta organização.'; END IF;
  END IF;
  PERFORM public.finance_audit(_org,'finance.cost_center.save','cost_centers',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.fin_save_account(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.finance_require(_org,'financial_accounts.manage');
  IF _id IS NULL THEN
    INSERT INTO public.financial_accounts(organization_id,name,type,bank_name,agency,account_reference,currency,status,opening_balance_reference)
    VALUES (_org,trim(_data->>'name'),COALESCE(_data->>'type','BANK'),nullif(trim(COALESCE(_data->>'bank_name','')),''),
      nullif(trim(COALESCE(_data->>'agency','')),''),nullif(trim(COALESCE(_data->>'account_reference','')),''),
      COALESCE(_data->>'currency','BRL'),COALESCE(_data->>'status','ACTIVE'),nullif((_data->>'opening_balance_reference')::numeric::text,'')::numeric)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.financial_accounts SET name=COALESCE(nullif(trim(_data->>'name'),''),name),
      type=COALESCE(_data->>'type',type),bank_name=nullif(trim(COALESCE(_data->>'bank_name','')),''),
      agency=nullif(trim(COALESCE(_data->>'agency','')),''),account_reference=nullif(trim(COALESCE(_data->>'account_reference','')),''),
      currency=COALESCE(_data->>'currency',currency),status=COALESCE(_data->>'status',status),
      opening_balance_reference=COALESCE(nullif((_data->>'opening_balance_reference')::numeric::text,'')::numeric,opening_balance_reference),updated_at=now()
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Conta financeira não encontrada nesta organização.'; END IF;
  END IF;
  PERFORM public.finance_audit(_org,'finance.account.save','financial_accounts',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.fin_save_payment_method(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.finance_require(_org,'finance.manage');
  IF _id IS NULL THEN
    INSERT INTO public.payment_methods(organization_id,code,name,status)
    VALUES (_org,trim(_data->>'code'),trim(_data->>'name'),COALESCE(_data->>'status','ACTIVE')) RETURNING id INTO v_id;
  ELSE
    UPDATE public.payment_methods SET name=COALESCE(nullif(trim(_data->>'name'),''),name),status=COALESCE(_data->>'status',status),updated_at=now()
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Forma de pagamento não encontrada nesta organização.'; END IF;
  END IF;
  PERFORM public.finance_audit(_org,'finance.payment_method.save','payment_methods',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.fin_save_settings(_org uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.finance_require(_org,'finance.manage');
  INSERT INTO public.finance_settings(organization_id,currency,partner_receivable_due_days,partner_receivable_installments,updated_by,updated_at)
  VALUES (_org,COALESCE(_data->>'currency','BRL'),
    COALESCE((_data->>'partner_receivable_due_days')::int,7),COALESCE((_data->>'partner_receivable_installments')::int,1),auth.uid(),now())
  ON CONFLICT(organization_id) DO UPDATE SET currency=COALESCE(_data->>'currency',finance_settings.currency),
    partner_receivable_due_days=COALESCE((_data->>'partner_receivable_due_days')::int,finance_settings.partner_receivable_due_days),
    partner_receivable_installments=COALESCE((_data->>'partner_receivable_installments')::int,finance_settings.partner_receivable_installments),
    updated_by=auth.uid(),updated_at=now();
  PERFORM public.finance_audit(_org,'finance.settings.save','finance_settings',(SELECT organization_id FROM public.finance_settings WHERE organization_id=_org),_data);
  RETURN jsonb_build_object('saved',true);
END;
$$;

-- =====================================================================
-- 9. RPC: criação de obrigações financeiras (manuais + parcelas).
-- =====================================================================
CREATE FUNCTION public.fin_create_receivable(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_source text; v_n int; v_total numeric; v_part numeric; v_i int; v_doc text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'receivables.create');
  IF (_data->>'company_id') IS NULL OR (_data->>'amount') IS NULL THEN RAISE EXCEPTION 'Empresa e valor obrigatórios.'; END IF;
  IF nullif(trim(_data->>'description'),'') IS NULL THEN RAISE EXCEPTION 'Descrição obrigatória.'; END IF;
  IF nullif(_data->>'due_date','') IS NULL THEN RAISE EXCEPTION 'Vencimento obrigatório.'; END IF;
  v_total:=round((_data->>'amount')::numeric,2);
  IF v_total<=0 THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
  v_n:=GREATEST(1,LEAST(12,COALESCE((_data->>'installments')::int,1)));
  v_part:=round(v_total/v_n,2); v_source:='MANUAL|'||gen_random_uuid()::text;
  FOR v_i IN 1..v_n LOOP
    v_doc:='REC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.finance_receivable_seq')::text,6,'0');
    INSERT INTO public.account_receivables(organization_id,company_id,source_type,source_id,document_number,description,
      issue_date,due_date,competence_date,original_amount,currency,status,financial_category_id,cost_center_id,
      installment_number,total_installments,parent_id,notes,created_by,open_amount)
    VALUES (_org,(_data->>'company_id')::uuid,'MANUAL',v_source,v_doc,trim(_data->>'description'),
      COALESCE(nullif(_data->>'issue_date','')::date,CURRENT_DATE),(_data->>'due_date')::date,
      nullif(_data->>'competence_date','')::date,
      CASE WHEN v_i=v_n THEN round(v_total-(v_n-1)*v_part,2) ELSE v_part END,
      COALESCE(_data->>'currency','BRL'),'OPEN',
      nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,
      v_i,v_n,CASE WHEN v_i=1 THEN NULL ELSE v_id END,_data->>'notes',auth.uid(),
      CASE WHEN v_i=v_n THEN round(v_total-(v_n-1)*v_part,2) ELSE v_part END)
    RETURNING id INTO v_id;
  END LOOP;
  PERFORM public.finance_audit(_org,'finance.receivable.create','account_receivables',v_id,jsonb_build_object('data',_data,'total',v_total,'installments',v_n));
  RETURN jsonb_build_object('id',v_id,'total_installments',v_n,'total',v_total);
END;
$$;

CREATE FUNCTION public.fin_create_payable(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_source text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'payables.create');
  IF (_data->>'amount') IS NULL THEN RAISE EXCEPTION 'Valor obrigatório.'; END IF;
  IF nullif(trim(_data->>'description'),'') IS NULL THEN RAISE EXCEPTION 'Descrição obrigatória.'; END IF;
  IF nullif(_data->>'due_date','') IS NULL THEN RAISE EXCEPTION 'Vencimento obrigatório.'; END IF;
  v_source:='MANUAL|'||gen_random_uuid()::text;
  INSERT INTO public.account_payables(organization_id,company_id,source_type,source_id,document_number,description,
    issue_date,due_date,competence_date,original_amount,currency,status,financial_category_id,cost_center_id,notes,created_by,open_amount)
  VALUES (_org,nullif((_data->>'company_id')::uuid::text,'')::uuid,'MANUAL',v_source,
    'PAG-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.finance_payable_seq')::text,6,'0'),
    trim(_data->>'description'),COALESCE(nullif(_data->>'issue_date','')::date,CURRENT_DATE),(_data->>'due_date')::date,
    nullif(_data->>'competence_date','')::date,round((_data->>'amount')::numeric,2),COALESCE(_data->>'currency','BRL'),'OPEN',
    nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,
    _data->>'notes',auth.uid(),round((_data->>'amount')::numeric,2)) RETURNING id INTO v_id;
  PERFORM public.finance_audit(_org,'finance.payable.create','account_payables',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

-- =====================================================================
-- 10. RPC: mutações controladas de títulos (ajuste, desconto, juros/multa, vencimento, cancelamento, baixa).
-- =====================================================================
CREATE FUNCTION public.fin_document_mutate(_org uuid,_kind text,_id uuid,_op text,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_acc text; v_req text; v_reason text; v_tab text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  v_acc:='receivables.update'; v_tab:='account_receivables';
  IF _kind='payable' THEN v_acc:='payables.update'; v_tab:='account_payables'; END IF;
  v_req:='finance.document.'||_op;
  PERFORM public.finance_require(_org,v_acc);
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo obrigatório.'; END IF;
  v_reason:=trim(_data->>'reason');
  EXECUTE format('SELECT count(*) FROM public.%I WHERE id=$1 AND organization_id=$2 AND status<>''CANCELED''',v_tab) INTO v_req USING _id,_org;
  IF v_req='0' THEN RAISE EXCEPTION 'Título não encontrado ou cancelado.'; END IF;
  IF _op='adjust' THEN
    IF (_data->>'type') NOT IN ('CREDIT','DEBIT') THEN RAISE EXCEPTION 'Tipo de ajuste inválido.'; END IF;
    EXECUTE format('UPDATE public.%I SET adjustment_amount=adjustment_amount+$3,notes=COALESCE(notes||chr(10)||$1,$1),updated_at=now() WHERE id=$2 AND organization_id=$4',v_tab) USING v_reason,_id,(_data->>'amount')::numeric,_org;
  ELSIF _op='discount' THEN
    EXECUTE format('UPDATE public.%I SET discount_amount=discount_amount+$3,notes=COALESCE(notes||chr(10)||$1,$1),updated_at=now() WHERE id=$2 AND organization_id=$4',v_tab) USING v_reason,_id,(_data->>'amount')::numeric,_org;
  ELSIF _op='charges' THEN
    EXECUTE format('UPDATE public.%I SET interest_amount=interest_amount+$3,penalty_amount=penalty_amount+$4,notes=COALESCE(notes||chr(10)||$1,$1),updated_at=now() WHERE id=$2 AND organization_id=$5',v_tab) USING v_reason,_id,COALESCE((_data->>'interest_amount')::numeric,0),COALESCE((_data->>'penalty_amount')::numeric,0),_org;
  ELSIF _op='due_date' THEN
    IF nullif(_data->>'due_date','') IS NULL THEN RAISE EXCEPTION 'Nova data de vencimento obrigatória.'; END IF;
    EXECUTE format('UPDATE public.%I SET due_date=$3,notes=COALESCE(notes||chr(10)||$1,$1),updated_at=now() WHERE id=$2 AND organization_id=$4',v_tab) USING v_reason,_id,(_data->>'due_date')::date,_org;
  ELSIF _op='competence' THEN
    EXECUTE format('UPDATE public.%I SET competence_date=$3,updated_at=now() WHERE id=$2 AND organization_id=$4',v_tab) USING 'Competência: '||v_reason,_id,COALESCE(nullif(_data->>'competence_date','')::date,competence_date),_org;
  ELSIF _op='cancel' THEN
    IF public.finance_document_paid(_org,_kind,_id)>0 THEN RAISE EXCEPTION 'Título com pagamentos: reverter antes de cancelar.'; END IF;
    EXECUTE format('UPDATE public.%I SET status=''CANCELED'',notes=COALESCE(notes||chr(10)||$1,$1),updated_at=now() WHERE id=$2 AND organization_id=$3',v_tab) USING v_reason,_id,_org;
  ELSIF _op='write_off' THEN
    IF _kind<>'receivable' THEN RAISE EXCEPTION 'Baixa se aplica a contas a receber.'; END IF;
    PERFORM public.finance_require(_org,'receivables.write_off');
    IF public.finance_document_paid(_org,_kind,_id)>0 THEN RAISE EXCEPTION 'Título com pagamentos: reverter antes da baixa.'; END IF;
    UPDATE public.account_receivables SET status='WRITTEN_OFF',notes=COALESCE(notes||chr(10)||$1,$1),updated_at=now() WHERE id=_id AND organization_id=_org;
  ELSIF _op='category' THEN
    EXECUTE format('UPDATE public.%I SET financial_category_id=$3,cost_center_id=$4,updated_at=now() WHERE id=$2 AND organization_id=$5',v_tab) USING v_reason,_id,nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,_org;
  ELSE
    RAISE EXCEPTION 'Operação inválida: %',_op;
  END IF;
  PERFORM public.finance_refresh_document(_org,_kind,_id);
  PERFORM public.finance_audit(_org,'finance.'||_kind||'.'||_op||'.'||_data->>'type',v_tab,_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',_id,'op',_op);
END;
$$;

-- =====================================================================
-- 11. RPC: liquidação (receber/pagar) com saldo validado e overpayment bloqueado.
-- =====================================================================
CREATE FUNCTION public.fin_settle(_org uuid,_kind text,_id uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_amount numeric; v_acc uuid; v_open numeric; v_tx uuid; v_settlement_id uuid; v_perm text;
  v_pm uuid; v_occ timestamptz; v_net numeric; v_reason text; v_direction text; v_type text; v_tab text; v_settab text; v_company uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  IF _kind='receivable' THEN v_perm:='receivables.settle'; v_direction:='IN'; v_type:='RECEIVABLE_PAYMENT'; v_tab:='account_receivables'; v_settab:='receivable_settlements';
  ELSE v_perm:='payables.settle'; v_direction:='OUT'; v_type:='PAYABLE_PAYMENT'; v_tab:='account_payables'; v_settab:='payable_settlements'; END IF;
  PERFORM public.finance_require(_org,v_perm);
  IF (_data->>'account_id') IS NULL THEN RAISE EXCEPTION 'Conta financeira obrigatória.'; END IF;
  v_amount:=round((_data->>'amount')::numeric,2); v_acc:=(_data->>'account_id')::uuid;
  IF v_amount<=0 THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
  v_pm:=nullif((_data->>'payment_method_id')::uuid::text,'')::uuid;
  v_occ:=COALESCE(nullif(_data->>'occurred_at','')::timestamptz,now());
  v_reason:=COALESCE(nullif(trim(_data->>'description'),''),'Liquidação '||_kind);
  PERFORM public.inventory_lock(_org);
  EXECUTE format('SELECT open_amount,company_id FROM public.%I WHERE id=$1 AND organization_id=$2 FOR UPDATE',v_tab) INTO v_open,v_company USING _id,_org;
  IF v_open IS NULL THEN RAISE EXCEPTION 'Título não encontrado.'; END IF;
  v_net:=v_open - v_amount + COALESCE((_data->>'discount_amount')::numeric,0) - COALESCE((_data->>'interest_amount')::numeric,0) - COALESCE((_data->>'penalty_amount')::numeric,0);
  IF v_net < -0.005 THEN RAISE EXCEPTION 'Pagamento acima do saldo não permitido (saldo %): revise descontos/aplicações.',v_open; END IF;
  INSERT INTO public.financial_transactions(organization_id,financial_account_id,type,direction,company_id,amount,occurred_at,
    reference_type,reference_id,payment_method_id,financial_category_id,cost_center_id,description,idempotency_key,created_by)
  SELECT _org,v_acc,v_type,v_direction,v_company,v_amount,v_occ,_kind,_id,v_pm,
    COALESCE(nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,NULL),
    COALESCE(nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,NULL),
    v_reason||' | '||(SELECT document_number FROM CASE WHEN _kind='receivable' THEN public.account_receivables ELSE public.account_payables END WHERE id=_id AND organization_id=_org),
    'fin-settle:'||_kind||':'||_id||':'||COALESCE(nullif(_data->>'receipt_key',''),gen_random_uuid()::text),auth.uid()
  ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING id INTO v_tx;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Liquidação já registrada (chave de idempotência repetida).'; END IF;
  EXECUTE format('INSERT INTO public.%I(organization_id,%I_id,financial_transaction_id,amount,discount_amount,interest_amount,penalty_amount,settled_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',v_settab,CASE WHEN _kind='receivable' THEN 'receivable' ELSE 'payable' END)
  USING _org,_id,v_tx,v_amount,COALESCE((_data->>'discount_amount')::numeric,0),COALESCE((_data->>'interest_amount')::numeric,0),COALESCE((_data->>'penalty_amount')::numeric,0),v_occ,auth.uid() INTO v_settlement_id;
  PERFORM public.finance_refresh_document(_org,_kind,_id);
  PERFORM public.finance_audit(_org,'finance.'||_kind||'.settle','financial_transactions',v_tx,jsonb_build_object('document',_id,'amount',v_amount));
  RETURN jsonb_build_object('transaction_id',v_tx,'settlement_id',v_settlement_id,'open_amount',(SELECT open_amount FROM CASE WHEN _kind='receivable' THEN public.account_receivables ELSE public.account_payables END WHERE id=_id AND organization_id=_org));
END;
$$;

-- =====================================================================
-- 12. RPC: reversão de movimento (compensação; original nunca é apagado).
-- =====================================================================
CREATE FUNCTION public.fin_reverse_transaction(_org uuid,_transaction_id uuid,_reason text,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tx record; v_rev uuid; v_rev_set uuid; v_ref_tab text; v_settab text; v_doc_col text; v_permission text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo do estorno obrigatório.'; END IF;
  PERFORM public.inventory_lock(_org);
  SELECT * INTO v_tx FROM public.financial_transactions WHERE id=_transaction_id AND organization_id=_org FOR UPDATE;
  IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Transação não encontrada.'; END IF;
  IF v_tx.type='REVERSAL' THEN RAISE EXCEPTION 'Movimento já é um estorno.'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE reversal_of_id=v_tx.id AND organization_id=_org) THEN
    RAISE EXCEPTION 'Movimento já estornado.'; END IF;
  IF v_tx.reference_type='RECEIVABLE' THEN v_permission:='receivables.reverse'; v_ref_tab:='receivable_settlements';
  ELSIF v_tx.reference_type='PAYABLE' THEN v_permission:='payables.reverse'; v_ref_tab:='payable_settlements';
  ELSE v_permission:='financial_accounts.manage'; END IF;
  PERFORM public.finance_require(_org,v_permission);
  INSERT INTO public.financial_transactions(organization_id,financial_account_id,type,direction,company_id,amount,occurred_at,
    reference_type,reference_id,payment_method_id,financial_category_id,cost_center_id,description,reversal_of_id,idempotency_key,created_by)
  VALUES (_org,v_tx.financial_account_id,'REVERSAL',CASE v_tx.direction WHEN 'IN' THEN 'OUT' ELSE 'IN' END,
    v_tx.company_id,v_tx.amount,now(),v_tx.reference_type,v_tx.reference_id,v_tx.payment_method_id,v_tx.financial_category_id,v_tx.cost_center_id,
    'Estorno: '||trim(_reason),v_tx.id,'fin-reverse:'||v_tx.id::text,auth.uid()) RETURNING id INTO v_rev;
  IF v_tx.reference_type IN ('RECEIVABLE','PAYABLE') THEN
    EXECUTE format('INSERT INTO public.%I(organization_id,%I_id,financial_transaction_id,amount,settled_at,is_reversal,reversal_of_id,created_by)
      SELECT $1,$2,$4,amount,now(),true,id,$3 FROM public.%I WHERE organization_id=$1 AND financial_transaction_id=$5 LIMIT 1 RETURNING id',
      v_ref_tab,CASE v_tx.reference_type WHEN 'RECEIVABLE' THEN 'receivable' ELSE 'payable' END,v_ref_tab)
    USING _org,v_tx.reference_id,auth.uid(),v_rev,v_tx.id INTO v_rev_set;
    IF v_rev_set IS NOT NULL THEN
      PERFORM public.finance_refresh_document(_org,CASE v_tx.reference_type WHEN 'RECEIVABLE' THEN 'receivable' ELSE 'payable' END,v_tx.reference_id);
    END IF;
  END IF;
  PERFORM public.finance_audit(_org,'finance.reverse','financial_transactions',v_rev,jsonb_build_object('original',v_tx.id,'settlement_reversal',v_rev_set,'reason',_reason));
  RETURN jsonb_build_object('reversal_id',v_rev,'original',v_tx.id);
END;
$$;

-- =====================================================================
-- 13. RPC: transferência entre contas (OUT+IN atômicos; não é receita/despesa),
--     saldo inicial e movimento avulso (ledger oficial).
-- =====================================================================
CREATE FUNCTION public.fin_transfer(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_from uuid; v_to uuid; v_amount numeric; v_key text; v_tr uuid; v_tx_out uuid; v_tx_in uuid; v_occ timestamptz;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'financial_transfers.create');
  PERFORM public.inventory_lock(_org);
  v_from:=(_data->>'from_account_id')::uuid; v_to:=(_data->>'to_account_id')::uuid;
  v_amount:=round((_data->>'amount')::numeric,2); v_key:=COALESCE(nullif(_data->>'transfer_key',''),'fin-transfer:'||gen_random_uuid()::text);
  v_occ:=COALESCE(nullif(_data->>'occurred_at','')::timestamptz,now());
  IF v_from IS NULL OR v_to IS NULL OR v_amount<=0 THEN RAISE EXCEPTION 'Contas e valor válidos obrigatórios.'; END IF;
  IF v_from=v_to THEN RAISE EXCEPTION 'Contas de origem e destino devem ser diferentes.'; END IF;
  IF (SELECT public.finance_balance(_org,public.financial_accounts.id,NULL) FROM public.financial_accounts WHERE id=v_from AND organization_id=_org) < v_amount - 0.005 THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta de origem.'; END IF;
  INSERT INTO public.financial_transfers(organization_id,from_account_id,to_account_id,amount,occurred_at,notes,transfer_key,created_by)
  VALUES (_org,v_from,v_to,v_amount,v_occ,_data->>'notes',v_key,auth.uid()) ON CONFLICT(organization_id,transfer_key) DO NOTHING RETURNING id INTO v_tr;
  IF v_tr IS NULL THEN RAISE EXCEPTION 'Transferência já registrada (chave duplicada).'; END IF;
  INSERT INTO public.financial_transactions(organization_id,financial_account_id,type,direction,amount,occurred_at,reference_type,reference_id,description,idempotency_key,created_by)
  VALUES (_org,v_from,'FINANCIAL_TRANSFER','OUT',v_amount,v_occ,'TRANSFER',v_tr,'Transferência para conta destino: '||COALESCE(_data->>'notes',''),v_key||':out',auth.uid()) RETURNING id INTO v_tx_out;
  INSERT INTO public.financial_transactions(organization_id,financial_account_id,type,direction,amount,occurred_at,reference_type,reference_id,description,idempotency_key,created_by)
  VALUES (_org,v_to,'FINANCIAL_TRANSFER','IN',v_amount,v_occ,'TRANSFER',v_tr,'Transferência da conta origem: '||COALESCE(_data->>'notes',''),v_key||':in',auth.uid()) RETURNING id INTO v_tx_in;
  PERFORM public.finance_audit(_org,'finance.transfer','financial_transfers',v_tr,jsonb_build_object('from',v_from,'to',v_to,'amount',v_amount));
  RETURN jsonb_build_object('transfer_id',v_tr,'out_id',v_tx_out,'in_id',v_tx_in);
END;
$$;

CREATE FUNCTION public.fin_opening_balance(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_acc uuid; v_amount numeric; v_tx uuid; v_dir text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'financial_accounts.manage');
  PERFORM public.inventory_lock(_org);
  v_acc:=(_data->>'account_id')::uuid; v_amount:=round((_data->>'amount')::numeric,2);
  IF v_acc IS NULL OR v_amount=0 THEN RAISE EXCEPTION 'Conta e valor válidos obrigatórios.'; END IF;
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo/contexto do saldo inicial obrigatório.'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_transactions WHERE organization_id=_org AND financial_account_id=v_acc AND type='OPENING_BALANCE') THEN
    RAISE EXCEPTION 'Saldo inicial já registrado nesta conta.'; END IF;
  v_dir:=CASE WHEN v_amount>0 THEN 'IN' ELSE 'OUT' END;
  INSERT INTO public.financial_transactions(organization_id,financial_account_id,type,direction,amount,occurred_at,reference_type,description,idempotency_key,created_by)
  VALUES (_org,v_acc,'OPENING_BALANCE',v_dir,abs(v_amount),COALESCE(nullif(_data->>'occurred_at','')::timestamptz,now()),
    'OPENING','Saldo inicial: '||trim(_data->>'reason'),'fin-opening:'||v_acc::text,auth.uid())
  ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING id INTO v_tx;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Saldo inicial já registrado (chave repetida).'; END IF;
  PERFORM public.finance_audit(_org,'finance.opening_balance','financial_transactions',v_tx,jsonb_build_object('account',v_acc,'amount',v_amount));
  RETURN jsonb_build_object('transaction_id',v_tx,'direction',v_dir);
END;
$$;

CREATE FUNCTION public.fin_direct_movement(_org uuid,_data jsonb,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_acc uuid; v_amount numeric; v_dir text; v_tx uuid;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'finance.manage');
  PERFORM public.inventory_lock(_org);
  v_acc:=(_data->>'account_id')::uuid; v_amount:=round((_data->>'amount')::numeric,2);
  v_dir:=COALESCE(_data->>'direction','IN');
  IF v_acc IS NULL OR v_amount<=0 OR v_dir NOT IN ('IN','OUT') THEN RAISE EXCEPTION 'Conta, valor e direção válidos obrigatórios.'; END IF;
  IF nullif(trim(_data->>'description'),'') IS NULL THEN RAISE EXCEPTION 'Descrição obrigatória.'; END IF;
  INSERT INTO public.financial_transactions(organization_id,financial_account_id,type,direction,company_id,amount,occurred_at,reference_type,
    payment_method_id,financial_category_id,cost_center_id,description,idempotency_key,created_by)
  VALUES (_org,v_acc,'DIRECT',v_dir,nullif((_data->>'company_id')::uuid::text,'')::uuid,v_amount,
    COALESCE(nullif(_data->>'occurred_at','')::timestamptz,now()),'DIRECT',
    nullif((_data->>'payment_method_id')::uuid::text,'')::uuid,nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,
    nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,trim(_data->>'description'),
    COALESCE(nullif(_data->>'receipt_key',''),'fin-direct:'||gen_random_uuid()::text),auth.uid())
  ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING id INTO v_tx;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'Movimento já registrado (chave repetida).'; END IF;
  PERFORM public.finance_audit(_org,'finance.direct','financial_transactions',v_tx,jsonb_build_object('direction',v_dir,'amount',v_amount));
  RETURN jsonb_build_object('transaction_id',v_tx);
END;
$$;

-- =====================================================================
-- 14. RPC: recorrência mensal com idempotência por período.
-- =====================================================================
CREATE FUNCTION public.fin_save_recurrence(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.finance_require(_org,'finance.manage');
  IF _id IS NULL THEN
    INSERT INTO public.financial_recurrence_rules(organization_id,name,direction,company_id,amount,financial_category_id,cost_center_id,payment_method_id,day_of_month,start_date,end_date,status,created_by)
    VALUES (_org,trim(_data->>'name'),COALESCE(_data->>'direction','OUT'),nullif((_data->>'company_id')::uuid::text,'')::uuid,
      round((_data->>'amount')::numeric,2),nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,
      nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,nullif((_data->>'payment_method_id')::uuid::text,'')::uuid,
      COALESCE((_data->>'day_of_month')::int,1),COALESCE(nullif(_data->>'start_date','')::date,CURRENT_DATE),
      nullif(_data->>'end_date','')::date,COALESCE(_data->>'status','ACTIVE'),auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.financial_recurrence_rules SET name=COALESCE(nullif(trim(_data->>'name'),''),name),
      direction=COALESCE(_data->>'direction',direction),company_id=nullif((_data->>'company_id')::uuid::text,'')::uuid,
      amount=COALESCE(round((_data->>'amount')::numeric,2),amount),
      financial_category_id=nullif((_data->>'financial_category_id')::uuid::text,'')::uuid,
      cost_center_id=nullif((_data->>'cost_center_id')::uuid::text,'')::uuid,
      payment_method_id=nullif((_data->>'payment_method_id')::uuid::text,'')::uuid,
      day_of_month=COALESCE((_data->>'day_of_month')::int,day_of_month),
      end_date=nullif(_data->>'end_date','')::date,status=COALESCE(_data->>'status',status),updated_at=now()
    WHERE id=_id AND organization_id=_org RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Regra de recorrência não encontrada.'; END IF;
  END IF;
  PERFORM public.finance_audit(_org,'finance.recurrence.save','financial_recurrence_rules',v_id,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('id',v_id);
END;
$$;

CREATE FUNCTION public.fin_generate_recurrences(_org uuid,_period text,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_r record; v_doc uuid; v_period date; v_due date; v_count int:=0; v_source text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'finance.manage');
  v_period:=(_period||'-01')::date;
  FOR v_r IN SELECT * FROM public.financial_recurrence_rules WHERE organization_id=_org AND status='ACTIVE'
    AND start_date<=v_period AND (end_date IS NULL OR end_date>=v_period) LOOP
    v_due:=make_date(extract(year from v_period)::int,extract(month from v_period)::int,LEAST(v_r.day_of_month,extract(day from (date_trunc('month',v_period)+interval '1 month' - interval '1 day'))::int));
    v_source:='RECURRENCE|'||v_r.id::text||'|'||to_char(v_period,'YYYY-MM');
    IF v_r.direction='IN' THEN
      INSERT INTO public.account_receivables(organization_id,company_id,source_type,source_id,document_number,description,issue_date,due_date,competence_date,original_amount,currency,status,financial_category_id,cost_center_id,notes,created_by,open_amount)
      SELECT _org,v_r.company_id,'RECURRENCE',v_source,'REC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.finance_receivable_seq')::text,6,'0'),
        v_r.name||' '||to_char(v_period,'MM/YYYY'),v_period,v_due,v_period,v_r.amount,'BRL','OPEN',v_r.financial_category_id,v_r.cost_center_id,NULL,auth.uid(),v_r.amount
      ON CONFLICT(organization_id,source_type,source_id,installment_number) DO NOTHING RETURNING id INTO v_doc;
    ELSE
      INSERT INTO public.account_payables(organization_id,company_id,source_type,source_id,document_number,description,issue_date,due_date,competence_date,original_amount,currency,status,financial_category_id,cost_center_id,notes,created_by,open_amount)
      SELECT _org,v_r.company_id,'RECURRENCE',v_source,'PAG-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.finance_payable_seq')::text,6,'0'),
        v_r.name||' '||to_char(v_period,'MM/YYYY'),v_period,v_due,v_period,v_r.amount,'BRL','OPEN',v_r.financial_category_id,v_r.cost_center_id,NULL,auth.uid(),v_r.amount
      ON CONFLICT(organization_id,source_type,source_id) DO NOTHING RETURNING id INTO v_doc;
    END IF;
    IF v_doc IS NOT NULL THEN v_count:=v_count+1; END IF;
  END LOOP;
  PERFORM public.finance_audit(_org,'finance.recurrence.generate','financial_recurrence_rules',(SELECT id FROM public.financial_recurrence_rules WHERE organization_id=_org LIMIT 1),jsonb_build_object('period',_period,'created',v_count));
  RETURN jsonb_build_object('created',v_count,'period',_period);
END;
$$;

-- =====================================================================
-- 15. RPC: consumo do evento PARTNER_RECONCILIATION_CLOSED (idempotente).
--     Cria conta a receber usando net_billable (snapshot), com vencimento
--     conforme regra configurada (finance_settings) e parcelas configuradas.
-- =====================================================================
CREATE FUNCTION public.fin_process_reconciliation(_org uuid,_reconciliation_id uuid,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rec record; v_total numeric; v_days int; v_n int; v_part numeric; v_i int; v_doc uuid; v_company uuid; v_first uuid; v_created int:=0;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  PERFORM public.finance_require(_org,'receivables.create');
  PERFORM public.inventory_lock(_org);
  SELECT r.*,pp.company_id INTO v_rec FROM public.partner_reconciliations r
    JOIN public.partner_profiles pp ON pp.id=r.partner_id
    WHERE r.id=_reconciliation_id AND r.organization_id=_org FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Reconciliação não encontrada.'; END IF;
  IF v_rec.status<>'CLOSED' THEN RAISE EXCEPTION 'Somente fechamento CLOSED gera título.'; END IF;
  IF EXISTS(SELECT 1 FROM public.account_receivables WHERE organization_id=_org AND source_type='PARTNER_RECONCILIATION' AND source_id=_reconciliation_id::text) THEN
    RETURN jsonb_build_object('already',true,'created',0,'advice','Evento já materializado; nenhum segundo título é criado.');
  END IF;
  v_total:=round(COALESCE((v_rec.snapshot->'totals'->>'net_billable')::numeric,0),2);
  IF v_total<=0 THEN RAISE EXCEPTION 'Fechamento sem valor cobrável (net_billable).'; END IF;
  SELECT COALESCE(partner_receivable_due_days,7),COALESCE(partner_receivable_installments,1) INTO v_days,v_n FROM public.finance_settings WHERE organization_id=_org;
  v_part:=round(v_total/v_n,2); v_company:=v_rec.company_id;
  FOR v_i IN 1..v_n LOOP
    INSERT INTO public.account_receivables(organization_id,company_id,source_type,source_id,source_status,document_number,description,
      issue_date,due_date,competence_date,original_amount,currency,status,installment_number,total_installments,parent_id,notes,created_by,open_amount)
    VALUES (_org,v_company,'PARTNER_RECONCILIATION',_reconciliation_id::text,'ACTIVE',
      'REC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.finance_receivable_seq')::text,6,'0'),
      'Fechamento comercial com parceiro · '||to_char(v_rec.period_start,'DD/MM/YYYY')||' a '||to_char(v_rec.period_end,'DD/MM/YYYY'),
      COALESCE(v_rec.closed_at,now())::date,(COALESCE(v_rec.closed_at,now())::date+v_days),v_rec.period_end::date,
      CASE WHEN v_i=v_n THEN round(v_total-(v_n-1)*v_part,2) ELSE v_part END,'BRL','OPEN',
      v_i,v_n,CASE WHEN v_i=1 THEN NULL ELSE v_first END,
      'Origem: fechamento comercial '||v_rec.id::text||' · regra de vencimento D+'||v_days||' · '||v_n||' parcela(s)',
      auth.uid(),CASE WHEN v_i=v_n THEN round(v_total-(v_n-1)*v_part,2) ELSE v_part END)
    ON CONFLICT(organization_id,source_type,source_id,installment_number) DO NOTHING RETURNING id INTO v_doc;
    IF v_doc IS NOT NULL THEN v_created:=v_created+1; IF v_first IS NULL THEN v_first:=v_doc; END IF; END IF;
  END LOOP;
  UPDATE public.domain_events SET payload=COALESCE(payload,'{}'::jsonb)||jsonb_build_object('finance_processed',true,'finance_processed_at',now())
  WHERE organization_id=_org AND event_key='reconciliation:closed:'||_reconciliation_id::text;
  PERFORM public.finance_audit(_org,'finance.from_reconciliation','account_receivables',COALESCE(v_first,_reconciliation_id),jsonb_build_object('reconciliation',_reconciliation_id,'net_billable',v_total,'installments',v_n));
  RETURN jsonb_build_object('reconciliation_id',_reconciliation_id,'created',v_created,'net_billable',v_total,'installments',v_n,'first_id',COALESCE(v_first,NULL));
END;
$$;

-- =====================================================================
-- 16. Trigger: reabertura de reconciliação marca SOURCE_REOPENED nos títulos
--     (atenção, nunca exclusão silenciosa do recebível).
-- =====================================================================
CREATE FUNCTION public.finance_mark_source_reopened() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status<>OLD.status AND NEW.status='REOPENED' THEN
    UPDATE public.account_receivables SET source_status='SOURCE_REOPENED',updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_type='PARTNER_RECONCILIATION' AND source_id=NEW.id::text AND status NOT IN ('PAID','CANCELED','WRITTEN_OFF');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_source_reopened AFTER UPDATE ON public.partner_reconciliations FOR EACH ROW EXECUTE FUNCTION public.finance_mark_source_reopened();

-- =====================================================================
-- 17. RPC: consultas financeiras (dashboard, listas, detalhes, relatórios).
-- =====================================================================
CREATE FUNCTION public.fin_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}'::jsonb,_page int DEFAULT 1,_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb; v_perm text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
  v_perm:=CASE _kind
    WHEN 'dashboard' THEN 'finance.dashboard'
    WHEN 'receivables' THEN 'receivables.read' WHEN 'receivable' THEN 'receivables.read'
    WHEN 'payables' THEN 'payables.read' WHEN 'payable' THEN 'payables.read'
    WHEN 'partner_finance' THEN 'receivables.read'
    ELSE 'finance.read' END;
  PERFORM public.finance_require(_org,v_perm);
  IF _kind='dashboard' THEN
    SELECT jsonb_build_object(
      'period',jsonb_build_object('from',COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date),'to',COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)),
      'balance',round(public.finance_balance(_org),2),
      'receivable_open',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND status NOT IN ('PAID','CANCELED','WRITTEN_OFF')),
      'receivable_overdue',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND status IN ('OPEN','PARTIALLY_PAID') AND due_date<CURRENT_DATE),
      'payable_open',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_payables WHERE organization_id=_org AND status NOT IN ('PAID','CANCELED')),
      'payable_overdue',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_payables WHERE organization_id=_org AND status IN ('OPEN','PARTIALLY_PAID') AND due_date<CURRENT_DATE),
      'inflows_period',(SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND direction='IN' AND occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)),
      'outflows_period',(SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND direction='OUT' AND occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)),
      'projected_30d',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND status NOT IN ('PAID','CANCELED','WRITTEN_OFF') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30))
      INTO v_result;
  ELSIF _kind='receivables' THEN
    WITH rows AS MATERIALIZED(SELECT r.*,c.legal_name company_name,concat_ws(' ',r.document_number,r.description,c.legal_name) haystack,
      CASE WHEN r.status IN ('OPEN','PARTIALLY_PAID') AND r.due_date<CURRENT_DATE THEN 'OVERDUE' ELSE r.status END status_effective,
      round(public.finance_document_paid(_org,'receivable',r.id),2) received_amount
      FROM public.account_receivables r JOIN public.companies c ON c.id=r.company_id AND c.organization_id=_org WHERE r.organization_id=_org
      AND (nullif(_filters->>'company_id','') IS NULL OR r.company_id=(_filters->>'company_id')::uuid)
      AND (nullif(_filters->>'financial_category_id','') IS NULL OR r.financial_category_id=(_filters->>'financial_category_id')::uuid)
      AND (nullif(_filters->>'cost_center_id','') IS NULL OR r.cost_center_id=(_filters->>'cost_center_id')::uuid)
      AND (nullif(_filters->>'from','') IS NULL OR r.due_date>=(_filters->>'from')::date)
      AND (nullif(_filters->>'to','') IS NULL OR r.due_date<=(_filters->>'to')::date)
      AND (coalesce(_filters->>'status','')='' OR r.status=_filters->>'status')
      AND (coalesce(_filters->>'late','')='' OR (r.due_date<CURRENT_DATE AND r.status IN ('OPEN','PARTIALLY_PAID')))
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(haystack),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY due_date,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='receivable' THEN
    SELECT to_jsonb(r)||jsonb_build_object('company_name',c.legal_name,'status_effective',
      CASE WHEN r.status IN ('OPEN','PARTIALLY_PAID') AND r.due_date<CURRENT_DATE THEN 'OVERDUE' ELSE r.status END,
      'received_amount',public.finance_document_paid(_org,'receivable',r.id),
      'settlements',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('account_name',a.name)) FROM public.receivable_settlements s JOIN public.financial_transactions t ON t.id=s.financial_transaction_id JOIN public.financial_accounts a ON a.id=t.financial_account_id WHERE s.receivable_id=r.id ORDER BY s.settled_at),'[]'::jsonb))
    INTO v_result FROM public.account_receivables r JOIN public.companies c ON c.id=r.company_id AND c.organization_id=_org
    WHERE r.organization_id=_org AND r.id=(_filters->>'id')::uuid AND trim(_filters->>'id')<>'';
  ELSIF _kind='payables' THEN
    WITH rows AS MATERIALIZED(SELECT p.*,c.legal_name company_name,concat_ws(' ',p.document_number,p.description,c.legal_name) haystack,
      CASE WHEN p.status IN ('OPEN','PARTIALLY_PAID') AND p.due_date<CURRENT_DATE THEN 'OVERDUE' ELSE p.status END status_effective,
      round(public.finance_document_paid(_org,'payable',p.id),2) paid_amount
      FROM public.account_payables p LEFT JOIN public.companies c ON c.id=p.company_id AND c.organization_id=_org WHERE p.organization_id=_org
      AND (nullif(_filters->>'company_id','') IS NULL OR p.company_id=(_filters->>'company_id')::uuid)
      AND (nullif(_filters->>'financial_category_id','') IS NULL OR p.financial_category_id=(_filters->>'financial_category_id')::uuid)
      AND (nullif(_filters->>'cost_center_id','') IS NULL OR p.cost_center_id=(_filters->>'cost_center_id')::uuid)
      AND (nullif(_filters->>'from','') IS NULL OR p.due_date>=(_filters->>'from')::date)
      AND (nullif(_filters->>'to','') IS NULL OR p.due_date<=(_filters->>'to')::date)
      AND (coalesce(_filters->>'status','')='' OR p.status=_filters->>'status')
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(haystack),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY due_date,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='payable' THEN
    SELECT to_jsonb(p)||jsonb_build_object('company_name',c.legal_name,'status_effective',
      CASE WHEN p.status IN ('OPEN','PARTIALLY_PAID') AND p.due_date<CURRENT_DATE THEN 'OVERDUE' ELSE p.status END,
      'paid_amount',public.finance_document_paid(_org,'payable',p.id),
      'settlements',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('account_name',a.name)) FROM public.payable_settlements s JOIN public.financial_transactions t ON t.id=s.financial_transaction_id JOIN public.financial_accounts a ON a.id=t.financial_account_id WHERE s.payable_id=p.id ORDER BY s.settled_at),'[]'::jsonb))
    INTO v_result FROM public.account_payables p LEFT JOIN public.companies c ON c.id=p.company_id AND c.organization_id=_org
    WHERE p.organization_id=_org AND p.id=(_filters->>'id')::uuid AND trim(_filters->>'id')<>'';
  ELSIF _kind='finances' THEN
    WITH rows AS MATERIALIZED(SELECT r.document_number,r.description,r.due_date,c.legal_name company_name,r.original_amount,r.open_amount,
      (CURRENT_DATE-r.due_date) days_overdue,r.status status_base,
      (SELECT max(settled_at) FROM public.receivable_settlements WHERE receivable_id=r.id) last_receipt
      FROM public.account_receivables r JOIN public.companies c ON c.id=r.company_id AND c.organization_id=_org
      WHERE r.organization_id=_org AND r.status IN ('OPEN','PARTIALLY_PAID') AND r.due_date<CURRENT_DATE
      AND (nullif(_filters->>'company_id','') IS NULL OR r.company_id=(_filters->>'company_id')::uuid))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY days_overdue DESC)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='aging' THEN
    WITH base AS MATERIALIZED(SELECT CASE WHEN r.due_date>=CURRENT_DATE THEN 'avencer' WHEN (CURRENT_DATE-r.due_date)<=7 THEN '1-7d' WHEN (CURRENT_DATE-r.due_date)<=15 THEN '8-15d'
      WHEN (CURRENT_DATE-r.due_date)<=30 THEN '16-30d' WHEN (CURRENT_DATE-r.due_date)<=60 THEN '31-60d' WHEN (CURRENT_DATE-r.due_date)<=90 THEN '61-90d' ELSE '90+d' END bucket,
      r.open_amount FROM public.account_receivables r WHERE r.organization_id=_org AND r.status NOT IN ('PAID','CANCELED','WRITTEN_OFF') AND COALESCE(_filters->>'side','receivable')='receivable'
      UNION ALL SELECT CASE WHEN p.due_date>=CURRENT_DATE THEN 'avencer' WHEN (CURRENT_DATE-p.due_date)<=7 THEN '1-7d' WHEN (CURRENT_DATE-p.due_date)<=15 THEN '8-15d'
      WHEN (CURRENT_DATE-p.due_date)<=30 THEN '16-30d' WHEN (CURRENT_DATE-p.due_date)<=60 THEN '31-60d' WHEN (CURRENT_DATE-p.due_date)<=90 THEN '61-90d' ELSE '90+d' END bucket,
      p.open_amount FROM public.account_payables p WHERE p.organization_id=_org AND p.status NOT IN ('PAID','CANCELED') AND COALESCE(_filters->>'side','receivable')='payable')
    SELECT jsonb_build_object('side',COALESCE(_filters->>'side','receivable'),'rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT bucket,count(*)::int documents,round(coalesce(sum(open_amount),0),2) total FROM base GROUP BY bucket ORDER BY array_position(ARRAY['avencer','1-7d','8-15d','16-30d','31-60d','61-90d','90+d'],bucket))q),'[]'::jsonb)) INTO v_result;
  ELSIF _kind='transactions' THEN
    WITH rows AS MATERIALIZED(SELECT t.*,a.name account_name,COALESCE(c.legal_name,'-') company_name,document_number FROM public.financial_transactions t
      JOIN public.financial_accounts a ON a.id=t.financial_account_id AND a.organization_id=_org
      LEFT JOIN public.companies c ON c.id=t.company_id AND c.organization_id=_org
      LEFT JOIN LATERAL (SELECT r.document_number FROM public.account_receivables r WHERE r.id=t.reference_id AND r.organization_id=_org
        UNION ALL SELECT p.document_number FROM public.account_payables p WHERE p.id=t.reference_id AND p.organization_id=_org) d ON true
      WHERE t.organization_id=_org
      AND (nullif(_filters->>'account_id','') IS NULL OR t.financial_account_id=(_filters->>'account_id')::uuid)
      AND (coalesce(_filters->>'direction','')='' OR t.direction=_filters->>'direction')
      AND (coalesce(_filters->>'type','')='' OR t.type=_filters->>'type')
      AND (nullif(_filters->>'from','') IS NULL OR t.occurred_at::date>=(_filters->>'from')::date)
      AND (nullif(_filters->>'to','') IS NULL OR t.occurred_at::date<=(_filters->>'to')::date)
      AND (nullif(_filters->>'company_id','') IS NULL OR t.company_id=(_filters->>'company_id')::uuid)
      AND (coalesce(_filters->>'query','')='' OR strpos(lower(coalesce(t.description,'')||' '||coalesce(document_number,'')||' '||coalesce(c.legal_name,'')),lower(_filters->>'query'))>0))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY occurred_at DESC,id LIMIT 100 OFFSET (_page-1)*100)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind='accounts' THEN
    WITH rows AS MATERIALIZED(SELECT a.*,round(public.finance_balance(_org,a.id),2) balance FROM public.financial_accounts a WHERE a.organization_id=_org
      AND (coalesce(_filters->>'status','')='' OR a.status=_filters->>'status'))
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY name)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO v_result;
  ELSIF _kind IN ('categories','cost_centers','payment_methods') THEN
    IF _kind='categories' THEN
      SELECT coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('children',(SELECT count(*) FROM public.financial_categories x WHERE x.parent_id=c.id))) FROM public.financial_categories c WHERE c.organization_id=_org ORDER BY c.sort_order,c.code),'[]'::jsonb) INTO v_result;
    ELSIF _kind='cost_centers' THEN
      SELECT coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.cost_centers c WHERE c.organization_id=_org ORDER BY c.code),'[]'::jsonb) INTO v_result;
    ELSE
      SELECT coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.payment_methods p WHERE p.organization_id=_org ORDER BY p.code),'[]'::jsonb) INTO v_result;
    END IF;
  ELSIF _kind='settings' THEN
    SELECT coalesce(to_jsonb(s),jsonb_build_object('currency','BRL','partner_receivable_due_days',7,'partner_receivable_installments',1)) INTO v_result FROM public.finance_settings s WHERE s.organization_id=_org;
  ELSIF _kind='recurrences' THEN
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('company_name',c.legal_name,'category_name',fc.name)) FROM public.financial_recurrence_rules r
      LEFT JOIN public.companies c ON c.id=r.company_id AND c.organization_id=_org LEFT JOIN public.financial_categories fc ON fc.id=r.financial_category_id WHERE r.organization_id=_org),'[]'::jsonb) INTO v_result;
  ELSIF _kind='cashflow' THEN
    SELECT jsonb_build_object('from',COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date),'to',COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE),
      'balance',round(public.finance_balance(_org),2),
      'realized_from',(SELECT round(coalesce(sum(CASE direction WHEN 'IN' THEN amount ELSE -amount END),0),2) FROM public.financial_transactions WHERE organization_id=_org AND occurred_at<COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date)::timestamptz),
      'days',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT d::date dt,
        (SELECT round(coalesce(sum(CASE direction WHEN 'IN' THEN amount ELSE -amount END),0),2) FROM public.financial_transactions WHERE organization_id=_org AND occurred_at<d::timestamp) opening,
        (SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND direction='IN' AND occurred_at::date=d) realized_in,
        (SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND direction='OUT' AND occurred_at::date=d) realized_out,
        (SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND due_date=d AND status NOT IN ('PAID','CANCELED','WRITTEN_OFF')) projected_in,
        (SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_payables WHERE organization_id=_org AND due_date=d AND status NOT IN ('PAID','CANCELED')) projected_out
        FROM generate_series(COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date),COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE),interval '1 day') d) q),'[]'::jsonb))
      INTO v_result;
  ELSIF _kind='partner_finance' THEN
    SELECT jsonb_build_object('company_id',c.id,'company_name',c.legal_name,
      'receivable_open',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND company_id=c.id AND status NOT IN ('PAID','CANCELED','WRITTEN_OFF')),
      'receivable_overdue',(SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND company_id=c.id AND status IN ('OPEN','PARTIALLY_PAID') AND due_date<CURRENT_DATE),
      'received_period',(SELECT round(coalesce(sum(t.amount),0),2) FROM public.financial_transactions t WHERE t.organization_id=_org AND t.direction='IN' AND t.company_id=c.id
        AND t.occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND t.occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)),
      'next_due',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT r.document_number,r.due_date,r.open_amount,r.status FROM public.account_receivables r WHERE r.organization_id=_org AND r.company_id=c.id AND r.status NOT IN ('PAID','CANCELED','WRITTEN_OFF') ORDER BY r.due_date LIMIT 10)q),'[]'::jsonb),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT r.document_number,r.description,r.issue_date,r.due_date,r.original_amount,r.status,public.finance_document_paid(_org,'receivable',r.id) received FROM public.account_receivables r WHERE r.organization_id=_org AND r.company_id=c.id ORDER BY r.due_date DESC LIMIT 100)q),'[]'::jsonb))
      INTO v_result FROM public.companies c WHERE c.id=(_filters->>'company_id')::uuid AND c.organization_id=_org;
  ELSIF _kind='report_category' THEN
    SELECT jsonb_build_object('from',COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date),'to',COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE),
      'rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT fc.id,fc.code,fc.name,fc.type,
        (SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND financial_category_id=fc.id AND direction='IN'
          AND occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)) inflows_realized,
        (SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND financial_category_id=fc.id AND direction='OUT'
          AND occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)) outflows_realized,
        (SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_receivables WHERE organization_id=_org AND financial_category_id=fc.id AND status NOT IN ('PAID','CANCELED','WRITTEN_OFF') AND due_date BETWEEN COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)) inflows_projected,
        (SELECT round(coalesce(sum(open_amount),0),2) FROM public.account_payables WHERE organization_id=_org AND financial_category_id=fc.id AND status NOT IN ('PAID','CANCELED') AND due_date BETWEEN COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)) outflows_projected
        FROM public.financial_categories fc WHERE fc.organization_id=_org AND (coalesce(_filters->>'type','')='' OR fc.type=_filters->>'type')
        ORDER BY fc.type,fc.code)q),'[]'::jsonb)) INTO v_result;
  ELSIF _kind='report_cost_center' THEN
    SELECT jsonb_build_object('from',COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date),'to',COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE),
      'rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT cc.id,cc.code,cc.name,
        (SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND cost_center_id=cc.id AND direction='IN'
          AND occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)) inflows_realized,
        (SELECT round(coalesce(sum(amount),0),2) FROM public.financial_transactions WHERE organization_id=_org AND cost_center_id=cc.id AND direction='OUT'
          AND occurred_at::date>=COALESCE(nullif(_filters->>'from','')::date,date_trunc('month',now())::date) AND occurred_at::date<=COALESCE(nullif(_filters->>'to','')::date,CURRENT_DATE)) outflows_realized
        FROM public.cost_centers cc WHERE cc.organization_id=_org ORDER BY cc.code)q),'[]'::jsonb)) INTO v_result;
  ELSIF _kind='history' THEN
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT action,created_at,user_id,context FROM public.audit_log WHERE organization_id=_org AND resource_id=_filters->>'id' ORDER BY created_at DESC LIMIT 100)q),'[]'::jsonb) INTO v_result;
  END IF;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Consulta/recurso não encontrado.'; END IF;
  RETURN v_result;
END;
$$;

-- =====================================================================
-- 18. Grants/REVOKEs finais.
-- =====================================================================
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
   'fin_save_category','fin_save_cost_center','fin_save_account','fin_save_payment_method','fin_save_settings',
   'fin_create_receivable','fin_create_payable','fin_document_mutate','fin_settle','fin_reverse_transaction',
   'fin_transfer','fin_opening_balance','fin_direct_movement','fin_save_recurrence','fin_generate_recurrences',
   'fin_process_reconciliation','fin_query') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
   'finance_balance','finance_document_paid','finance_document_open','finance_refresh_document','finance_mark_source_reopened') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;

COMMIT;