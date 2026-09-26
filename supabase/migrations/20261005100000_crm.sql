-- MASTER 012: CRM uses Company, official Pricing, ledger and domain_events.
BEGIN;
ALTER TABLE public.company_roles DROP CONSTRAINT company_roles_role_check;
ALTER TABLE public.company_roles ADD CONSTRAINT company_roles_role_check CHECK(role IN ('CUSTOMER','PROSPECT','PARTNER','RESELLER','SUPPLIER'));
ALTER TABLE public.company_contacts ADD COLUMN department text, ADD COLUMN preferred_channel text,
 ADD COLUMN processing_purpose text, ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false,
 ADD COLUMN communication_restricted boolean NOT NULL DEFAULT false;

CREATE TABLE public.commercial_segments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), UNIQUE(organization_id,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commercial_segments_tenant ON public.commercial_segments(organization_id,created_at DESC);

CREATE TABLE public.commercial_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), UNIQUE(organization_id,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commercial_sources_tenant ON public.commercial_sources(organization_id,created_at DESC);

CREATE TABLE public.commercial_reasons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), kind text NOT NULL CHECK(kind IN ('LEAD','LOSS')), UNIQUE(organization_id,kind,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commercial_reasons_tenant ON public.commercial_reasons(organization_id,created_at DESC);

CREATE TABLE public.commercial_tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), UNIQUE(organization_id,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commercial_tags_tenant ON public.commercial_tags(organization_id,created_at DESC);

CREATE TABLE public.sales_territories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), region text,state text,city text,segment_id uuid , FOREIGN KEY(organization_id,segment_id) REFERENCES public.commercial_segments(organization_id,id), UNIQUE(organization_id,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_territories_tenant ON public.sales_territories(organization_id,created_at DESC);

CREATE TABLE public.sales_representatives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 representative_code text NOT NULL, name text NOT NULL, user_id uuid REFERENCES public.profiles,
 representative_type text NOT NULL CHECK(representative_type IN ('INTERNAL','EXTERNAL','COMPANY')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), assigned_manager_id uuid REFERENCES public.profiles,company_id uuid , FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id), UNIQUE(organization_id,representative_code), UNIQUE(organization_id,user_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_representatives_tenant ON public.sales_representatives(organization_id,created_at DESC);

CREATE TABLE public.commercial_payment_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), description text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), UNIQUE(organization_id,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commercial_payment_terms_tenant ON public.commercial_payment_terms(organization_id,created_at DESC);

CREATE TABLE public.customer_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id), customer_code text NOT NULL, customer_type text, commercial_status text NOT NULL DEFAULT 'ACTIVE' CHECK(commercial_status IN ('ACTIVE','INACTIVE','BLOCKED')),commercial_segment_id uuid , FOREIGN KEY(organization_id,commercial_segment_id) REFERENCES public.commercial_segments(organization_id,id),acquisition_source_id uuid , FOREIGN KEY(organization_id,acquisition_source_id) REFERENCES public.commercial_sources(organization_id,id),price_table_id uuid , FOREIGN KEY(organization_id,price_table_id) REFERENCES public.price_tables(organization_id,id),payment_terms_id uuid , FOREIGN KEY(organization_id,payment_terms_id) REFERENCES public.commercial_payment_terms(organization_id,id), notes text, UNIQUE(organization_id,company_id), UNIQUE(organization_id,customer_code),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX customer_profiles_tenant ON public.customer_profiles(organization_id,created_at DESC);

CREATE TABLE public.customer_credit_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id), credit_limit numeric(14,2) CHECK(credit_limit>=0), block_over_limit boolean NOT NULL DEFAULT false, block_overdue boolean NOT NULL DEFAULT false, reason text NOT NULL CHECK(length(trim(reason))>0), UNIQUE(organization_id,company_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX customer_credit_policies_tenant ON public.customer_credit_policies(organization_id,created_at DESC);

CREATE TABLE public.customer_tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),tag_id uuid NOT NULL, FOREIGN KEY(organization_id,tag_id) REFERENCES public.commercial_tags(organization_id,id), UNIQUE(organization_id,company_id,tag_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX customer_tags_tenant ON public.customer_tags(organization_id,created_at DESC);

CREATE TABLE public.customer_territories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),territory_id uuid NOT NULL, FOREIGN KEY(organization_id,territory_id) REFERENCES public.sales_territories(organization_id,id), UNIQUE(organization_id,company_id,territory_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX customer_territories_tenant ON public.customer_territories(organization_id,created_at DESC);

CREATE TABLE public.customer_portfolio_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),representative_id uuid NOT NULL, FOREIGN KEY(organization_id,representative_id) REFERENCES public.sales_representatives(organization_id,id), started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, assignment_type text NOT NULL DEFAULT 'PRIMARY' CHECK(assignment_type='PRIMARY'), reason text NOT NULL CHECK(length(trim(reason))>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX customer_portfolio_assignments_tenant ON public.customer_portfolio_assignments(organization_id,created_at DESC);

CREATE UNIQUE INDEX customer_active_portfolio ON public.customer_portfolio_assignments(organization_id,company_id) WHERE ended_at IS NULL;
CREATE TABLE public.leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), company_name text,email text,phone text,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACT_ATTEMPTED','CONTACTED','QUALIFIED','UNQUALIFIED','CONVERTED','ARCHIVED')),
 assigned_user_id uuid REFERENCES public.profiles,notes text,converted_at timestamptz,company_id uuid , FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),commercial_segment_id uuid , FOREIGN KEY(organization_id,commercial_segment_id) REFERENCES public.commercial_segments(organization_id,id),acquisition_source_id uuid , FOREIGN KEY(organization_id,acquisition_source_id) REFERENCES public.commercial_sources(organization_id,id),disqualification_reason_id uuid , FOREIGN KEY(organization_id,disqualification_reason_id) REFERENCES public.commercial_reasons(organization_id,id), processing_purpose text, marketing_opt_in boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX leads_tenant ON public.leads(organization_id,created_at DESC);

CREATE TABLE public.sales_pipelines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL CHECK(length(trim(name))>0), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), UNIQUE(organization_id,name),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_pipelines_tenant ON public.sales_pipelines(organization_id,created_at DESC);

CREATE TABLE public.sales_pipeline_stages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 pipeline_id uuid NOT NULL, FOREIGN KEY(organization_id,pipeline_id) REFERENCES public.sales_pipelines(organization_id,id), name text NOT NULL CHECK(length(trim(name))>0), position integer NOT NULL CHECK(position>=0), probability numeric(5,2) NOT NULL CHECK(probability BETWEEN 0 AND 100), UNIQUE(organization_id,pipeline_id,position),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_pipeline_stages_tenant ON public.sales_pipeline_stages(organization_id,created_at DESC);

CREATE TABLE public.sales_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),representative_id uuid , FOREIGN KEY(organization_id,representative_id) REFERENCES public.sales_representatives(organization_id,id),pipeline_id uuid NOT NULL, FOREIGN KEY(organization_id,pipeline_id) REFERENCES public.sales_pipelines(organization_id,id),stage_id uuid NOT NULL, FOREIGN KEY(organization_id,stage_id) REFERENCES public.sales_pipeline_stages(organization_id,id), primary_contact_id uuid REFERENCES public.company_contacts,
 title text NOT NULL CHECK(length(trim(title))>0),description text,estimated_value numeric(14,2) NOT NULL DEFAULT 0 CHECK(estimated_value>=0),
 expected_close_date date,probability numeric(5,2) NOT NULL CHECK(probability BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','WON','LOST','CANCELED')), source_type text,source_id uuid,closed_at timestamptz,loss_reason_id uuid , FOREIGN KEY(organization_id,loss_reason_id) REFERENCES public.commercial_reasons(organization_id,id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_opportunities_tenant ON public.sales_opportunities(organization_id,created_at DESC);

CREATE TABLE public.opportunity_stage_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 opportunity_id uuid NOT NULL, FOREIGN KEY(organization_id,opportunity_id) REFERENCES public.sales_opportunities(organization_id,id), previous_stage jsonb,new_stage jsonb NOT NULL,reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX opportunity_stage_history_tenant ON public.opportunity_stage_history(organization_id,created_at DESC);

CREATE TABLE public.opportunity_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 opportunity_id uuid NOT NULL, FOREIGN KEY(organization_id,opportunity_id) REFERENCES public.sales_opportunities(organization_id,id), variant_id uuid NOT NULL REFERENCES public.product_variants, estimated_quantity numeric(14,3) NOT NULL CHECK(estimated_quantity>0), estimated_unit_price numeric(14,2) NOT NULL CHECK(estimated_unit_price>=0), estimated_total numeric(14,2) GENERATED ALWAYS AS (round(estimated_quantity*estimated_unit_price,2)) STORED, notes text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX opportunity_items_tenant ON public.opportunity_items(organization_id,created_at DESC);

CREATE TABLE public.sales_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),representative_id uuid , FOREIGN KEY(organization_id,representative_id) REFERENCES public.sales_representatives(organization_id,id),opportunity_id uuid , FOREIGN KEY(organization_id,opportunity_id) REFERENCES public.sales_opportunities(organization_id,id),price_table_id uuid NOT NULL, FOREIGN KEY(organization_id,price_table_id) REFERENCES public.price_tables(organization_id,id),
 primary_contact_id uuid REFERENCES public.company_contacts, quote_number bigint NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 issue_date date NOT NULL DEFAULT current_date,valid_until date NOT NULL,
 payment_terms_snapshot jsonb NOT NULL DEFAULT '{}', company_snapshot jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELED')),
 subtotal numeric(14,2) NOT NULL DEFAULT 0,discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 100),
 discount_amount numeric(14,2) NOT NULL DEFAULT 0,freight numeric(14,2) NOT NULL DEFAULT 0 CHECK(freight>=0),
 tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0), total numeric(14,2) NOT NULL DEFAULT 0,
 notes text, approved_by uuid REFERENCES public.profiles,approved_at timestamptz,sent_at timestamptz,accepted_at timestamptz,
 accepted_by uuid REFERENCES public.profiles,acceptance_contact_id uuid REFERENCES public.company_contacts,acceptance_evidence text,
 UNIQUE(organization_id,quote_number,version), CHECK(valid_until>=issue_date),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_quotes_tenant ON public.sales_quotes(organization_id,created_at DESC);

