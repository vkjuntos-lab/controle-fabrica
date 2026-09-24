import type { Json } from "@/integrations/supabase/types";

export type PurchasingDashboard = {
  active_suppliers: number;
  open_requests: number;
  pending_approval: number;
  open_orders: number;
  orders_amount: number;
  receipts_today: number;
  open_exceptions: number;
  replenishment_candidates: number;
};

export type PurchasingSettings = {
  organization_id: string;
  acquisition_cost_policy: "LAST_PURCHASE" | "AVERAGE";
  freight_policy: "EXPENSE_SEPARATELY" | "INCLUDE_IN_INVENTORY_COST";
  over_receipt_policy: "BLOCK" | "WARN" | "AUTH_OVERRIDE";
  payable_on: "GOODS_RECEIPT" | "INVOICE";
  approval_segregation: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type SupplierRow = {
  company_id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  document_type: string | null;
  document_number: string | null;
  company_status: string;
  supplier_id: string;
  supplier_code: string;
  supplier_status: string;
  default_payment_terms: string | null;
  preferred: boolean;
  currency: string;
  product_count: number;
  open_orders: number;
};

export type SupplierProductRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  variant_id: string;
  sku: string;
  product_name: string;
  supplier_sku: string;
  supplier_description: string | null;
  purchase_unit: string | null;
  inventory_unit: string | null;
  conversion_factor: number;
  last_price: number | null;
  last_price_date: string | null;
  minimum_order_quantity: number;
  lead_time_days: number | null;
  status: string;
};
export type SupplierList = { rows: SupplierRow[]; total: number };
export type SupplierProductsList = { rows: SupplierProductRow[]; total: number };
export type SupplierDashboard = {
  active_suppliers: number;
  products_catalogued: number;
  open_orders: number;
  unmatched_documents: number;
  open_exceptions: number;
};

export type SupplierOrderSummary = {
  id: string;
  order_number: string;
  status: string;
  issue_date: string;
  expected_delivery_date: string | null;
  total_amount: number;
  currency: string;
};
export type SupplierReceiptSummary = {
  id: string;
  receipt_number: string;
  status: string;
  received_at: string;
  total_accepted: number;
};
export type SupplierDocumentSummary = {
  id: string;
  document_type: string;
  document_number: string;
  issue_date: string;
  total_amount: number;
  status: string;
};
export type SupplierReturnSummary = {
  id: string;
  return_number: string;
  status: string;
  return_date: string;
};
export type SupplierDetail = Json & {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  profile: Json | null;
  products: SupplierProductRow[];
  orders: SupplierOrderSummary[];
  receipts: SupplierReceiptSummary[];
  documents: SupplierDocumentSummary[];
  returns: SupplierReturnSummary[];
  payables: Json[];
};

export type PurchaseRequestItem = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_of_measure_id: string | null;
  needed_by_date: string | null;
  reason: string | null;
  status: string;
  sku: string;
  product_name: string;
};
export type PurchaseRequestRow = {
  id: string;
  request_number: string;
  request_date: string;
  status: string;
  priority: string;
  needed_by_date: string | null;
  cost_center_id: string | null;
  requested_by: string;
  requested_by_name: string | null;
  items: number;
  notes: string | null;
};
export type PurchaseRequestDetail = {
  request: Json & { id: string; request_number: string; status: string };
  items: PurchaseRequestItem[];
};
export type RequestList = { rows: PurchaseRequestRow[]; total: number };

export type QuotationSupplier = {
  id: string;
  supplier_id: string;
  notes: string | null;
  supplier_name: string;
};
export type QuotationItem = {
  id: string;
  supplier_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  freight_amount: number;
  tax_amount: number;
  other_amount: number;
  total_amount: number;
  delivery_days: number | null;
  payment_terms: string | null;
  valid_until: string | null;
  awarded: boolean;
  award_reason: string | null;
  supplier_name: string;
  sku: string;
  product_name: string;
};
export type QuotationRow = {
  id: string;
  quotation_number: string;
  status: string;
  deadline: string | null;
  created_at: string;
  purchase_request_id: string | null;
  request_number: string | null;
  suppliers: number;
  variants: number;
};
export type QuotationDetail = {
  quotation: Json & { id: string; quotation_number: string; status: string };
  suppliers: QuotationSupplier[];
  items: QuotationItem[];
};
export type QuotationList = { rows: QuotationRow[]; total: number };

