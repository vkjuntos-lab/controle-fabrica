/**
 * Rótulos e listas do CRM (MASTER 012).
 *
 * O banco guarda apenas códigos; toda tradução para português do Brasil vive
 * aqui, seguindo o mesmo padrão de `lib/finance/constants.ts` e
 * `lib/inventory/constants.ts`.
 */

export const LEAD_STATUS: Record<string, string> = {
  NEW: "Novo",
  CONTACT_ATTEMPTED: "Contato tentado",
  CONTACTED: "Contatado",
  QUALIFIED: "Qualificado",
  UNQUALIFIED: "Desqualificado",
  CONVERTED: "Convertido",
  ARCHIVED: "Arquivado",
};

/** Etapas em que o lead ainda pode ser qualificado e convertido. */
export const LEAD_ELIGIBLE_STATUS = ["NEW", "CONTACT_ATTEMPTED", "CONTACTED", "QUALIFIED"] as const;

export const OPPORTUNITY_STATUS: Record<string, string> = {
  OPEN: "Em aberto",
  WON: "Ganha",
  LOST: "Perdida",
  CANCELED: "Cancelada",
};

/** Apenas oportunidades em aberto entram no pipeline e na previsão. */
export const OPEN_OPPORTUNITY_STATUS = ["OPEN"] as const;

export const QUOTE_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  SENT: "Enviada",
  ACCEPTED: "Aceita",
  REJECTED: "Rejeitada",
  EXPIRED: "Vencida",
  CANCELED: "Cancelada",
};

/** Transições que o servidor aceita; qualquer outra é recusada. */
export const QUOTE_FLOW: Record<string, string[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED"],
  APPROVED: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED"],
};

export const ACTIVITY_TYPE: Record<string, string> = {
  CALL: "Ligação",
  MEETING: "Reunião",
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  VISIT: "Visita",
  TASK: "Tarefa",
  FOLLOW_UP: "Retomada",
  NOTE: "Anotação",
  OTHER: "Outra",
};

export const ACTIVITY_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  COMPLETED: "Concluída",
  CANCELED: "Cancelada",
};

export const COMMERCIAL_STATUS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
};

export const REPRESENTATIVE_TYPE: Record<string, string> = {
  INTERNAL: "Funcionário interno",
  EXTERNAL: "Representante externo",
  COMPANY: "Empresa de representação",
};

export const REASON_KIND: Record<string, string> = {
  LEAD: "Desqualificação de lead",
  LOSS: "Perda de oportunidade",
};

export const COMMISSION_TRIGGER: Record<string, string> = {
  SALE_CONFIRMED: "Venda confirmada (MASTER 013)",
  RECEIPT_CONFIRMED: "Recebimento confirmado (MASTER 013)",
};

export const COMMISSION_RATE_TYPE: Record<string, string> = {
  PERCENT: "Percentual sobre o valor",
  FIXED_PER_UNIT: "Valor fixo por unidade",
};

export const CHANNEL_TYPE: Record<string, string> = {
  PHONE: "Telefone",
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  PREFERRED: "Canal preferido do contato",
};

export const leadStatusLabel = (status: string | null | undefined) =>
  status ? (LEAD_STATUS[status] ?? status) : "—";

export const opportunityStatusLabel = (status: string | null | undefined) =>
  status ? (OPPORTUNITY_STATUS[status] ?? status) : "—";

export const quoteStatusLabel = (status: string | null | undefined) =>
  status ? (QUOTE_STATUS[status] ?? status) : "—";

export const activityTypeLabel = (type: string | null | undefined) =>
  type ? (ACTIVITY_TYPE[type] ?? type) : "—";

export const activityStatusLabel = (status: string | null | undefined) =>
  status ? (ACTIVITY_STATUS[status] ?? status) : "—";

export const commercialStatusLabel = (status: string | null | undefined) =>
  status ? (COMMERCIAL_STATUS[status] ?? status) : "—";

export const representativeTypeLabel = (type: string | null | undefined) =>
  type ? (REPRESENTATIVE_TYPE[type] ?? type) : "—";

/** Kinds aceitos por `crm_query` para listagem tabular. */
export const CRM_LIST_KINDS = [
  "customers",
  "companies",
  "contacts",
  "leads",
  "opportunities",
  "opportunity_items",
  "stage_history",
  "quotes",
  "quote_items",
  "approvals",
  "activities",
  "activity_history",
  "representatives",
  "portfolios",
  "segments",
  "sources",
  "reasons",
  "tags",
  "customer_tags",
  "territories",
  "payment_terms",
  "pipelines",
  "stages",
  "authorities",
  "commission_plans",
  "commission_rules",
  "variants",
  "price_tables",
  "merge_requests",
] as const;

/**
 * Chaves de filtro aceitas por `crm_query`. O servidor só aplica filtros desta
 * lista branca; qualquer outra chave é ignorada, então a tela deve respeitar
 * este conjunto para não prometer um filtro que não acontece.
 */
export const CRM_FILTER_KEYS = [
  "id",
  "company_id",
  "status",
  "representative_id",
  "commercial_segment_id",
  "acquisition_source_id",
  "opportunity_id",
  "quote_id",
  "pipeline_id",
  "activity_id",
  "assigned_user_id",
  "q",
  "from",
  "to",
] as const;

/** Colunas numéricas de oportunidade/proposta, para alinhar na tabela. */
export const CURRENCY = "BRL" as const;
