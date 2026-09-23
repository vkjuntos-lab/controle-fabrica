export const RECONCILIATION_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  PROCESSING: "Processando",
  REVIEW_REQUIRED: "Revisão necessária",
  READY_TO_CLOSE: "Pronto para fechar",
  CLOSED: "Fechado",
  REOPENED: "Reaberto",
  CANCELED: "Cancelado",
};
export const RECONCILIATION_STATUS_ORDER = [
  "DRAFT",
  "PROCESSING",
  "REVIEW_REQUIRED",
  "READY_TO_CLOSE",
  "CLOSED",
  "REOPENED",
  "CANCELED",
] as const;
export const ITEM_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  VALIDATED: "Validado",
  RECONCILED: "Reconciliado",
  EXCEPTION: "Exceção",
  REVERSED: "Estornado",
  CANCELED: "Cancelado",
};
export const INVENTORY_EFFECT_STATUS: Record<string, string> = {
  NONE: "Sem efeito",
  APPLIED: "Baixa aplicada",
  FAILED: "Falhou",
  REVERSED: "Baixa estornada",
};
export const EXCEPTION_TYPES: Record<string, string> = {
  PARTNER_NOT_MAPPED: "Parceiro sem mapeamento",
  PARTNER_LOCATION_NOT_CONFIGURED: "Parceiro sem localização",
  SKU_NOT_MAPPED: "SKU sem mapeamento",
  INSUFFICIENT_PARTNER_STOCK: "Estoque insuficiente do parceiro",
  PRICE_NOT_FOUND: "Preço não encontrado",
  DUPLICATE_SALE: "Venda duplicada",
  ALREADY_RECONCILED: "Já reconciliada",
  INVALID_QUANTITY: "Quantidade inválida",
  INVALID_DATE: "Data inválida",
  STORE_PARTNER_MISMATCH: "Loja fora do parceiro",
  INVENTORY_EFFECT_FAILED: "Falha no efeito de estoque",
  COMMERCIAL_RULE_ERROR: "Erro de regra comercial",
  LATE_SALE_AFTER_CLOSING: "Venda tardia após fechamento",
  OTHER: "Outro",
};
export const EXCEPTION_SEVERITY: Record<string, string> = {
  INFO: "Informativo",
  WARNING: "Atenção",
  ERROR: "Erro",
  BLOCKING: "Bloqueante",
};
export const EXCEPTION_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  IN_REVIEW: "Em revisão",
  RESOLVED: "Resolvida",
  IGNORED_WITH_AUTHORIZATION: "Ignorada com autorização",
};
export const EXCEPTION_RESOLUTION_TYPES: { value: string; label: string }[] = [
  { value: "MANUAL", label: "Correção manual" },
  { value: "SUPPLY_MOVEMENT", label: "Movimento de suprimento" },
  { value: "REPROCESS", label: "Reprocessar item" },
  { value: "IGNORED_BY_ADMIN", label: "Ignorada com autorização de admin" },
];
export const MARKETPLACE_SALE_STATUS: Record<string, string> = {
  IMPORTED: "Importada",
  VALIDATED: "Validada",
  RECONCILED: "Reconciliada",
  CANCELED: "Cancelada",
  EXCEPTION: "Exceção",
};
export const STORE_OWNERSHIP: Record<string, string> = {
  FACTORY: "Fábrica",
  OWN: "Própria",
  PARTNER: "Parceiro",
};
export const STORE_STATUS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  BLOCKED: "Bloqueada",
};
export const PRICE_TABLE_STATUS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
};
export const PRICE_ITEM_STATUS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};
export const ADJUSTMENT_TYPE: Record<string, string> = {
  CREDIT: "Crédito",
  DEBIT: "Débito",
};
export const RECONCILIATION_FREQUENCY: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  CUSTOM: "Personalizado",
};
export const PARTNER_RULES: Record<string, string> = {
  PRICE_TABLE: "Tabela de preço",
  SALE_REFERENCE: "Referência da venda",
};
export const statusLabel = (s: string | null | undefined): string => s ?? "—";
export const reconciliationStatusLabel = (s: string) => RECONCILIATION_STATUS[s] ?? s;
export const itemStatusLabel = (s: string) => ITEM_STATUS[s] ?? s;
export const exceptionTypeLabel = (s: string) => EXCEPTION_TYPES[s] ?? s;
export const severityLabel = (s: string) => EXCEPTION_SEVERITY[s] ?? s;
export const exceptionStatusLabel = (s: string) => EXCEPTION_STATUS[s] ?? s;
export const saleStatusLabel = (s: string) => MARKETPLACE_SALE_STATUS[s] ?? s;
export const storeOwnershipLabel = (s: string) => STORE_OWNERSHIP[s] ?? s;
export const storeStatusLabel = (s: string) => STORE_STATUS[s] ?? s;
export const priceTableStatusLabel = (s: string) => PRICE_TABLE_STATUS[s] ?? s;
export const priceItemStatusLabel = (s: string) => PRICE_ITEM_STATUS[s] ?? s;
export const adjustmentTypeLabel = (s: string) => ADJUSTMENT_TYPE[s] ?? s;
export const frequencyLabel = (s: string) => RECONCILIATION_FREQUENCY[s] ?? s;
export const inventoryEffectLabel = (s: string) => INVENTORY_EFFECT_STATUS[s] ?? s;
export const priceRuleLabel = (s: string) => PARTNER_RULES[s] ?? s;

export function formatMoney(value: number | string | null | undefined): string {
  if (value == null) return "R$ 0,00";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

export function formatNumber(value: number | string | null | undefined, digits = 3): string {
  if (value == null) return "0";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value.length <= 10 ? `${value}T12:00:00` : value).toLocaleDateString("pt-BR");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("pt-BR");
}