export type PurchaseOrderItemRow = {
  id: string;
  variant_id: string;
  ordered_quantity: number;
  received_quantity: number;
  purchase_unit_id: string | null;
  purchase_unit_code: string | null;
  inventory_unit_id: string | null;
  conversion_factor: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
  expected_delivery_date: string | null;
  status: string;
  sku: string;
  product_name: string;
};
export type PurchaseOrderRow = {
  id: string;
  order_number: string;
  supplier_id: string;
  status: string;
  issue_date: string;
  expected_delivery_date: string | null;
  total_amount: number;
  currency: string;
  payment_terms: string | null;
  supplier_name: string;
  supplier_code: string;
  items: number;
  open_items: number;
};
export type PurchaseOrderDetail = {
  order: Json & { id: string; order_number: string; status: string };
  items: PurchaseOrderItemRow[];
  receipts: Json[];
};
export type OrderList = { rows: PurchaseOrderRow[]; total: number };
export type OrderCandidate = {
  id: string;
  order_number: string;
  status: string;
  issue_date: string;
  total_amount: number;
  supplier_name: string;
};
export type OrderCandidates = { rows: OrderCandidate[] };

export type GoodsReceiptItemRow = {
  id: string;
  variant_id: string;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  unit_cost: number;
  line_total: number;
  status: string;
  sku: string;
  product_name: string;
};
export type GoodsReceiptRow = {
  id: string;
  receipt_number: string;
  purchase_order_id: string;
  supplier_id: string;
  status: string;
  received_at: string;
  destination_location_id: string | null;
  supplier_name: string;
  order_number: string;
  total_received: number;
  total_accepted: number;
  total_rejected: number;
  posted_by: string | null;
  posted_at: string | null;
};
export type GoodsReceiptDetail = {
  receipt: Json & { id: string; receipt_number: string; status: string };
  items: GoodsReceiptItemRow[];
};
export type ReceiptList = { rows: GoodsReceiptRow[]; total: number };

export type SupplierReturnRow = {
  id: string;
  return_number: string;
  supplier_id: string;
  source_location_id: string | null;
  status: string;
  return_date: string;
  reason: string | null;
  supplier_name: string;
  items: number;
};
export type SupplierReturnDetail = {
  return_: Json & { id: string; return_number: string; status: string };
  items: Json[];
};
export type ReturnList = { rows: SupplierReturnRow[]; total: number };

export type SupplierDocumentRow = {
  id: string;
  supplier_id: string;
  document_type: string;
  document_number: string;
  issue_date: string;
  total_amount: number;
  quantity: number | null;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  status: string;
  supplier_name: string;
  order_number: string | null;
  open_exceptions: number;
};
export type SupplierDocumentDetail = {
  document: Json & { id: string; document_number: string; status: string };
  exceptions: Json[];
};
export type DocumentList = { rows: SupplierDocumentRow[]; total: number };

export type PurchaseExceptionRow = {
  id: string;
  exception_type: "OVER_RECEIPT" | "QUANTITY_VARIANCE" | "PRICE_VARIANCE" | string;
  severity: "WARNING" | "BLOCKING";
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "IGNORED_WITH_AUTHORIZATION";
  purchase_order_id: string | null;
  supplier_document_id: string | null;
  variant_id: string | null;
  message: string;
  details: Json;
  created_at: string;
  resolution_notes: string | null;
};
export type ExceptionList = { rows: PurchaseExceptionRow[]; total: number };
export type ExceptionSummary = {
  count: number;
  blocking: number;
};

export type ReplenishmentRow = {
  variant_id: string;
  sku: string;
  product_name: string;
  replenishment_policy: string;
  minimum_stock: number;
  reorder_point: number | null;
  target_stock: number | null;
  available: number;
  open_qty: number;
  pending_req: number;
  monthly_pace: number;
  lead_days: number;
  last_price: number;
  suggested_quantity: number;
  lead_buffer: number;
  estimated_cost: number;
  recommend_order: boolean;
};
export type ReplenishmentResult = { rows: ReplenishmentRow[]; total: number };

export type PurchasingQueryResult =
  | PurchasingDashboard
  | { settings: PurchasingSettings }
  | SupplierList
  | SupplierProductsList
  | SupplierDashboard
  | SupplierDetail
  | RequestList
  | PurchaseRequestDetail
  | QuotationList
  | QuotationDetail
  | OrderList
  | PurchaseOrderDetail
  | OrderCandidates
  | ReceiptList
  | GoodsReceiptDetail
  | ReturnList
  | SupplierReturnDetail
  | DocumentList
  | SupplierDocumentDetail
  | ExceptionList
  | ExceptionSummary
  | ReplenishmentResult
  | { updated: boolean }
  | { id: string; status: string }
  | { id: string; status: string; paid_amount?: number };