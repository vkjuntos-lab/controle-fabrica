/**
 * Configuração declarativa das áreas do CRM (MASTER 012).
 *
 * Cada área descreve o `kind` lido por `crm_query`, o `kind` gravado por
 * `crm_save`, as permissões de leitura/escrita e os campos do formulário. As
 * telas são geradas a partir daqui, então adicionar um campo comercial é uma
 * alteração de dados — não de markup.
 *
 * Segmentos, origens, motivos, etiquetas, territórios, condições de pagamento,
 * pipelines, etapas, alçadas e planos de comissão ficam em `configurations`
 * porque são cadastros da própria organização, nunca dados de uma empresa.
 */

export type FieldType =
  "text" | "email" | "number" | "date" | "datetime-local" | "options" | "lookup" | "longtext";

export type Field = {
  key: string;
  label: string;
  type?: FieldType;
  /** Opções fixas quando `type === "options"`. */
  options?: string[];
  /** `kind` consultado em `crm_query` quando `type === "lookup"`. */
  lookup?: string;
  required?: boolean;
  /** Campo carregado junto para o formulário (ex.: nome da empresa escolhida). */
  hint?: string;
};

export type Area = {
  title: string;
  /** `kind` enviado para `crm_query`. */
  query: string;
  /** `kind` enviado para `crm_save`; ausente quando o cadastro é só leitura. */
  save?: string;
  permission: string;
  /** Permissão necessária para gravar; o servidor exige a mesma chave. */
  write?: string;
  fields: Field[];
  /** Colunas exibidas na listagem, na ordem desejada. */
  columns: string[];
  /** `kind` de `crm_query` usado como options em filtros. */
  filters?: { key: string; label: string; kind: string; permission: string }[];
  /**
   * Gravação em mais de um `crm_save`. O cliente comercial é o caso real: o
   * vínculo empresa↔perfil e os atributos do perfil são tabelas diferentes, e o
   * servidor trata as duas com permissões e efeitos colaterais próprios.
   */
  saves?: SaveStep[];
  /** Campos que não podem mudar depois de criados (ver `saves`). */
  immutableOnEdit?: string[];
  /** Colunas de chave estrangeira e o `kind` usado para mostrar o nome. */
  refColumns?: Record<string, string>;
};

export type SaveStep = {
  /** `kind` enviado para `crm_save`. */
  kind: string;
  /** Campos do formulário pertencentes a este passo. */
  fields: string[];
  /**
   * Usa como `id` o registro devolvido pelo passo anterior. Necessário quando o
   * id do perfil só existe depois da criação do vínculo.
   */
  usePreviousId?: boolean;
  /** Executa apenas quando o registro já existe. */
  onlyExisting?: boolean;
};

const field = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  ...extra,
});

const companyField = field("company_id", "Empresa", {
  lookup: "companies",
  required: true,
  hint: "legal_name",
});
const nameField = field("name", "Nome", { required: true });

