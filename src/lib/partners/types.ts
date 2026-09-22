import type { Json } from "@/integrations/supabase/types";
export type CompanyRow = {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  document_type: "CPF" | "CNPJ" | "OTHER" | null;
  document_number: string | null;
  state_registration: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  blocked_reason: string | null;
  partner_id: string | null;
  default_inventory_location_id: string | null;
  city: string | null;
  on_hand: number | null;
  last_movement_at: string | null;
  roles: string;
};
export type PartnerProfile = {
  id: string;
  company_id: string;
  partner_code: string;
  operational_status: string;
  settlement_frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";
  default_inventory_location_id: string;
};
export type DetailValues = Record<string, string | boolean | null> & {
  id: string;
  is_primary: boolean;
};
export type History = { action: string; created_at: string; user_id: string; context: Json };
export type PartnerDetail = Omit<CompanyRow, "roles"> & {
  roles: string[];
  profile: PartnerProfile | null;
  contacts: DetailValues[];
  addresses: DetailValues[];
  history: History[];
  marketplace_integration: string;
  location_name: string | null;
  last_shipment: string | null;
};
export type OperationRow = {
  id: string;
  number: string;
  date: string;
  status: string;
  partner_id: string;
  partner_name: string;
  source_name: string;
  destination_name: string;
  item_count: number;
  units: number;
  created_by: string;
};
export type PartnerList = { rows: CompanyRow[] | OperationRow[]; total: number };
export type OperationItem = {
  id: string;
  variant_id: string;
  batch_id: string | null;
  batch_code: string | null;
  sku: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  product_name: string;
  quantity: number;
  picked_quantity?: number;
  condition?: string;
  reason?: string;
};
export type OperationDetail = OperationRow & {
  company_id: string;
  shipment_date?: string;
  return_date?: string;
  shipment_number?: string;
  return_number?: string;
  source_location_id: string;
  destination_location_id: string;
  transfer_id: string | null;
  items: OperationItem[];
  notes: string | null;
  expected_delivery_date: string | null;
  carrier_name: string | null;
  tracking_code: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
  received_by: string | null;
  returned_units?: number;
  returns?: { id: string; return_number: string; status: string }[];
  movements: {
    id: string;
    direction: string;
    quantity: number;
    location_id: string;
    reference_id: string;
    occurred_at: string;
  }[];
  history: History[];
};
export type PositionRow = {
  partner_id: string;
  partner_name: string;
  location_id: string;
  location_name: string;
  variant_id: string;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
  on_hand: number;
  sent: number;
  returned: number;
  last_shipment: string | null;
  last_movement_at: string | null;
};
export type PositionList = { rows: PositionRow[]; total: number; units: number };
export type PartnerSummary = {
  active_partners: number;
  on_hand: number;
  pending: number;
  shipments: number;
  sent: number;
  returned: number;
  discrepancies: number;
};
export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  PICKING: "Em separação",
  SHIPPED: "Expedida",
  DELIVERED: "Entregue",
  PARTIALLY_RETURNED: "Devolução parcial",
  RETURNED: "Devolvida",
  CANCELED: "Cancelada",
  RECEIVED: "Recebida",
  SELLABLE: "Vendável",
  DAMAGED: "Avariado",
  DEFECTIVE: "Defeituoso",
  OTHER: "Outro",
};
export const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

export type PartnerReportRow = {
  id: string;
  item_id: string;
  number: string;
  date: string;
  partner_name: string;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
  batch_code: string | null;
  quantity: number;
  status: string;
  condition: string | null;
  reason: string | null;
  source_name: string;
};
export type PartnerReportList = { rows: PartnerReportRow[]; total: number };
export type PartnerMovementList = {
  rows: {
    id: string;
    occurred_at: string;
    movement_type: string;
    direction: string;
    quantity: number;
    status: string;
    reason: string | null;
    created_by: string;
    sku: string;
    product_name: string;
    location_name: string;
  }[];
  total: number;
};