CREATE TABLE public.sales_quote_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 quote_id uuid NOT NULL, FOREIGN KEY(organization_id,quote_id) REFERENCES public.sales_quotes(organization_id,id), variant_id uuid NOT NULL REFERENCES public.product_variants, quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_price numeric(14,2) NOT NULL CHECK(unit_price>0), total numeric(14,2) GENERATED ALWAYS AS(round(quantity*unit_price,2)) STORED, price_snapshot jsonb NOT NULL, product_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX sales_quote_items_tenant ON public.sales_quote_items(organization_id,created_at DESC);

CREATE TABLE public.quote_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 quote_id uuid NOT NULL, FOREIGN KEY(organization_id,quote_id) REFERENCES public.sales_quotes(organization_id,id), decision text NOT NULL CHECK(decision IN ('APPROVED','DENIED')), reason text NOT NULL, values_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX quote_approvals_tenant ON public.quote_approvals(organization_id,created_at DESC);

CREATE TABLE public.commercial_discount_authorities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 user_id uuid NOT NULL REFERENCES public.profiles, max_discount_percent numeric(5,2) NOT NULL CHECK(max_discount_percent BETWEEN 0 AND 100), reason text NOT NULL CHECK(length(trim(reason))>0), UNIQUE(organization_id,user_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commercial_discount_authorities_tenant ON public.commercial_discount_authorities(organization_id,created_at DESC);

CREATE TABLE public.crm_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid , FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id),lead_id uuid , FOREIGN KEY(organization_id,lead_id) REFERENCES public.leads(organization_id,id),opportunity_id uuid , FOREIGN KEY(organization_id,opportunity_id) REFERENCES public.sales_opportunities(organization_id,id),
 assigned_user_id uuid NOT NULL REFERENCES public.profiles,activity_type text NOT NULL CHECK(activity_type IN ('CALL','MEETING','EMAIL','WHATSAPP','VISIT','TASK','FOLLOW_UP','NOTE','OTHER')),
 subject text NOT NULL CHECK(length(trim(subject))>0),description text,scheduled_at timestamptz NOT NULL,completed_at timestamptz,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','CANCELED')),outcome text,
 CHECK(company_id IS NOT NULL OR lead_id IS NOT NULL OR opportunity_id IS NOT NULL),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX crm_activities_tenant ON public.crm_activities(organization_id,created_at DESC);

CREATE TABLE public.crm_activity_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 activity_id uuid NOT NULL, FOREIGN KEY(organization_id,activity_id) REFERENCES public.crm_activities(organization_id,id), before_value jsonb,after_value jsonb NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX crm_activity_history_tenant ON public.crm_activity_history(organization_id,created_at DESC);

CREATE TABLE public.commission_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL, trigger_event text NOT NULL CHECK(trigger_event IN ('SALE_CONFIRMED','RECEIPT_CONFIRMED')), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commission_plans_tenant ON public.commission_plans(organization_id,created_at DESC);

CREATE TABLE public.commission_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 plan_id uuid NOT NULL, FOREIGN KEY(organization_id,plan_id) REFERENCES public.commission_plans(organization_id,id),representative_id uuid , FOREIGN KEY(organization_id,representative_id) REFERENCES public.sales_representatives(organization_id,id),company_id uuid , FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id), variant_id uuid REFERENCES public.product_variants, rate_type text NOT NULL CHECK(rate_type IN ('PERCENT','FIXED_PER_UNIT')), rate numeric(14,4) NOT NULL CHECK(rate>=0),effective_from date NOT NULL,effective_to date, CHECK(effective_to IS NULL OR effective_to>=effective_from),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX commission_rules_tenant ON public.commission_rules(organization_id,created_at DESC);

CREATE TABLE public.crm_operation_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 operation_key uuid NOT NULL, operation text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL, UNIQUE(organization_id,operation_key),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX crm_operation_keys_tenant ON public.crm_operation_keys(organization_id,created_at DESC);