/** Áreas operacionais do funil comercial. */
export const areas: Record<string, Area> = {
  leads: {
    title: "Leads",
    query: "leads",
    save: "lead",
    permission: "leads.read",
    write: "leads.create",
    fields: [
      nameField,
      field("company_name", "Empresa informada"),
      field("email", "E-mail", { type: "email" }),
      field("phone", "Telefone"),
      field("acquisition_source_id", "Origem", { lookup: "sources" }),
      field("commercial_segment_id", "Segmento", { lookup: "segments" }),
      field("status", "Status", {
        type: "options",
        options: ["NEW", "CONTACT_ATTEMPTED", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "ARCHIVED"],
      }),
      field("disqualification_reason_id", "Motivo de desqualificação", { lookup: "reasons" }),
      field("processing_purpose", "Finalidade do tratamento", { type: "longtext" }),
      field("notes", "Observações", { type: "longtext" }),
    ],
    columns: ["name", "company_name", "email", "status", "created_at"],
    filters: [
      { key: "status", label: "Status", kind: "", permission: "leads.read" },
      { key: "acquisition_source_id", label: "Origem", kind: "sources", permission: "crm.read" },
      { key: "assigned_user_id", label: "Responsável", kind: "", permission: "leads.read" },
    ],
  },
  clientes: {
    title: "Clientes",
    query: "customers",
    permission: "customers.read",
    write: "customers.create",
    // `crm_save('customer')` vincula a empresa ao perfil e grava o código
    // comercial; `crm_save('customer_profile')` grava os atributos e exige o id
    // do perfil, que só existe depois do primeiro passo. Trocar a empresa criaria
    // um segundo perfil e deixaria este órfão, então o vínculo é imutável.
    saves: [
      { kind: "customer", fields: ["company_id", "customer_code"] },
      {
        kind: "customer_profile",
        fields: [
          "customer_type",
          "commercial_status",
          "commercial_segment_id",
          "acquisition_source_id",
          "price_table_id",
          "payment_terms_id",
          "notes",
        ],
        usePreviousId: true,
      },
    ],
    immutableOnEdit: ["company_id"],
    fields: [
      companyField,
      field("customer_code", "Código comercial"),
      field("customer_type", "Tipo"),
      field("commercial_status", "Status comercial", {
        type: "options",
        options: ["ACTIVE", "INACTIVE", "BLOCKED"],
      }),
      field("commercial_segment_id", "Segmento", { lookup: "segments" }),
      field("acquisition_source_id", "Origem", { lookup: "sources" }),
      field("price_table_id", "Tabela de preços", { lookup: "price_tables" }),
      field("payment_terms_id", "Condição de pagamento", { lookup: "payment_terms" }),
      field("notes", "Observações comerciais", { type: "longtext" }),
    ],
    columns: ["customer_code", "company_id", "commercial_status", "commercial_segment_id"],
    refColumns: { company_id: "companies" },
    filters: [
      {
        key: "representative_id",
        label: "Representante",
        kind: "representatives",
        permission: "representatives.read",
      },
      { key: "tag_id", label: "Etiqueta", kind: "tags", permission: "customers.read" },
      {
        key: "territory_id",
        label: "Território",
        kind: "territories",
        permission: "representatives.read",
      },
      { key: "status", label: "Status", kind: "", permission: "customers.read" },
      {
        key: "commercial_segment_id",
        label: "Segmento",
        kind: "segments",
        permission: "crm.read",
      },
      { key: "acquisition_source_id", label: "Origem", kind: "sources", permission: "crm.read" },
    ],
  },
  oportunidades: {
    title: "Oportunidades",
    query: "opportunities",
    save: "opportunity",
    permission: "opportunities.read",
    write: "opportunities.create",
    fields: [
      companyField,
      field("title", "Título", { required: true }),
      field("stage_id", "Etapa", { lookup: "stages", required: true }),
      field("primary_contact_id", "Contato principal", { lookup: "contacts" }),
      field("expected_close_date", "Previsão de fechamento", { type: "date" }),
      field("description", "Descrição", { type: "longtext" }),
    ],
    columns: [
      "title",
      "company_id",
      "representative_id",
      "estimated_value",
      "probability",
      "status",
      "expected_close_date",
    ],
    refColumns: { company_id: "companies", representative_id: "representatives" },
    filters: [
      { key: "status", label: "Status", kind: "", permission: "opportunities.read" },
      {
        key: "representative_id",
        label: "Representante",
        kind: "representatives",
        permission: "representatives.read",
      },
    ],
  },
  propostas: {
    title: "Propostas",
    query: "quotes",
    permission: "quotes.read",
    write: "quotes.create",
    fields: [
      companyField,
      field("price_table_id", "Tabela de preços vigente", {
        lookup: "price_tables",
        required: true,
      }),
      field("primary_contact_id", "Contato", { lookup: "contacts" }),
      field("opportunity_id", "Oportunidade", { lookup: "opportunities" }),
      field("valid_until", "Validade", { type: "date", required: true }),
      field("discount_percent", "Desconto %", { type: "number" }),
      field("freight", "Frete estimado (R$)", { type: "number" }),
      field("tax_amount", "Tributos informados (R$)", { type: "number" }),
      field("notes", "Observações", { type: "longtext" }),
    ],
    columns: ["quote_number", "version", "company_id", "total", "status", "valid_until"],
    refColumns: { company_id: "companies", representative_id: "representatives" },
    filters: [
      { key: "status", label: "Status", kind: "", permission: "quotes.read" },
      {
        key: "representative_id",
        label: "Representante",
        kind: "representatives",
        permission: "representatives.read",
      },
    ],
  },
  atividades: {
    title: "Atividades",
    query: "activities",
    save: "activity",
    permission: "activities.read",
    write: "activities.manage",
    fields: [
      field("company_id", "Empresa", { lookup: "companies" }),
      field("lead_id", "Lead", { lookup: "leads" }),
      field("opportunity_id", "Oportunidade", { lookup: "opportunities" }),
      field("subject", "Assunto", { required: true }),
      field("activity_type", "Tipo", {
        type: "options",
        options: [
          "CALL",
          "MEETING",
          "EMAIL",
          "WHATSAPP",
          "VISIT",
          "TASK",
          "FOLLOW_UP",
          "NOTE",
          "OTHER",
        ],
        required: true,
      }),
      field("scheduled_at", "Agendamento", { type: "datetime-local", required: true }),
      field("description", "Descrição", { type: "longtext" }),
      field("status", "Status", { type: "options", options: ["PENDING", "COMPLETED", "CANCELED"] }),
      field("outcome", "Resultado", { type: "longtext" }),
      field("reason", "Motivo da alteração", { type: "longtext" }),
    ],
    columns: ["subject", "activity_type", "company_id", "scheduled_at", "status"],
    refColumns: { company_id: "companies", lead_id: "leads", opportunity_id: "opportunities" },
    filters: [
      { key: "status", label: "Status", kind: "", permission: "activities.read" },
      { key: "assigned_user_id", label: "Responsável", kind: "", permission: "activities.read" },
    ],
  },
  representantes: {
    title: "Representantes",
    query: "representatives",
    save: "representative",
    permission: "representatives.read",
    write: "representatives.manage",
    fields: [
      nameField,
      field("representative_code", "Código", { required: true }),
      field("representative_type", "Tipo", {
        type: "options",
        options: ["INTERNAL", "EXTERNAL", "COMPANY"],
        required: true,
      }),
      field("company_id", "Empresa de representação", { lookup: "companies" }),
      field("user_id", "Usuário vinculado (opcional)", { lookup: "members" }),
      field("assigned_manager_id", "Gestor responsável", { lookup: "members" }),
      field("status", "Status", { type: "options", options: ["ACTIVE", "INACTIVE"] }),
    ],
    columns: ["name", "representative_code", "representative_type", "status"],
    refColumns: { company_id: "companies", user_id: "members" },
  },
  carteiras: {
    title: "Carteiras",
    query: "portfolios",
    permission: "customers.read",
    write: "portfolios.manage",
    fields: [
      field("company_id", "Cliente", { lookup: "companies", required: true }),
      field("representative_id", "Representante", {
        lookup: "representatives",
        required: true,
      }),
      field("reason", "Motivo da atribuição", { required: true }),
    ],
    columns: ["company_id", "representative_id", "started_at", "ended_at"],
    refColumns: { company_id: "companies", representative_id: "representatives" },
  },
};

