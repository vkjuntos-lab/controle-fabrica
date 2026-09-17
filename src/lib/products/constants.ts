import type { Database } from "@/integrations/supabase/types";

export type ProductStatus = Database["public"]["Enums"]["product_status"];
export type ProductVariantStatus = Database["public"]["Enums"]["product_variant_status"];

export const PRODUCT_STATUS_VALUES: ProductStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "DISCONTINUED",
  "DRAFT",
];

export const PRODUCT_STATUS_OPTIONS: {
  value: ProductStatus;
  label: string;
  description: string;
}[] = [
  {
    value: "ACTIVE",
    label: "Ativo",
    description: "Disponível para venda e movimentações.",
  },
  {
    value: "INACTIVE",
    label: "Inativo",
    description: "Pausado, mas mantém histórico.",
  },
  {
    value: "DISCONTINUED",
    label: "Descontinuado",
    description: "Fora de linha; usado apenas em histórico.",
  },
  {
    value: "DRAFT",
    label: "Rascunho",
    description: "Ainda em preparação.",
  },
];

export function productStatusLabel(status: ProductStatus): string {
  return PRODUCT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatWeight(value: number | null | undefined): string {
  if (value == null) return "—";
  const grams = Number(value);
  if (grams >= 1000)
    return `${(grams / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
  return `${grams.toLocaleString("pt-BR")} g`;
}