CREATE TABLE public.company_merge_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 source_company_id uuid NOT NULL, FOREIGN KEY(organization_id,source_company_id) REFERENCES public.companies(organization_id,id),target_company_id uuid NOT NULL, FOREIGN KEY(organization_id,target_company_id) REFERENCES public.companies(organization_id,id),reason text NOT NULL CHECK(length(trim(reason))>0), status text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK(status='REVIEW_REQUIRED'), CHECK(source_company_id<>target_company_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles DEFAULT auth.uid(), UNIQUE(organization_id,id)
);
CREATE INDEX company_merge_requests_tenant ON public.company_merge_requests(organization_id,created_at DESC);
-- External linked representatives have portfolio scope. Unlinked external representatives have no login.
CREATE FUNCTION public.crm_external(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM sales_representatives WHERE organization_id=_org AND user_id=auth.uid() AND representative_type IN ('EXTERNAL','COMPANY'));
$$;
CREATE FUNCTION public.crm_company_access(_org uuid,_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_org_member(_org) AND (NOT public.crm_external(_org) OR EXISTS(
 SELECT 1 FROM customer_portfolio_assignments a JOIN sales_representatives r ON r.id=a.representative_id
 WHERE a.organization_id=_org AND a.company_id=_company AND a.ended_at IS NULL AND r.user_id=auth.uid() AND r.status='ACTIVE'));
$$;
CREATE FUNCTION public.crm_require(_org uuid,_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Permissão negada: %',_permission; END IF; END $$;
CREATE FUNCTION public.crm_audit(_org uuid,_action text,_id uuid,_context jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO audit_log(organization_id,user_id,action,resource,resource_id,context) VALUES(_org,auth.uid(),'crm.'||_action,'crm',_id::text,_context);
$$;
CREATE FUNCTION public.crm_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW); pair text[]; tenant uuid; parent_company uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico comercial não pode ser excluído.'; END IF;
 IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
 FOREACH pair SLICE 1 IN ARRAY ARRAY[['variant_id','product_variants'],['primary_contact_id','company_contacts'],['acceptance_contact_id','company_contacts']] LOOP
  IF j->>pair[1] IS NOT NULL THEN
   EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',pair[2]) INTO tenant USING (j->>pair[1])::uuid;
   IF tenant IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
  END IF;
 END LOOP;
 FOREACH pair SLICE 1 IN ARRAY ARRAY[['user_id'],['assigned_user_id'],['assigned_manager_id']] LOOP
  IF j->>pair[1] IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=NEW.organization_id AND user_id=(j->>pair[1])::uuid AND is_active) THEN RAISE EXCEPTION 'Usuário fora da organização.'; END IF;
 END LOOP;
 IF j->>'primary_contact_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_contacts WHERE id=(j->>'primary_contact_id')::uuid AND company_id=(j->>'company_id')::uuid) THEN RAISE EXCEPTION 'Contato de outra empresa.'; END IF;
 IF TG_TABLE_NAME='sales_opportunities' AND NOT EXISTS(SELECT 1 FROM sales_pipeline_stages WHERE id=(j->>'stage_id')::uuid AND pipeline_id=(j->>'pipeline_id')::uuid AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Etapa de outro pipeline.'; END IF;
 IF TG_TABLE_NAME='sales_quotes' AND j->>'opportunity_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales_opportunities WHERE id=(j->>'opportunity_id')::uuid AND company_id=(j->>'company_id')::uuid) THEN RAISE EXCEPTION 'Oportunidade de outra empresa.'; END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN ('opportunity_stage_history','quote_approvals','crm_activity_history','crm_operation_keys') THEN RAISE EXCEPTION 'Histórico imutável.'; END IF;
  IF TG_TABLE_NAME='sales_quotes' AND (to_jsonb(NEW)-ARRAY['status','approved_by','approved_at','sent_at','accepted_at','accepted_by','acceptance_contact_id','acceptance_evidence','updated_at'])<>(to_jsonb(OLD)-ARRAY['status','approved_by','approved_at','sent_at','accepted_at','accepted_by','acceptance_contact_id','acceptance_evidence','updated_at']) THEN RAISE EXCEPTION 'Proposta versionada imutável. Crie nova versão.'; END IF;
  IF TG_TABLE_NAME='sales_quote_items' THEN RAISE EXCEPTION 'Item versionado imutável.'; END IF;
  IF TG_TABLE_NAME='customer_portfolio_assignments' AND (to_jsonb(NEW)-'ended_at'-'updated_at')<>(to_jsonb(OLD)-'ended_at'-'updated_at') THEN RAISE EXCEPTION 'Carteira histórica imutável.'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Central price resolution shares the official PriceTableItem versions; no shadow price table.
CREATE FUNCTION public.pricing_resolve_table(_org uuid,_table uuid,_variant uuid,_date date) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT to_jsonb(i) FROM price_table_items i JOIN price_tables t ON t.id=i.price_table_id AND t.organization_id=i.organization_id
 WHERE i.organization_id=_org AND i.price_table_id=_table AND i.variant_id=_variant AND i.status='ACTIVE' AND t.status='ACTIVE'
 AND i.valid_from<=_date AND (i.valid_to IS NULL OR i.valid_to>=_date) AND t.valid_from<=_date AND (t.valid_to IS NULL OR t.valid_to>=_date)
 ORDER BY i.valid_from DESC,i.id DESC LIMIT 1;
$$;
CREATE FUNCTION public.crm_financial_position(_org uuid,_company uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('credit_limit',p.credit_limit,'open_amount',coalesce(x.open_amount,0),'overdue_amount',coalesce(x.overdue_amount,0),
 'credit_available',CASE WHEN p.credit_limit IS NOT NULL THEN p.credit_limit-coalesce(x.open_amount,0) END,
 'block_over_limit',coalesce(p.block_over_limit,false),'block_overdue',coalesce(p.block_overdue,false),'exposure_policy','OPEN_RECEIVABLES_PLUS_QUOTE_AT_APPROVAL')
 FROM (SELECT 1) dummy LEFT JOIN customer_credit_policies p ON p.organization_id=_org AND p.company_id=_company
 LEFT JOIN LATERAL(SELECT sum(open_amount)open_amount,sum(open_amount)FILTER(WHERE due_date<current_date)overdue_amount FROM account_receivables
 WHERE organization_id=_org AND company_id=_company AND status IN ('OPEN','PARTIALLY_PAID','OVERDUE'))x ON true;
$$;

ALTER TABLE public.commercial_segments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_segments FROM anon,authenticated;
GRANT SELECT ON public.commercial_segments TO authenticated;
GRANT ALL ON public.commercial_segments TO service_role;
CREATE POLICY crm_read ON public.commercial_segments FOR SELECT TO authenticated USING(public.has_permission(organization_id,'crm.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_segments FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commercial_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_sources FROM anon,authenticated;
GRANT SELECT ON public.commercial_sources TO authenticated;
GRANT ALL ON public.commercial_sources TO service_role;
CREATE POLICY crm_read ON public.commercial_sources FOR SELECT TO authenticated USING(public.has_permission(organization_id,'crm.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_sources FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commercial_reasons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_reasons FROM anon,authenticated;
GRANT SELECT ON public.commercial_reasons TO authenticated;
GRANT ALL ON public.commercial_reasons TO service_role;
CREATE POLICY crm_read ON public.commercial_reasons FOR SELECT TO authenticated USING(public.has_permission(organization_id,'crm.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_reasons FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commercial_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_tags FROM anon,authenticated;
GRANT SELECT ON public.commercial_tags TO authenticated;
GRANT ALL ON public.commercial_tags TO service_role;
CREATE POLICY crm_read ON public.commercial_tags FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_tags FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_territories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_territories FROM anon,authenticated;
GRANT SELECT ON public.sales_territories TO authenticated;
GRANT ALL ON public.sales_territories TO service_role;
CREATE POLICY crm_read ON public.sales_territories FOR SELECT TO authenticated USING(public.has_permission(organization_id,'representatives.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_territories FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_representatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_representatives FROM anon,authenticated;
GRANT SELECT ON public.sales_representatives TO authenticated;
GRANT ALL ON public.sales_representatives TO service_role;
CREATE POLICY crm_read ON public.sales_representatives FOR SELECT TO authenticated USING(public.has_permission(organization_id,'representatives.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_representatives FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commercial_payment_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_payment_terms FROM anon,authenticated;
GRANT SELECT ON public.commercial_payment_terms TO authenticated;
GRANT ALL ON public.commercial_payment_terms TO service_role;
CREATE POLICY crm_read ON public.commercial_payment_terms FOR SELECT TO authenticated USING(public.has_permission(organization_id,'crm.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_payment_terms FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_profiles FROM anon,authenticated;
GRANT SELECT ON public.customer_profiles TO authenticated;
GRANT ALL ON public.customer_profiles TO service_role;
CREATE POLICY crm_read ON public.customer_profiles FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.customer_credit_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_credit_policies FROM anon,authenticated;
GRANT SELECT ON public.customer_credit_policies TO authenticated;
GRANT ALL ON public.customer_credit_policies TO service_role;
CREATE POLICY crm_read ON public.customer_credit_policies FOR SELECT TO authenticated USING(public.has_permission(organization_id,'commercial_sensitive.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.customer_credit_policies FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_tags FROM anon,authenticated;
GRANT SELECT ON public.customer_tags TO authenticated;
GRANT ALL ON public.customer_tags TO service_role;
CREATE POLICY crm_read ON public.customer_tags FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.customer_tags FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.customer_territories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_territories FROM anon,authenticated;
GRANT SELECT ON public.customer_territories TO authenticated;
GRANT ALL ON public.customer_territories TO service_role;
CREATE POLICY crm_read ON public.customer_territories FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.customer_territories FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.customer_portfolio_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portfolio_assignments FROM anon,authenticated;
GRANT SELECT ON public.customer_portfolio_assignments TO authenticated;
GRANT ALL ON public.customer_portfolio_assignments TO service_role;
CREATE POLICY crm_read ON public.customer_portfolio_assignments FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.customer_portfolio_assignments FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leads FROM anon,authenticated;
GRANT SELECT ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
CREATE POLICY crm_read ON public.leads FOR SELECT TO authenticated USING(public.has_permission(organization_id,'leads.read') AND (NOT public.crm_external(organization_id) OR assigned_user_id=auth.uid()));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_pipelines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_pipelines FROM anon,authenticated;
GRANT SELECT ON public.sales_pipelines TO authenticated;
GRANT ALL ON public.sales_pipelines TO service_role;
CREATE POLICY crm_read ON public.sales_pipelines FOR SELECT TO authenticated USING(public.has_permission(organization_id,'opportunities.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_pipelines FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_pipeline_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_pipeline_stages FROM anon,authenticated;
GRANT SELECT ON public.sales_pipeline_stages TO authenticated;
GRANT ALL ON public.sales_pipeline_stages TO service_role;
CREATE POLICY crm_read ON public.sales_pipeline_stages FOR SELECT TO authenticated USING(public.has_permission(organization_id,'opportunities.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_opportunities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_opportunities FROM anon,authenticated;
GRANT SELECT ON public.sales_opportunities TO authenticated;
GRANT ALL ON public.sales_opportunities TO service_role;
CREATE POLICY crm_read ON public.sales_opportunities FOR SELECT TO authenticated USING(public.has_permission(organization_id,'opportunities.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_opportunities FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.opportunity_stage_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_stage_history FROM anon,authenticated;
GRANT SELECT ON public.opportunity_stage_history TO authenticated;
GRANT ALL ON public.opportunity_stage_history TO service_role;
CREATE POLICY crm_read ON public.opportunity_stage_history FOR SELECT TO authenticated USING(public.has_permission(organization_id,'opportunities.read') AND EXISTS(SELECT 1 FROM sales_opportunities p WHERE p.id=opportunity_id AND public.crm_company_access(organization_id,p.company_id)));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.opportunity_stage_history FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.opportunity_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_items FROM anon,authenticated;
GRANT SELECT ON public.opportunity_items TO authenticated;
GRANT ALL ON public.opportunity_items TO service_role;
CREATE POLICY crm_read ON public.opportunity_items FOR SELECT TO authenticated USING(public.has_permission(organization_id,'opportunities.read') AND EXISTS(SELECT 1 FROM sales_opportunities p WHERE p.id=opportunity_id AND public.crm_company_access(organization_id,p.company_id)));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.opportunity_items FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_quotes FROM anon,authenticated;
GRANT SELECT ON public.sales_quotes TO authenticated;
GRANT ALL ON public.sales_quotes TO service_role;
CREATE POLICY crm_read ON public.sales_quotes FOR SELECT TO authenticated USING(public.has_permission(organization_id,'quotes.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_quotes FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.sales_quote_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_quote_items FROM anon,authenticated;
GRANT SELECT ON public.sales_quote_items TO authenticated;
GRANT ALL ON public.sales_quote_items TO service_role;
CREATE POLICY crm_read ON public.sales_quote_items FOR SELECT TO authenticated USING(public.has_permission(organization_id,'quotes.read') AND EXISTS(SELECT 1 FROM sales_quotes p WHERE p.id=quote_id AND public.crm_company_access(organization_id,p.company_id)));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.sales_quote_items FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.quote_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_approvals FROM anon,authenticated;
GRANT SELECT ON public.quote_approvals TO authenticated;
GRANT ALL ON public.quote_approvals TO service_role;
CREATE POLICY crm_read ON public.quote_approvals FOR SELECT TO authenticated USING(public.has_permission(organization_id,'quotes.read') AND EXISTS(SELECT 1 FROM sales_quotes p WHERE p.id=quote_id AND public.crm_company_access(organization_id,p.company_id)));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.quote_approvals FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commercial_discount_authorities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_discount_authorities FROM anon,authenticated;
GRANT SELECT ON public.commercial_discount_authorities TO authenticated;
GRANT ALL ON public.commercial_discount_authorities TO service_role;
CREATE POLICY crm_read ON public.commercial_discount_authorities FOR SELECT TO authenticated USING(public.has_permission(organization_id,'commercial_sensitive.read') AND NOT public.crm_external(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_discount_authorities FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_activities FROM anon,authenticated;
GRANT SELECT ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
CREATE POLICY crm_read ON public.crm_activities FOR SELECT TO authenticated USING(public.has_permission(organization_id,'activities.read') AND (NOT public.crm_external(organization_id) OR (assigned_user_id=auth.uid() AND (company_id IS NULL OR public.crm_company_access(organization_id,company_id)))));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.crm_activity_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_activity_history FROM anon,authenticated;
GRANT SELECT ON public.crm_activity_history TO authenticated;
GRANT ALL ON public.crm_activity_history TO service_role;
CREATE POLICY crm_read ON public.crm_activity_history FOR SELECT TO authenticated USING(public.has_permission(organization_id,'activities.read') AND EXISTS(SELECT 1 FROM crm_activities p WHERE p.id=activity_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.crm_activity_history FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commission_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_plans FROM anon,authenticated;
GRANT SELECT ON public.commission_plans TO authenticated;
GRANT ALL ON public.commission_plans TO service_role;
CREATE POLICY crm_read ON public.commission_plans FOR SELECT TO authenticated USING(public.has_permission(organization_id,'commercial_sensitive.read') AND public.is_org_member(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commission_plans FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_rules FROM anon,authenticated;
GRANT SELECT ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_rules TO service_role;
CREATE POLICY crm_read ON public.commission_rules FOR SELECT TO authenticated USING(public.has_permission(organization_id,'commercial_sensitive.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.crm_operation_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_operation_keys FROM anon,authenticated;
GRANT SELECT ON public.crm_operation_keys TO authenticated;
GRANT ALL ON public.crm_operation_keys TO service_role;
CREATE POLICY crm_read ON public.crm_operation_keys FOR SELECT TO authenticated USING(public.has_permission(organization_id,'crm.read') AND NOT public.crm_external(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.crm_operation_keys FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

ALTER TABLE public.company_merge_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_merge_requests FROM anon,authenticated;
GRANT SELECT ON public.company_merge_requests TO authenticated;
GRANT ALL ON public.company_merge_requests TO service_role;
CREATE POLICY crm_read ON public.company_merge_requests FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.merge') AND NOT public.crm_external(organization_id));
CREATE TRIGGER crm_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.company_merge_requests FOR EACH ROW EXECUTE FUNCTION public.crm_guard();

-- Restrictive clauses also constrain pre-existing broad Company read policies for external CRM users.
CREATE POLICY crm_company_scope ON public.companies AS RESTRICTIVE FOR SELECT TO authenticated USING(public.crm_company_access(organization_id,id));
CREATE POLICY crm_contact_scope ON public.company_contacts AS RESTRICTIVE FOR SELECT TO authenticated USING(public.crm_company_access(organization_id,company_id));
CREATE POLICY crm_address_scope ON public.company_addresses AS RESTRICTIVE FOR SELECT TO authenticated USING(public.crm_company_access(organization_id,company_id));
CREATE POLICY crm_company_read ON public.companies FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,id));
CREATE POLICY crm_contact_read ON public.company_contacts FOR SELECT TO authenticated USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,company_id));
INSERT INTO public.role_permissions(role,permission) SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor'])r CROSS JOIN unnest(ARRAY['crm.read','crm.dashboard','leads.read','leads.create','leads.update','leads.convert','customers.read','customers.create','customers.update','customers.merge','opportunities.read','opportunities.create','opportunities.update','opportunities.close','quotes.read','quotes.create','quotes.update','quotes.approve','quotes.send','quotes.accept','activities.read','activities.manage','representatives.read','representatives.manage','portfolios.manage','crm.export','commercial_sensitive.read','crm.configure'])p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission) SELECT 'comercial'::public.app_role,p FROM unnest(ARRAY['crm.read','crm.dashboard','leads.read','leads.create','leads.update','leads.convert','customers.read','customers.create','customers.update','opportunities.read','opportunities.create','opportunities.update','opportunities.close','quotes.read','quotes.create','quotes.update','quotes.send','quotes.accept','activities.read','activities.manage','representatives.read','crm.export'])p ON CONFLICT DO NOTHING;
CREATE FUNCTION public.crm_save(_org uuid,_kind text,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid:=coalesce(nullif(_data->>'id','')::uuid,gen_random_uuid()); company uuid; rep uuid; stage public.sales_pipeline_stages;
 old jsonb; result jsonb; tab text; cols text[]; col text; names text:=''; expr text:=''; changes text:=''; perm text; i jsonb; k uuid; amount numeric;
BEGIN
 PERFORM public.crm_require(_org,'crm.read');
 PERFORM public.inventory_lock(_org);
 IF _kind IN ('segment','source','reason','tag','territory','payment_terms','pipeline','stage','discount_authority','commission_plan','commission_rule') THEN
  PERFORM public.crm_require(_org,'crm.configure');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Configuração restrita à equipe interna.'; END IF;
 END IF;
 CASE _kind
 WHEN 'segment' THEN tab:='commercial_segments'; cols:=ARRAY['name','status'];
 WHEN 'source' THEN tab:='commercial_sources'; cols:=ARRAY['name','status'];
 WHEN 'reason' THEN tab:='commercial_reasons'; cols:=ARRAY['name','kind'];
 WHEN 'tag' THEN tab:='commercial_tags'; cols:=ARRAY['name'];
 WHEN 'territory' THEN tab:='sales_territories'; cols:=ARRAY['name','region','state','city','segment_id'];
 WHEN 'payment_terms' THEN tab:='commercial_payment_terms'; cols:=ARRAY['name','description','status'];
 WHEN 'pipeline' THEN tab:='sales_pipelines'; cols:=ARRAY['name','status'];
 WHEN 'stage' THEN tab:='sales_pipeline_stages'; cols:=ARRAY['name','pipeline_id','position','probability'];
 WHEN 'discount_authority' THEN tab:='commercial_discount_authorities'; cols:=ARRAY['user_id','max_discount_percent','reason'];
 WHEN 'commission_plan' THEN tab:='commission_plans'; cols:=ARRAY['name','trigger_event','status'];
 WHEN 'commission_rule' THEN tab:='commission_rules'; cols:=ARRAY['plan_id','representative_id','company_id','variant_id','rate_type','rate','effective_from','effective_to'];
 WHEN 'representative' THEN
  PERFORM public.crm_require(_org,'representatives.manage');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Gestão restrita à equipe interna.'; END IF;
  tab:='sales_representatives';cols:=ARRAY['representative_code','name','representative_type','user_id','company_id','status','assigned_manager_id'];
 WHEN 'lead' THEN
  PERFORM public.crm_require(_org,CASE WHEN _data->>'id' IS NULL THEN 'leads.create' ELSE 'leads.update' END);
  SELECT to_jsonb(l) INTO old FROM leads l WHERE l.id=ident AND organization_id=_org;
  IF old->>'status'='CONVERTED' THEN RAISE EXCEPTION 'Lead convertido preservado.'; END IF;
  IF public.crm_external(_org) AND (coalesce(nullif(_data->>'assigned_user_id','')::uuid,auth.uid())<>auth.uid() OR (old IS NOT NULL AND old->>'assigned_user_id'<>auth.uid()::text)) THEN RAISE EXCEPTION 'Lead fora da carteira.'; END IF;
  IF _data->>'status'='CONVERTED' THEN RAISE EXCEPTION 'Use a conversão transacional.'; END IF;
  IF _data->>'status'='UNQUALIFIED' AND NOT EXISTS(SELECT 1 FROM commercial_reasons WHERE organization_id=_org AND id=nullif(_data->>'disqualification_reason_id','')::uuid AND kind='LEAD') THEN RAISE EXCEPTION 'Motivo de desqualificação obrigatório.'; END IF;
  _data:=jsonb_build_object('assigned_user_id',auth.uid())||_data;
  tab:='leads'; cols:=ARRAY['name','company_name','email','phone','acquisition_source_id','commercial_segment_id','assigned_user_id','status','notes','disqualification_reason_id','processing_purpose','marketing_opt_in'];
 WHEN 'customer' THEN
  PERFORM public.crm_require(_org,'customers.create');
  company:=nullif(_data->>'company_id','')::uuid;
  IF company IS NULL THEN
   IF public.crm_external(_org) THEN RAISE EXCEPTION 'Solicite cadastro empresarial à equipe interna.'; END IF;
   company:=public.partner_save_company(_org,(_data->'company')||jsonb_build_object('roles',jsonb_build_array('CUSTOMER')));
  END IF;
  IF NOT public.crm_company_access(_org,company) OR NOT EXISTS(SELECT 1 FROM companies WHERE id=company AND organization_id=_org) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  INSERT INTO company_roles(organization_id,company_id,role) VALUES(_org,company,'CUSTOMER') ON CONFLICT DO NOTHING;
  INSERT INTO customer_profiles(organization_id,company_id,customer_code,commercial_segment_id,acquisition_source_id,price_table_id,payment_terms_id)
   VALUES(_org,company,coalesce(nullif(_data->>'customer_code',''),(SELECT code FROM companies WHERE id=company)),nullif(_data->>'commercial_segment_id','')::uuid,nullif(_data->>'acquisition_source_id','')::uuid,nullif(_data->>'price_table_id','')::uuid,nullif(_data->>'payment_terms_id','')::uuid)
   ON CONFLICT(organization_id,company_id) DO NOTHING RETURNING id INTO ident;
  SELECT id INTO ident FROM customer_profiles WHERE organization_id=_org AND company_id=company;
  PERFORM public.crm_audit(_org,'customer.link',ident,jsonb_build_object('company_id',company));
  RETURN jsonb_build_object('id',ident,'company_id',company);
 WHEN 'customer_profile' THEN
  PERFORM public.crm_require(_org,'customers.update');
  SELECT company_id INTO company FROM customer_profiles WHERE id=ident AND organization_id=_org;
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente fora da carteira.'; END IF;
  tab:='customer_profiles';cols:=ARRAY['customer_type','commercial_status','commercial_segment_id','acquisition_source_id','price_table_id','payment_terms_id','notes'];
 WHEN 'credit' THEN
  PERFORM public.crm_require(_org,'crm.configure'); PERFORM public.crm_require(_org,'commercial_sensitive.read');
  PERFORM public.crm_require(_org,'receivables.read');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Política restrita à equipe interna.'; END IF;
  tab:='customer_credit_policies';cols:=ARRAY['company_id','credit_limit','block_over_limit','block_overdue','reason'];
 WHEN 'customer_tag' THEN tab:='customer_tags';cols:=ARRAY['company_id','tag_id'];
 WHEN 'customer_territory' THEN tab:='customer_territories';cols:=ARRAY['company_id','territory_id'];
 WHEN 'merge_request' THEN
  PERFORM public.crm_require(_org,'customers.merge');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Mesclagem restrita à equipe interna.'; END IF;
  tab:='company_merge_requests';cols:=ARRAY['source_company_id','target_company_id','reason'];
 WHEN 'contact' THEN
  PERFORM public.crm_require(_org,'customers.update');
  company:=(_data->>'company_id')::uuid;
  IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  ident:=public.partner_save_detail(_org,company,'contact',_data,nullif(_data->>'id','')::uuid);
  UPDATE company_contacts SET department=_data->>'department',preferred_channel=_data->>'preferred_channel',processing_purpose=_data->>'processing_purpose',
   marketing_opt_in=coalesce((_data->>'marketing_opt_in')::boolean,false),communication_restricted=coalesce((_data->>'communication_restricted')::boolean,false) WHERE id=ident;
  RETURN jsonb_build_object('id',ident);
 WHEN 'opportunity' THEN
  PERFORM public.crm_require(_org,CASE WHEN _data->>'id' IS NULL THEN 'opportunities.create' ELSE 'opportunities.update' END);
  company:=(_data->>'company_id')::uuid;
  IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  SELECT to_jsonb(o) INTO old FROM sales_opportunities o WHERE id=ident AND organization_id=_org;
  IF old IS NOT NULL THEN RAISE EXCEPTION 'Use transição para etapa ou encerramento; itens históricos preservados.'; END IF;
  SELECT * INTO stage FROM sales_pipeline_stages WHERE id=(_data->>'stage_id')::uuid AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida.'; END IF;
  SELECT representative_id INTO rep FROM customer_portfolio_assignments WHERE organization_id=_org AND company_id=company AND ended_at IS NULL;
  INSERT INTO sales_opportunities(id,organization_id,company_id,representative_id,pipeline_id,stage_id,primary_contact_id,title,description,expected_close_date,probability,source_type,source_id)
  VALUES(ident,_org,company,rep,stage.pipeline_id,stage.id,nullif(_data->>'primary_contact_id','')::uuid,_data->>'title',_data->>'description',nullif(_data->>'expected_close_date','')::date,coalesce((_data->>'probability')::numeric,stage.probability),_data->>'source_type',nullif(_data->>'source_id','')::uuid);
  FOR i IN SELECT value FROM jsonb_array_elements(coalesce(_data->'items','[]')) LOOP
   INSERT INTO opportunity_items(organization_id,opportunity_id,variant_id,estimated_quantity,estimated_unit_price,notes)
   VALUES(_org,ident,(i->>'variant_id')::uuid,(i->>'quantity')::numeric,(i->>'unit_price')::numeric,i->>'notes');
  END LOOP;
  UPDATE sales_opportunities SET estimated_value=coalesce((SELECT sum(estimated_total) FROM opportunity_items WHERE opportunity_id=ident),0) WHERE id=ident;
  INSERT INTO opportunity_stage_history(organization_id,opportunity_id,new_stage) VALUES(_org,ident,to_jsonb(stage));
  PERFORM public.crm_audit(_org,'opportunity.create',ident,jsonb_build_object('company_id',company));
  RETURN jsonb_build_object('id',ident);
 WHEN 'activity' THEN
  PERFORM public.crm_require(_org,'activities.manage');
  SELECT to_jsonb(a) INTO old FROM crm_activities a WHERE id=ident AND organization_id=_org;
  company:=coalesce(nullif(_data->>'company_id','')::uuid,(old->>'company_id')::uuid);
  IF company IS NOT NULL AND NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Atividade fora da carteira.'; END IF;
  IF public.crm_external(_org) AND coalesce(nullif(_data->>'assigned_user_id','')::uuid,(old->>'assigned_user_id')::uuid,auth.uid())<>auth.uid() THEN RAISE EXCEPTION 'Responsável fora da carteira.'; END IF;
  IF _data->>'status'='COMPLETED' THEN _data:=_data||jsonb_build_object('completed_at',now()); END IF;
  IF old IS NOT NULL AND nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo da alteração obrigatório.'; END IF;
  _data:=jsonb_build_object('assigned_user_id',auth.uid())||_data;
  tab:='crm_activities';cols:=ARRAY['company_id','lead_id','opportunity_id','assigned_user_id','activity_type','subject','description','scheduled_at','status','completed_at','outcome'];
 ELSE RAISE EXCEPTION 'Cadastro desconhecido.';
 END CASE;
 IF _kind IN ('customer_tag','customer_territory') THEN
  PERFORM public.crm_require(_org,'customers.update');
  IF NOT public.crm_company_access(_org,(_data->>'company_id')::uuid) THEN RAISE EXCEPTION 'Cliente fora da carteira.'; END IF;
 END IF;
 IF _data->>'id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(_data) f WHERE f<>'id') THEN RAISE EXCEPTION 'Dados obrigatórios.'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND organization_id=$2',tab) INTO old USING ident,_org;
 IF _data->>'id' IS NOT NULL AND old IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  FOREACH col IN ARRAY cols LOOP
   IF NOT (_data ? col) THEN CONTINUE; END IF;
   names:=names||format(',%I',col);expr:=expr||format(',r.%I',col);changes:=changes||CASE WHEN changes='' THEN '' ELSE ',' END||format('%I=%I.%I',col,tab,col);
  END LOOP;
  IF names='' THEN RAISE EXCEPTION 'Informe os dados.'; END IF;
  -- Patch semantics: an identified record is updated with the submitted fields only, so omitted
  -- columns keep their stored value and a partial save can never blank or break NOT NULL.
  IF _data->>'id' IS NOT NULL THEN
   EXECUTE format('UPDATE public.%I SET %s,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING to_jsonb(%I)',tab,changes,tab) INTO result USING ident,_org;
  ELSE
   EXECUTE format('INSERT INTO public.%I(id,organization_id%s) SELECT $2,$3%s FROM jsonb_populate_record(NULL::public.%I,$1)r RETURNING to_jsonb(%I)',tab,names,expr,tab,tab) INTO result USING _data,ident,_org;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
 IF _kind='activity' THEN INSERT INTO crm_activity_history(organization_id,activity_id,before_value,after_value,reason) VALUES(_org,ident,old,result,coalesce(_data->>'reason','Criação')); END IF;
 PERFORM public.crm_audit(_org,_kind||'.save',ident,jsonb_build_object('before',old,'after',result));
 RETURN jsonb_build_object('id',ident);
END $$;
CREATE FUNCTION public.crm_action(_org uuid,_kind text,_id uuid,_action text,_data jsonb,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE perm text; prior public.crm_operation_keys; payload jsonb:=jsonb_build_object('kind',_kind,'id',_id,'action',_action,'data',_data);
 result jsonb; ident uuid; company uuid; contact uuid; lead public.leads; quote public.sales_quotes; opportunity public.sales_opportunities;
 stage public.sales_pipeline_stages; previous_stage jsonb; i jsonb; price jsonb; product jsonb; terms jsonb; financial jsonb;
 qnumber bigint; ver integer:=1; subtotal numeric:=0; discount numeric; total numeric; authority numeric; rep uuid; c public.companies;
BEGIN
 perm:=CASE _kind WHEN 'lead' THEN 'leads.convert' WHEN 'portfolio' THEN 'portfolios.manage' WHEN 'opportunity' THEN CASE WHEN _action='stage' THEN 'opportunities.update' ELSE 'opportunities.close' END
 WHEN 'quote' THEN CASE _action WHEN 'create' THEN 'quotes.create' WHEN 'revise' THEN 'quotes.update' WHEN 'submit' THEN 'quotes.update' WHEN 'approve' THEN 'quotes.approve' WHEN 'send' THEN 'quotes.send' WHEN 'accept' THEN 'quotes.accept' ELSE 'quotes.update' END END;
 IF perm IS NULL OR _key IS NULL THEN RAISE EXCEPTION 'Opération ou clé invalide.'; END IF;
 PERFORM public.crm_require(_org,perm);PERFORM public.inventory_lock(_org);
 SELECT * INTO prior FROM crm_operation_keys WHERE organization_id=_org AND operation_key=_key;
 IF FOUND THEN
  IF prior.payload<>payload OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Chave já utilizada com outro conteúdo ou usuário.'; END IF;
  RETURN prior.result;
 END IF;
 IF _kind='lead' AND _action='convert' THEN
  SELECT * INTO lead FROM leads WHERE organization_id=_org AND id=_id FOR UPDATE;
  IF NOT FOUND OR (public.crm_external(_org) AND lead.assigned_user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Lead não encontrado.'; END IF;
  IF lead.status='CONVERTED' THEN
   SELECT id INTO ident FROM sales_opportunities WHERE organization_id=_org AND source_type='LEAD' AND source_id=_id;
   result:=jsonb_build_object('company_id',lead.company_id,'opportunity_id',ident);
  ELSE
   IF lead.status<>'QUALIFIED' THEN RAISE EXCEPTION 'Qualifique o lead antes de converter.'; END IF;
   result:=public.crm_save(_org,'customer',_data);
   company:=(result->>'company_id')::uuid;
   SELECT id INTO contact FROM company_contacts WHERE organization_id=_org AND company_id=company AND ((lead.email IS NOT NULL AND lower(email)=lower(lead.email)) OR (lead.phone IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace(lead.phone,'[^0-9]','','g'))) ORDER BY created_at LIMIT 1;
   IF contact IS NULL THEN
    contact:=(public.crm_save(_org,'contact',jsonb_build_object('company_id',company,'name',lead.name,'email',lead.email,'phone',lead.phone,'processing_purpose',lead.processing_purpose,'marketing_opt_in',lead.marketing_opt_in))->>'id')::uuid;
   END IF;
   ident:=(public.crm_save(_org,'opportunity',jsonb_build_object('company_id',company,'primary_contact_id',contact,'title',coalesce(_data->>'title','Negociação — '||lead.name),'stage_id',_data->>'stage_id','source_type','LEAD','source_id',_id))->>'id')::uuid;
   UPDATE leads SET status='CONVERTED',company_id=company,converted_at=now(),updated_at=now() WHERE id=_id;
   result:=jsonb_build_object('company_id',company,'contact_id',contact,'opportunity_id',ident);
  END IF;
 ELSIF _kind='portfolio' AND _action='assign' THEN
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Transferência restrita à equipe interna.'; END IF;
  company:=_id;rep:=(_data->>'representative_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM customer_profiles WHERE organization_id=_org AND company_id=company) OR NOT EXISTS(SELECT 1 FROM sales_representatives WHERE organization_id=_org AND id=rep AND status='ACTIVE') THEN RAISE EXCEPTION 'Cliente ou representante inválido.'; END IF;
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo obrigatório.'; END IF;
  UPDATE customer_portfolio_assignments SET ended_at=now(),updated_at=now() WHERE organization_id=_org AND company_id=company AND ended_at IS NULL;
  INSERT INTO customer_portfolio_assignments(organization_id,company_id,representative_id,reason) VALUES(_org,company,rep,_data->>'reason') RETURNING id INTO ident;
  result:=jsonb_build_object('id',ident);
 ELSIF _kind='opportunity' THEN
  SELECT * INTO opportunity FROM sales_opportunities WHERE organization_id=_org AND id=_id FOR UPDATE;
  IF NOT FOUND OR NOT public.crm_company_access(_org,opportunity.company_id) THEN RAISE EXCEPTION 'Oportunidade não encontrada.'; END IF;
  IF opportunity.status<>'OPEN' THEN RAISE EXCEPTION 'Oportunidade encerrada.'; END IF;
  IF _action='stage' THEN
   SELECT * INTO stage FROM sales_pipeline_stages WHERE organization_id=_org AND id=(_data->>'stage_id')::uuid AND pipeline_id=opportunity.pipeline_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida para este pipeline.'; END IF;
   SELECT to_jsonb(s) INTO previous_stage FROM sales_pipeline_stages s WHERE id=opportunity.stage_id;
   UPDATE sales_opportunities SET stage_id=stage.id,probability=stage.probability,updated_at=now() WHERE id=_id;
   INSERT INTO opportunity_stage_history(organization_id,opportunity_id,previous_stage,new_stage,reason) VALUES(_org,_id,previous_stage,to_jsonb(stage),_data->>'reason');
  ELSIF _action IN ('WON','LOST','CANCELED') THEN
   IF _action='LOST' AND NOT EXISTS(SELECT 1 FROM commercial_reasons WHERE organization_id=_org AND id=(_data->>'loss_reason_id')::uuid AND kind='LOSS') THEN RAISE EXCEPTION 'Motivo da perda obrigatório.'; END IF;
   UPDATE sales_opportunities SET status=_action,closed_at=now(),updated_at=now(),loss_reason_id=nullif(_data->>'loss_reason_id','')::uuid WHERE id=_id;
  ELSE RAISE EXCEPTION 'Transição inválida.'; END IF;
  result:=jsonb_build_object('id',_id);
 ELSIF _kind='quote' THEN
  IF _action IN ('create','revise') THEN
   IF _action='revise' THEN
    SELECT * INTO quote FROM sales_quotes WHERE id=_id AND organization_id=_org FOR UPDATE;
    IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
    IF EXISTS(SELECT 1 FROM sales_quotes WHERE organization_id=_org AND quote_number=quote.quote_number AND status='ACCEPTED') THEN RAISE EXCEPTION 'Proposta já aceita.'; END IF;
    company:=quote.company_id;qnumber:=quote.quote_number;
    SELECT max(version)+1 INTO ver FROM sales_quotes WHERE organization_id=_org AND quote_number=qnumber;
    _data:=jsonb_build_object('company_id',company,'price_table_id',quote.price_table_id,'opportunity_id',quote.opportunity_id,'primary_contact_id',quote.primary_contact_id)||_data;
   ELSE
    company:=(_data->>'company_id')::uuid;
    SELECT coalesce(max(quote_number),0)+1 INTO qnumber FROM sales_quotes WHERE organization_id=_org;
   END IF;
   IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente fora da carteira.'; END IF;
   SELECT * INTO c FROM companies WHERE organization_id=_org AND id=company AND status='ACTIVE';
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM customer_profiles WHERE organization_id=_org AND company_id=company AND commercial_status='ACTIVE') THEN RAISE EXCEPTION 'Cliente inativo ou bloqueado.'; END IF;
   IF jsonb_array_length(coalesce(_data->'items','[]'))=0 THEN RAISE EXCEPTION 'Informe itens.'; END IF;
   SELECT representative_id INTO rep FROM customer_portfolio_assignments WHERE organization_id=_org AND company_id=company AND ended_at IS NULL;
   SELECT to_jsonb(p) INTO terms FROM commercial_payment_terms p JOIN customer_profiles cp ON cp.payment_terms_id=p.id WHERE cp.organization_id=_org AND cp.company_id=company;
   ident:=gen_random_uuid();discount:=coalesce((_data->>'discount_percent')::numeric,0);
   -- Totals are calculated before insertion; consolidated quote values never change.
   FOR i IN SELECT value FROM jsonb_array_elements(_data->'items') LOOP
    price:=public.pricing_resolve_table(_org,(_data->>'price_table_id')::uuid,(i->>'variant_id')::uuid,current_date);
    IF price IS NULL THEN RAISE EXCEPTION 'Preço vigente não encontrado.'; END IF;
    IF (i->>'quantity')::numeric<=0 THEN RAISE EXCEPTION 'Quantidade positiva obrigatória.'; END IF;
    subtotal:=subtotal+round((price->>'unit_price')::numeric*(i->>'quantity')::numeric,2);
   END LOOP;
   total:=subtotal-round(subtotal*discount/100,2)+coalesce((_data->>'freight')::numeric,0)+coalesce((_data->>'tax_amount')::numeric,0);
   INSERT INTO sales_quotes(id,organization_id,company_id,representative_id,opportunity_id,price_table_id,primary_contact_id,quote_number,version,valid_until,payment_terms_snapshot,company_snapshot,subtotal,discount_percent,discount_amount,freight,tax_amount,total,notes)
   VALUES(ident,_org,company,rep,nullif(_data->>'opportunity_id','')::uuid,(_data->>'price_table_id')::uuid,nullif(_data->>'primary_contact_id','')::uuid,qnumber,ver,(_data->>'valid_until')::date,coalesce(terms,'{}'),to_jsonb(c),subtotal,discount,round(subtotal*discount/100,2),coalesce((_data->>'freight')::numeric,0),coalesce((_data->>'tax_amount')::numeric,0),total,_data->>'notes');
   FOR i IN SELECT value FROM jsonb_array_elements(_data->'items') LOOP
    SELECT jsonb_build_object('sku',v.sku,'size',v.size,'color',v.color,'name',p.name) INTO product FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.organization_id=_org AND v.id=(i->>'variant_id')::uuid AND v.status='ACTIVE' AND p.status='ACTIVE';
    IF product IS NULL THEN RAISE EXCEPTION 'Variante inativa ou inválida.'; END IF;
    price:=public.pricing_resolve_table(_org,(_data->>'price_table_id')::uuid,(i->>'variant_id')::uuid,current_date);
    INSERT INTO sales_quote_items(organization_id,quote_id,variant_id,quantity,unit_price,price_snapshot,product_snapshot) VALUES(_org,ident,(i->>'variant_id')::uuid,(i->>'quantity')::numeric,(price->>'unit_price')::numeric,price,product);
   END LOOP;
   result:=jsonb_build_object('id',ident,'number',qnumber,'version',ver,'total',total);
  ELSE
   SELECT * INTO quote FROM sales_quotes WHERE organization_id=_org AND id=_id FOR UPDATE;
   IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
   IF quote.status='ACCEPTED' AND _action='accept' THEN
    result:=jsonb_build_object('id',_id,'status','ACCEPTED');
   ELSE
    IF _action IN ('approve','send','accept') AND quote.valid_until<current_date THEN RAISE EXCEPTION 'Proposta vencida.'; END IF;
    CASE _action
    WHEN 'submit' THEN
     IF quote.status<>'DRAFT' THEN RAISE EXCEPTION 'Submissão apenas do rascunho.'; END IF;
     UPDATE sales_quotes SET status='PENDING_APPROVAL',updated_at=now() WHERE id=_id;
    WHEN 'approve' THEN
     IF quote.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Aprovação exige proposta pendente.'; END IF;
     SELECT max_discount_percent INTO authority FROM commercial_discount_authorities WHERE organization_id=_org AND user_id=auth.uid();
     IF authority IS NULL OR quote.discount_percent>authority THEN RAISE EXCEPTION 'Desconto excede a alçada configurada.'; END IF;
     IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo da aprovação obrigatório.'; END IF;
     financial:=public.crm_financial_position(_org,quote.company_id);
     IF ((financial->>'block_overdue')::boolean AND (financial->>'overdue_amount')::numeric>0) OR
      ((financial->>'block_over_limit')::boolean AND financial->>'credit_limit' IS NOT NULL AND (financial->>'open_amount')::numeric+quote.total>(financial->>'credit_limit')::numeric) THEN RAISE EXCEPTION 'Política comercial bloqueia aprovação. Consulte responsável financeiro.'; END IF;
     UPDATE sales_quotes SET status='APPROVED',approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=_id;
     INSERT INTO quote_approvals(organization_id,quote_id,decision,reason,values_snapshot) VALUES(_org,_id,'APPROVED',_data->>'reason',jsonb_build_object('total',quote.total,'discount_percent',quote.discount_percent,'authority',authority));
    WHEN 'send' THEN
     IF quote.status<>'APPROVED' THEN RAISE EXCEPTION 'Apenas proposta aprovada pode ser marcada enviada.'; END IF;
     UPDATE sales_quotes SET status='SENT',sent_at=now(),updated_at=now() WHERE id=_id;
    WHEN 'accept' THEN
     IF quote.status<>'SENT' THEN RAISE EXCEPTION 'Aceite exige proposta enviada.'; END IF;
     IF EXISTS(SELECT 1 FROM sales_quotes WHERE organization_id=_org AND quote_number=quote.quote_number AND status='ACCEPTED') THEN RAISE EXCEPTION 'Outra versão já aceita.'; END IF;
     contact:=nullif(_data->>'contact_id','')::uuid;
     IF NOT EXISTS(SELECT 1 FROM company_contacts WHERE organization_id=_org AND company_id=quote.company_id AND id=contact AND status='ACTIVE') THEN RAISE EXCEPTION 'Contato do aceite obrigatório.'; END IF;
     UPDATE sales_quotes SET status='ACCEPTED',accepted_at=now(),accepted_by=auth.uid(),acceptance_contact_id=contact,acceptance_evidence=_data->>'evidence',updated_at=now() WHERE id=_id;
     INSERT INTO domain_events(organization_id,event_type,event_source,event_key,payload)
     VALUES(_org,'SALES_QUOTE_ACCEPTED','CRM','sales_quote_accepted:'||_id,jsonb_build_object('quote_id',_id,'version',quote.version,'company_id',quote.company_id,'total',quote.total,'currency','BRL','schema_version',1))
     ON CONFLICT(organization_id,event_key) DO NOTHING;
    WHEN 'reject' THEN
     IF quote.status<>'SENT' THEN RAISE EXCEPTION 'Rejeição exige proposta enviada.'; END IF;
     UPDATE sales_quotes SET status='REJECTED',updated_at=now() WHERE id=_id;
    WHEN 'cancel' THEN
     IF quote.status IN ('ACCEPTED','CANCELED') THEN RAISE EXCEPTION 'Cancelamento inválido.'; END IF;
     UPDATE sales_quotes SET status='CANCELED',updated_at=now() WHERE id=_id;
    ELSE RAISE EXCEPTION 'Transição inválida.';
    END CASE;
    SELECT jsonb_build_object('id',id,'status',status) INTO result FROM sales_quotes WHERE id=_id;
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Operação inválida.';
 END IF;
 INSERT INTO crm_operation_keys(organization_id,operation_key,operation,payload,result) VALUES(_org,_key,_kind||'.'||_action,payload,result);
 PERFORM public.crm_audit(_org,_kind||'.'||_action,coalesce(_id,(result->>'id')::uuid),jsonb_build_object('request',payload,'result',result));
 RETURN result;
END $$;
CREATE FUNCTION public.crm_visible(_org uuid,_table text,_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid:=nullif(_row->>'company_id','')::uuid; parent jsonb;
BEGIN
 IF NOT public.is_org_member(_org) THEN RETURN false; END IF;
 IF NOT public.crm_external(_org) THEN RETURN true; END IF;
 IF _table='companies' THEN RETURN public.crm_company_access(_org,(_row->>'id')::uuid); END IF;
 IF _table='leads' THEN RETURN _row->>'assigned_user_id'=auth.uid()::text; END IF;
 IF _table='crm_activities' THEN RETURN _row->>'assigned_user_id'=auth.uid()::text AND (company IS NULL OR public.crm_company_access(_org,company)); END IF;
 IF _table IN ('opportunity_items','opportunity_stage_history') THEN SELECT company_id INTO company FROM sales_opportunities WHERE organization_id=_org AND id=(_row->>'opportunity_id')::uuid; END IF;
 IF _table IN ('sales_quote_items','quote_approvals') THEN SELECT company_id INTO company FROM sales_quotes WHERE organization_id=_org AND id=(_row->>'quote_id')::uuid; END IF;
 IF _table='crm_activity_history' THEN SELECT to_jsonb(a) INTO parent FROM crm_activities a WHERE organization_id=_org AND id=(_row->>'activity_id')::uuid; RETURN public.crm_visible(_org,'crm_activities',parent); END IF;
 IF company IS NOT NULL THEN RETURN public.crm_company_access(_org,company); END IF;
 RETURN _table IN ('commercial_sources','commercial_segments','commercial_tags','sales_territories','commercial_payment_terms','sales_pipelines','sales_pipeline_stages','commercial_reasons','product_variants','price_tables');
END $$;
CREATE FUNCTION public.crm_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1,_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; perm text; scope text; result jsonb; cnt integer; offst integer:=greatest(0,_page-1)*50; company uuid:=nullif(_filters->>'company_id','')::uuid; ident uuid:=nullif(_filters->>'id','')::uuid; p jsonb; cost numeric; sumcost numeric; quote public.sales_quotes;
BEGIN
 PERFORM public.crm_require(_org,'crm.read');
 IF _export THEN PERFORM public.crm_require(_org,'crm.export'); END IF;
 IF _page<1 OR _page>100000 THEN RAISE EXCEPTION 'Página inválida.'; END IF;
 IF _kind='finance' THEN
  PERFORM public.crm_require(_org,'commercial_sensitive.read');PERFORM public.crm_require(_org,'receivables.read');
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa não autorizada.'; END IF;
  RETURN public.crm_financial_position(_org,company);
 ELSIF _kind='margin' THEN
  PERFORM public.crm_require(_org,'commercial_sensitive.read');PERFORM public.crm_require(_org,'costs.read');
  SELECT * INTO quote FROM sales_quotes WHERE id=ident AND organization_id=_org;
  IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não autorizada.'; END IF;
  SELECT sum(i.quantity*c.total_unit_cost),count(*) FILTER(WHERE c.id IS NULL) INTO sumcost,cnt FROM sales_quote_items i LEFT JOIN LATERAL(
   SELECT id,total_unit_cost FROM product_cost_versions WHERE organization_id=_org AND variant_id=i.variant_id AND status IN ('ACTIVE','SUPERSEDED') AND effective_from<=quote.issue_date AND (effective_to IS NULL OR effective_to>quote.issue_date) ORDER BY effective_from DESC LIMIT 1)c ON true WHERE i.quote_id=ident;
  RETURN jsonb_build_object('status',CASE WHEN cnt>0 THEN 'INCOMPLETE' ELSE 'ESTIMATE' END,'cost',CASE WHEN cnt=0 THEN sumcost END,'gross_margin',CASE WHEN cnt=0 THEN quote.subtotal-quote.discount_amount-sumcost END,'historical_cogs',false);
 ELSIF _kind='stock' THEN
  PERFORM public.crm_require(_org,'inventory.read');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.type,'on_hand',public.inventory_get_balance(_org,ident,l.id,NULL))),'[]') INTO result FROM inventory_locations l WHERE organization_id=_org AND status='ACTIVE';
  RETURN jsonb_build_object('rows',result,'reserved','NOT_IMPLEMENTED','promise_of_delivery',false);
 ELSIF _kind='commission' THEN
  PERFORM public.crm_require(_org,'commercial_sensitive.read');
  SELECT * INTO quote FROM sales_quotes WHERE id=ident AND organization_id=_org;
  IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não autorizada.'; END IF;
  SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM (
   SELECT r.id,pl.name,pl.trigger_event,sum(CASE r.rate_type WHEN 'PERCENT' THEN i.total*(1-quote.discount_percent/100)*r.rate/100 ELSE i.quantity*r.rate END) estimated_commission
   FROM commission_rules r JOIN commission_plans pl ON pl.id=r.plan_id JOIN sales_quote_items i ON i.quote_id=quote.id AND (r.variant_id IS NULL OR r.variant_id=i.variant_id)
   WHERE r.organization_id=_org AND pl.status='ACTIVE' AND (r.company_id IS NULL OR r.company_id=quote.company_id) AND (r.representative_id IS NULL OR r.representative_id=quote.representative_id)
    AND r.effective_from<=quote.issue_date AND (r.effective_to IS NULL OR r.effective_to>=quote.issue_date) GROUP BY r.id,pl.name,pl.trigger_event)x;
  RETURN jsonb_build_object('rows',result,'method','INDEPENDENT_RULE_SCENARIOS_NOT_ADDITIVE','payable',false);
 ELSIF _kind='dashboard' THEN
  PERFORM public.crm_require(_org,'crm.dashboard');
  SELECT jsonb_build_object('leads',count(*),'qualified',count(*)FILTER(WHERE status='QUALIFIED'),'converted',count(*)FILTER(WHERE status='CONVERTED'),
   'conversion_percent',round(100.0*count(*)FILTER(WHERE status='CONVERTED')/nullif(count(*)FILTER(WHERE status<>'ARCHIVED'),0),2))
  INTO result FROM leads l WHERE organization_id=_org AND public.crm_visible(_org,'leads',to_jsonb(l))
   AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1)
   AND (_filters->>'assigned_user_id' IS NULL OR assigned_user_id=(_filters->>'assigned_user_id')::uuid);
  SELECT result||jsonb_build_object('open_opportunities',count(*),'estimated_value',coalesce(sum(estimated_value),0),'weighted_estimate',coalesce(sum(estimated_value*probability/100),0)) INTO result
   FROM sales_opportunities o WHERE organization_id=_org AND status='OPEN' AND public.crm_visible(_org,'sales_opportunities',to_jsonb(o))
    AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1);
  SELECT result||jsonb_build_object('sent',count(*)FILTER(WHERE sent_at IS NOT NULL),'accepted',count(*)FILTER(WHERE status='ACCEPTED'),
   'acceptance_percent',round(100.0*count(*)FILTER(WHERE status='ACCEPTED')/nullif(count(*)FILTER(WHERE status IN ('ACCEPTED','REJECTED')),0),2)) INTO result FROM sales_quotes q
   WHERE organization_id=_org AND public.crm_visible(_org,'sales_quotes',to_jsonb(q)) AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1);
  SELECT result||jsonb_build_object('pending_activities',count(*),'overdue_activities',count(*)FILTER(WHERE scheduled_at<now())) INTO result FROM crm_activities a WHERE organization_id=_org AND status='PENDING' AND public.crm_visible(_org,'crm_activities',to_jsonb(a));
  RETURN result;
 END IF;
 CASE _kind
 WHEN 'customers' THEN tab:='customer_profiles';perm:='customers.read';
 WHEN 'companies' THEN tab:='companies';perm:='customers.read';
 WHEN 'contacts' THEN tab:='company_contacts';perm:='customers.read';
 WHEN 'leads' THEN tab:='leads';perm:='leads.read';
 WHEN 'opportunities' THEN tab:='sales_opportunities';perm:='opportunities.read';
 WHEN 'opportunity_items' THEN tab:='opportunity_items';perm:='opportunities.read';
 WHEN 'stage_history' THEN tab:='opportunity_stage_history';perm:='opportunities.read';
 WHEN 'quotes' THEN tab:='sales_quotes';perm:='quotes.read';
 WHEN 'quote_items' THEN tab:='sales_quote_items';perm:='quotes.read';
 WHEN 'approvals' THEN tab:='quote_approvals';perm:='quotes.read';
 WHEN 'activities' THEN tab:='crm_activities';perm:='activities.read';
 WHEN 'activity_history' THEN tab:='crm_activity_history';perm:='activities.read';
 WHEN 'representatives' THEN tab:='sales_representatives';perm:='representatives.read';
 WHEN 'portfolios' THEN tab:='customer_portfolio_assignments';perm:='customers.read';
 WHEN 'segments' THEN tab:='commercial_segments';perm:='crm.read';
 WHEN 'sources' THEN tab:='commercial_sources';perm:='crm.read';
 WHEN 'reasons' THEN tab:='commercial_reasons';perm:='crm.read';
 WHEN 'tags' THEN tab:='commercial_tags';perm:='customers.read';
 WHEN 'customer_tags' THEN tab:='customer_tags';perm:='customers.read';
 WHEN 'territories' THEN tab:='sales_territories';perm:='representatives.read';
 WHEN 'payment_terms' THEN tab:='commercial_payment_terms';perm:='crm.read';
 WHEN 'pipelines' THEN tab:='sales_pipelines';perm:='opportunities.read';
 WHEN 'stages' THEN tab:='sales_pipeline_stages';perm:='opportunities.read';
 WHEN 'authorities' THEN tab:='commercial_discount_authorities';perm:='commercial_sensitive.read';
 WHEN 'commission_plans' THEN tab:='commission_plans';perm:='commercial_sensitive.read';
 WHEN 'commission_rules' THEN tab:='commission_rules';perm:='commercial_sensitive.read';
 WHEN 'variants' THEN tab:='product_variants';perm:='products.read';
 WHEN 'price_tables' THEN tab:='price_tables';perm:='pricing.read';
 WHEN 'merge_requests' THEN tab:='company_merge_requests';perm:='customers.merge';
 ELSE RAISE EXCEPTION 'Consulta desconhecida.';
 END CASE;
 PERFORM public.crm_require(_org,perm);
 scope:='organization_id=$1 AND public.crm_visible($1,'||quote_literal(tab)||',to_jsonb(t))';
 IF ident IS NOT NULL THEN scope:=scope||' AND id='||quote_literal(ident)||'::uuid'; END IF;
 -- Filter only whitelisted JSON keys; field absence cannot accidentally match.
 FOR p IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each_text(_filters) WHERE key IN ('company_id','status','representative_id','commercial_segment_id','acquisition_source_id','opportunity_id','quote_id','pipeline_id','activity_id','assigned_user_id') LOOP
  scope:=scope||format(' AND to_jsonb(t)->>%L=%L',p->>'key',p->>'value');
 END LOOP;
 IF nullif(_filters->>'q','') IS NOT NULL THEN scope:=scope||format(' AND (coalesce(to_jsonb(t)->>''name'','''')||'' ''||coalesce(to_jsonb(t)->>''title'','''')||'' ''||coalesce(to_jsonb(t)->>''legal_name'','''')||'' ''||coalesce(to_jsonb(t)->>''company_name'','''')||'' ''||coalesce(to_jsonb(t)->>''sku'','''')||'' ''||coalesce(to_jsonb(t)->>''email'','''')||'' ''||coalesce(to_jsonb(t)->>''document_number'','''')) ILIKE %L','%'||(_filters->>'q')||'%'); END IF;
 IF _filters->>'from' IS NOT NULL THEN scope:=scope||format(' AND created_at>=%L::date',_filters->>'from'); END IF;
 IF _filters->>'to' IS NOT NULL THEN scope:=scope||format(' AND created_at<%L::date+1',_filters->>'to'); END IF;
 EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s',tab,scope) INTO cnt USING _org;
 EXECUTE format('SELECT coalesce(jsonb_agg(x),''[]'') FROM (SELECT t.* FROM public.%I t WHERE %s ORDER BY created_at DESC,id LIMIT 50 OFFSET %s)x',tab,scope,offst) INTO result USING _org;
 RETURN jsonb_build_object('rows',result,'total',cnt);
END $$;
-- Only RPCs and boolean RLS helpers may be invoked by authenticated users.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'crm_%' OR proname='pricing_resolve_table') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname IN ('crm_save','crm_action','crm_query','crm_company_access','crm_external') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
COMMIT;