/** Cadastros da própria organização, configuráveis por `crm.configure`. */
export const configurations: Record<string, Area> = {
  credito: {
    title: "Políticas de crédito",
    query: "credit_policies",
    save: "credit",
    permission: "commercial_sensitive.read",
    write: "crm.configure",
    fields: [
      companyField,
      field("credit_limit", "Limite de crédito (R$)", { type: "number" }),
      field("block_over_limit", "Bloquear acima do limite", {
        type: "options",
        options: ["true", "false"],
      }),
      field("block_overdue", "Bloquear com vencidos", {
        type: "options",
        options: ["true", "false"],
      }),
      field("reason", "Motivo", { required: true }),
    ],
    columns: ["company_id", "credit_limit", "block_over_limit", "block_overdue"],
    refColumns: { company_id: "companies" },
    immutableOnEdit: ["company_id"],
  },
  segmentos: {
    title: "Segmentos",
    query: "segments",
    save: "segment",
    permission: "crm.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("status", "Status", { type: "options", options: ["ACTIVE", "INACTIVE"] }),
    ],
    columns: ["name", "status"],
  },
  origens: {
    title: "Origens",
    query: "sources",
    save: "source",
    permission: "crm.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("status", "Status", { type: "options", options: ["ACTIVE", "INACTIVE"] }),
    ],
    columns: ["name", "status"],
  },
  motivos: {
    title: "Motivos",
    query: "reasons",
    save: "reason",
    permission: "crm.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("kind", "Finalidade", { type: "options", options: ["LEAD", "LOSS"], required: true }),
    ],
    columns: ["name", "kind"],
  },
  etiquetas: {
    title: "Etiquetas",
    query: "tags",
    save: "tag",
    permission: "customers.read",
    write: "crm.configure",
    fields: [nameField],
    columns: ["name"],
  },
  territorios: {
    title: "Territórios",
    query: "territories",
    save: "territory",
    permission: "representatives.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("region", "Região"),
      field("state", "UF"),
      field("city", "Cidade"),
      field("segment_id", "Segmento", { lookup: "segments" }),
    ],
    columns: ["name", "region", "state", "city"],
  },
  condicoes: {
    title: "Condições de pagamento",
    query: "payment_terms",
    save: "payment_terms",
    permission: "crm.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("description", "Condições acordadas", { required: true }),
      field("status", "Status", { type: "options", options: ["ACTIVE", "INACTIVE"] }),
    ],
    columns: ["name", "description", "status"],
  },
  pipelines: {
    title: "Pipelines",
    query: "pipelines",
    save: "pipeline",
    permission: "opportunities.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("status", "Status", { type: "options", options: ["ACTIVE", "INACTIVE"] }),
    ],
    columns: ["name", "status"],
  },
  etapas: {
    title: "Etapas",
    query: "stages",
    save: "stage",
    permission: "opportunities.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("pipeline_id", "Pipeline", { lookup: "pipelines", required: true }),
      field("position", "Ordem", { type: "number", required: true }),
      field("probability", "Probabilidade %", { type: "number", required: true }),
    ],
    columns: ["name", "pipeline_id", "position", "probability"],
    refColumns: { pipeline_id: "pipelines" },
  },
  alcadas: {
    title: "Alçadas de desconto",
    query: "authorities",
    save: "discount_authority",
    permission: "commercial_sensitive.read",
    write: "crm.configure",
    fields: [
      field("user_id", "Aprovador", { lookup: "members", required: true }),
      field("max_discount_percent", "Desconto máximo %", { type: "number", required: true }),
      field("reason", "Motivo", { required: true }),
    ],
    columns: ["user_id", "max_discount_percent"],
    refColumns: { user_id: "members" },
  },
  comissoes: {
    title: "Planos de comissão",
    query: "commission_plans",
    save: "commission_plan",
    permission: "commercial_sensitive.read",
    write: "crm.configure",
    fields: [
      nameField,
      field("trigger_event", "Fato gerador futuro", {
        type: "options",
        options: ["SALE_CONFIRMED", "RECEIPT_CONFIRMED"],
        required: true,
      }),
      field("status", "Status", { type: "options", options: ["ACTIVE", "INACTIVE"] }),
    ],
    columns: ["name", "trigger_event", "status"],
  },
  regras: {
    title: "Regras de comissão estimada",
    query: "commission_rules",
    save: "commission_rule",
    permission: "commercial_sensitive.read",
    write: "crm.configure",
    fields: [
      field("plan_id", "Plano", { lookup: "commission_plans", required: true }),
      field("representative_id", "Representante", { lookup: "representatives" }),
      field("company_id", "Cliente", { lookup: "companies" }),
      field("variant_id", "Variante", { lookup: "variants" }),
      field("rate_type", "Método", {
        type: "options",
        options: ["PERCENT", "FIXED_PER_UNIT"],
        required: true,
      }),
      field("rate", "Taxa ou valor", { type: "number", required: true }),
      field("effective_from", "Vigência inicial", { type: "date", required: true }),
      field("effective_to", "Vigência final", { type: "date" }),
    ],
    columns: [
      "plan_id",
      "representative_id",
      "rate_type",
      "rate",
      "effective_from",
      "effective_to",
    ],
    refColumns: {
      plan_id: "commission_plans",
      representative_id: "representatives",
      company_id: "companies",
      variant_id: "variants",
    },
  },
};

