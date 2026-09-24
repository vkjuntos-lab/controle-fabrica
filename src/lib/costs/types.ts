import type { Json } from "@/integrations/supabase/types";
export type CostRow = { id: string; [key: string]: Json | undefined };
export type CostQueryResult = {
  rows?: CostRow[];
  total?: number;
  [key: string]: Json | CostRow[] | undefined;
};
export type CostCalculation = { run_id: string | null; simulation: boolean; results: CostRow[] };
export const labels: Record<string, string> = {
  material_cost: "Matéria-prima",
  component_cost: "Componentes",
  packaging_cost: "Embalagem",
  labor_cost: "Mão de obra",
  loss_cost: "Perdas",
  overhead_cost: "Custos indiretos",
  other_cost: "Outros",
  total_unit_cost: "Custo unitário",
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  SUPERSEDED: "Substituído",
  ARCHIVED: "Arquivado",
  COMPLETE: "Completo",
  INCOMPLETE: "Incompleto",
  STANDARD: "Padrão",
  ACTUAL_PRODUCTION: "Real da produção",
  MATERIAL_COST_MISSING: "Material sem custo vigente",
  LABOR_RATE_MISSING: "Atividade sem custo-hora",
  BOM_MISSING: "BOM vigente não encontrada",
  UNIT_CONVERSION_MISSING: "Conversão de unidade ausente",
  OVERHEAD_NOT_CONFIGURED: "Custos indiretos não configurados (zero explícito)",
  LABOR_NOT_CONFIGURED: "Mão de obra não configurada (zero explícito)",
  ACTUAL_LABOR_MISSING: "Apontamento de mão de obra real ausente",
  GOOD_OUTPUT_MISSING: "Produção boa válida ausente",
  MATERIAL_INPUTS_MISSING: "Consumos/componentes válidos ausentes",
  PRODUCT_COST_MISSING: "Produto sem custo publicado na data",
  VARIABLE_COSTS_UNCONFIRMED: "Despesas variáveis não confirmadas",
  DISCOUNT_FUNDING_UNKNOWN: "Responsável pelo desconto não identificado",
  CURRENCY_NOT_SUPPORTED: "Moeda sem método de conversão",
  RECALCULATION_AVAILABLE: "Novo cálculo disponível",
};
export const money = (value: unknown) =>
  value == null
    ? "Não disponível"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 4,
      });
