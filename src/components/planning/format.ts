import type { PlanningRow } from "@/lib/planning/planning.functions";
export const inputClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
export const rows = (v: unknown): PlanningRow[] => (Array.isArray(v) ? (v as PlanningRow[]) : []);
export const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const number = (v: unknown) =>
  v == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(v));
export const today = () => new Date().toISOString().slice(0, 10);
export const labels: Record<string, string> = {
  DRAFT: "Rascunho",
  PROCESSING: "Processando",
  COMPLETED: "Concluído",
  COMPLETED_WITH_WARNINGS: "Concluído com avisos",
  FAILED: "Falhou",
  ARCHIVED: "Arquivado",
  SUGGESTED: "Sugerida",
  REVIEWED: "Revisada",
  APPROVED: "Aprovada",
  CONVERTED: "Convertida",
  DISMISSED: "Descartada",
  PRODUCTION: "Produção",
  PURCHASE: "Compra",
  TRANSFER: "Transferência",
  INFO: "Informação",
  WARNING: "Aviso",
  ERROR: "Erro",
  BLOCKING: "Bloqueante",
  CRITICAL: "Bloqueio/necessidade imediata",
  DEMAND: "Demanda",
  PRODUCTION_BLOCKING: "Necessidade de produção",
  BOM_MISSING: "BOM ausente",
  BOM_CYCLE_DETECTED: "Ciclo na BOM",
  UNIT_CONVERSION_MISSING: "Conversão ausente",
  LEAD_TIME_MISSING: "Lead time ausente",
  SUPPLIER_MISSING: "Fornecedor preferencial não definido",
  NEGATIVE_INVENTORY: "Estoque negativo",
  INVALID_FORECAST: "Forecast inválido",
  INSUFFICIENT_HISTORY: "Histórico insuficiente",
  PAST_DUE_REQUIREMENT: "Necessidade atrasada/sem data confiável",
  PLANNING_DATA_INCONSISTENT: "Dados inconsistentes",
  OPEN: "Aberta",
  RESOLVED: "Resolvida",
  IGNORED: "Ignorada",
};