/** Rótulos de todos os campos declarados, para colunas e filtros. */
export const labels: Record<string, string> = Object.fromEntries(
  [...Object.values(areas), ...Object.values(configurations)].flatMap((area) =>
    area.fields.map((item) => [item.key, item.label]),
  ),
);

Object.assign(labels, {
  company_id: "Empresa",
  customer_code: "Código",
  commercial_status: "Status comercial",
  commercial_segment_id: "Segmento",
  acquisition_source_id: "Origem",
  estimated_value: "Valor estimado",
  quote_number: "Número",
  version: "Versão",
  total: "Total",
  representative_id: "Representante",
  representative_code: "Código do representante",
  representative_type: "Tipo de representante",
  pipeline_id: "Pipeline",
  stage_id: "Etapa",
  expected_close_date: "Fechamento previsto",
  valid_until: "Válida até",
  discount_percent: "Desconto %",
  discount_amount: "Desconto",
  freight: "Frete",
  tax_amount: "Tributos",
  probability: "Probabilidade %",
  subject: "Assunto",
  activity_type: "Tipo",
  scheduled_at: "Agendamento",
  completed_at: "Concluída em",
  opportunity_id: "Oportunidade",
  lead_id: "Lead",
  started_at: "Início",
  ended_at: "Fim",
  price_table_id: "Tabela de preços",
  payment_terms_id: "Condição de pagamento",
  created_at: "Registro em",
  updated_at: "Alterado em",
});

/** Telas do módulo, na ordem do menu Comercial. */
export const areaOrder = [
  "leads",
  "clientes",
  "oportunidades",
  "propostas",
  "atividades",
  "representantes",
  "carteiras",
] as const;

export const configurationOrder = [
  "credito",
  "segmentos",
  "origens",
  "motivos",
  "etiquetas",
  "territorios",
  "condicoes",
  "pipelines",
  "etapas",
  "alcadas",
  "comissoes",
  "regras",
] as const;

export type AreaKey = (typeof areaOrder)[number];
export type ConfigurationKey = (typeof configurationOrder)[number];
