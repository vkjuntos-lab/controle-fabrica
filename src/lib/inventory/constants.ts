import type { Database } from "@/integrations/supabase/types";

export type MovementType = Database["public"]["Enums"]["inventory_movement_type"];
export type MovementDirection = Database["public"]["Enums"]["inventory_movement_direction"];
export type MovementStatus = Database["public"]["Enums"]["inventory_movement_status"];
export type LocationType = Database["public"]["Enums"]["inventory_location_type"];
export type LocationStatus = Database["public"]["Enums"]["inventory_location_status"];
export type TransferStatus = Database["public"]["Enums"]["inventory_transfer_status"];
export type CountStatus = Database["public"]["Enums"]["inventory_count_status"];
export type CountItemStatus = Database["public"]["Enums"]["inventory_count_item_status"];
export type BatchStatus = Database["public"]["Enums"]["inventory_batch_status"];

/** Tipos de movimento com rótulo, direção esperada e permissão exigida. */
export const MOVEMENT_TYPES: {
  value: MovementType;
  label: string;
  direction: MovementDirection | "FLEX";
  permission: string;
}[] = [
  {
    value: "OPENING_BALANCE",
    label: "Abertura de estoque",
    direction: "IN",
    permission: "inventory.opening_balance",
  },
  {
    value: "PURCHASE_RECEIPT",
    label: "Recebimento de compra",
    direction: "IN",
    permission: "inventory.move",
  },
  {
    value: "PRODUCTION_OUTPUT",
    label: "Saída de produção",
    direction: "IN",
    permission: "inventory.move",
  },
  {
    value: "PRODUCTION_CONSUMPTION",
    label: "Consumo de produção",
    direction: "OUT",
    permission: "inventory.move",
  },
  { value: "SALE", label: "Venda", direction: "OUT", permission: "inventory.move" },
  {
    value: "SALE_RETURN",
    label: "Devolução de venda",
    direction: "IN",
    permission: "inventory.move",
  },
  {
    value: "PARTNER_SHIPMENT",
    label: "Remessa para parceiro",
    direction: "OUT",
    permission: "inventory.move",
  },
  {
    value: "PARTNER_RETURN",
    label: "Devolução de parceiro",
    direction: "IN",
    permission: "inventory.move",
  },
  {
    value: "TRANSFER_IN",
    label: "Entrada por transferência",
    direction: "IN",
    permission: "inventory.transfer",
  },
  {
    value: "TRANSFER_OUT",
    label: "Saída por transferência",
    direction: "OUT",
    permission: "inventory.transfer",
  },
  {
    value: "ADJUSTMENT_IN",
    label: "Ajuste de entrada",
    direction: "IN",
    permission: "inventory.adjust",
  },
  {
    value: "ADJUSTMENT_OUT",
    label: "Ajuste de saída",
    direction: "OUT",
    permission: "inventory.adjust",
  },
  { value: "LOSS", label: "Perda", direction: "OUT", permission: "inventory.adjust" },
  {
    value: "MANUAL_CORRECTION",
    label: "Correção manual",
    direction: "FLEX",
    permission: "inventory.adjust",
  },
  {
    value: "REVERSAL",
    label: "Reversão/estorno",
    direction: "FLEX",
    permission: "inventory.reverse",
  },
];

export function movementTypeLabel(type: MovementType): string {
  return MOVEMENT_TYPES.find((m) => m.value === type)?.label ?? type;
}

/** Direção esperada de um tipo de movimento ("FLEX" = direção livre). */
export function expectedDirection(type: MovementType): MovementDirection | "FLEX" {
  return MOVEMENT_TYPES.find((m) => m.value === type)?.direction ?? "FLEX";
}

export function movementDirectionLabel(direction: MovementDirection): string {
  return direction === "IN" ? "Entrada" : "Saída";
}

export const MOVEMENT_STATUS_OPTIONS: { value: MovementStatus; label: string }[] = [
  { value: "PENDING", label: "Pendente" },
  { value: "POSTED", label: "Lançado" },
  { value: "REVERSED", label: "Revertido" },
  { value: "CANCELED", label: "Cancelado" },
];

export function movementStatusLabel(status: MovementStatus): string {
  return MOVEMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export const LOCATION_TYPE_OPTIONS: { value: LocationType; label: string; description: string }[] =
  [
    { value: "FACTORY", label: "Fábrica", description: "Produção própria." },
    { value: "WAREHOUSE", label: "Depósito", description: "Estoque central." },
    { value: "OWN_STORE", label: "Loja própria", description: "Pontos de venda próprios." },
    { value: "MARKETPLACE", label: "Marketplace", description: "Loja de marketplace." },
    { value: "PARTNER", label: "Parceiro", description: "Mercadoria em posse de terceiro." },
    { value: "TRANSIT", label: "Em trânsito", description: "Entre origem e destino." },
    { value: "OTHER", label: "Outro", description: "Outros casos." },
  ];

export function locationTypeLabel(type: LocationType): string {
  return LOCATION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const LOCATION_STATUS_OPTIONS: { value: LocationStatus; label: string }[] = [
  { value: "ACTIVE", label: "Ativa" },
  { value: "INACTIVE", label: "Inativa" },
];

export function locationStatusLabel(status: LocationStatus): string {
  return LOCATION_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export const TRANSFER_STATUS_OPTIONS: { value: TransferStatus; label: string }[] = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "PENDING", label: "Pendente" },
  { value: "APPROVED", label: "Aprovada" },
  { value: "IN_TRANSIT", label: "Em trânsito" },
  { value: "COMPLETED", label: "Concluída" },
  { value: "CANCELED", label: "Cancelada" },
];

export function transferStatusLabel(status: TransferStatus): string {
  return TRANSFER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export const COUNT_STATUS_OPTIONS: { value: CountStatus; label: string }[] = [
  { value: "DRAFT", label: "Elaboração" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "REVIEW", label: "Em revisão" },
  { value: "COMPLETED", label: "Concluída" },
  { value: "CANCELED", label: "Cancelada" },
];

export function countStatusLabel(status: CountStatus): string {
  return COUNT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export const BATCH_STATUS_OPTIONS: { value: BatchStatus; label: string }[] = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "EXPIRED", label: "Expirado" },
  { value: "DISABLED", label: "Desabilitado" },
];

export function batchStatusLabel(status: BatchStatus): string {
  return BATCH_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

/** Rótulo curto para a referência de origem de um movimento. */
export function referenceTypeLabel(referenceType: string | null): string {
  if (!referenceType) return "—";
  const labels: Record<string, string> = {
    TRANSFER: "Transferência",
    INVENTORY_COUNT: "Inventário físico",
    REVERSAL: "Reversão",
    MANUAL: "Manual",
    IMPORT: "Importação",
    SALE: "Venda",
    RETURN: "Devolução",
    PARTNER_SHIPMENT: "Remessa de parceiro",
    PRODUCTION_ORDER: "Ordem de produção",
  };
  return labels[referenceType] ?? referenceType;
}

export function formatQuantity(value: number | null | undefined): string {
  if (value == null) return "0";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
