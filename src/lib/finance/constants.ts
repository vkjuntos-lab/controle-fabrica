export const DOCUMENT_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  OPEN: "Em aberto",
  PARTIALLY_PAID: "Parcialmente pago",
  PAID: "Pago",
  OVERDUE: "Em atraso",
  CANCELED: "Cancelado",
  WRITTEN_OFF: "Baixado",
};
export const DOCUMENT_STATUS_ORDER = [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELED",
  "WRITTEN_OFF",
] as const;
export const ACCOUNT_TYPE: Record<string, string> = {
  BANK: "Banco",
  CASH: "Caixa",
  DIGITAL_WALLET: "Carteira digital",
  PAYMENT_PROVIDER: "Provedor de pagamento",
  OTHER: "Outra",
};
export const ACCOUNT_STATUS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  CLOSED: "Encerrada",
};
export const CATEGORY_TYPE: Record<string, string> = {
  REVENUE: "Receita",
  EXPENSE: "Despesa",
};
export const ACTIVE_STATUS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};
export const TRANSACTION_TYPE: Record<string, string> = {
  OPENING_BALANCE: "Saldo inicial",
  RECEIVABLE_PAYMENT: "Recebimento",
  PAYABLE_PAYMENT: "Pagamento",
  FINANCIAL_TRANSFER: "Transferência",
  DIRECT: "Movimento avulso",
  REVERSAL: "Estorno",
};
export const TRANSACTION_DIRECTION: Record<string, string> = {
  IN: "Entrada",
  OUT: "Saída",
};
export const RECURRENCE_DIRECTION: Record<string, string> = {
  IN: "Recorrência de receita",
  OUT: "Recorrência de despesa",
};
export const AGING_BUCKETS = [
  "avencer",
  "1-7d",
  "8-15d",
  "16-30d",
  "31-60d",
  "61-90d",
  "90+d",
] as const;
export const FIN_KINDS = [
  "dashboard",
  "receivables",
  "receivable",
  "payables",
  "payable",
  "finances",
  "aging",
  "transactions",
  "accounts",
  "categories",
  "cost_centers",
  "payment_methods",
  "settings",
  "recurrences",
  "cashflow",
  "partner_finance",
  "report_category",
  "report_cost_center",
  "history",
] as const;
export const FIN_FILTER_KEYS = [
  "id",
  "query",
  "status",
  "late",
  "side",
  "company_id",
  "financial_category_id",
  "cost_center_id",
  "account_id",
  "direction",
  "type",
  "from",
  "to",
] as const;
export const documentStatusLabel = (s: string | null | undefined) =>
  s ? (DOCUMENT_STATUS[s] ?? s) : "—";
export const accountTypeLabel = (s: string) => ACCOUNT_TYPE[s] ?? s;
export const accountStatusLabel = (s: string) => ACCOUNT_STATUS[s] ?? s;
export const categoryTypeLabel = (s: string) => CATEGORY_TYPE[s] ?? s;
export const activeStatusLabel = (s: string) => ACTIVE_STATUS[s] ?? s;
export const transactionTypeLabel = (s: string) => TRANSACTION_TYPE[s] ?? s;
export const transactionDirectionLabel = (s: string) => TRANSACTION_DIRECTION[s] ?? s;
export const recurrenceDirectionLabel = (s: string) => RECURRENCE_DIRECTION[s] ?? s;

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
  return new Date(value).toLocaleString("pt-BR");
}
