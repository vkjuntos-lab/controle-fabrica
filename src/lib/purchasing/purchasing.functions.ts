import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { PurchasingQueryResult } from "./types";

const org = z.string().uuid();
const id = z.string().uuid().optional();
const money = z.number().nonnegative().max(1e14);
const filters = z.record(z.string(), z.string().max(200)).default({});
const dateStr = z.iso.date().optional();

const companySchema = z.object({
  code: z.string().trim().min(1).max(40),
  legal_name: z.string().trim().min(1).max(180),
  trade_name: z.string().trim().max(180).optional(),
  document_type: z.string().max(20).optional(),
  document_number: z.string().max(40).optional(),
  state_registration: z.string().max(40).optional(),
  email: z.string().email().max(120).optional(),
  phone: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
  notes: z.string().max(2000).optional(),
  blocked_reason: z.string().max(600).optional(),
  default_payment_terms: z.string().max(80).optional(),
  lead_time_days: z.number().int().min(0).max(3650).optional(),
  minimum_order_value: money.optional(),
  preferred: z.boolean().optional(),
  currency: z.literal("BRL").default("BRL"),
});
export const saveCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ organizationId: org, data: companySchema, companyId: id })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("supplier_save_company", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.companyId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

const supplierProductSchema = z.object({
  supplier_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  supplier_sku: z.string().trim().min(1).max(80),
  supplier_description: z.string().max(400).optional(),
  purchase_unit_id: z.string().uuid().optional(),
  inventory_unit_id: z.string().uuid().optional(),
  conversion_factor: money.optional(),
  last_price: money.optional(),
  last_price_date: dateStr,
  minimum_order_quantity: z.number().positive().optional(),
  lead_time_days: z.number().int().min(0).max(3650).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export const saveSupplierProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        data: supplierProductSchema,
        supplierProductId: id,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("supplier_product_save", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.supplierProductId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

export const querySuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["suppliers", "supplier", "products", "dashboard"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("supplier_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const requestItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_of_measure_id: z.string().uuid().optional(),
  needed_by_date: dateStr,
  reason: z.string().max(600).optional(),
  source_type: z.string().max(40).optional(),
  source_id: z.string().max(120).optional(),
});
const requestSchema = z.object({
  cost_center_id: z.string().uuid().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  needed_by_date: dateStr,
  notes: z.string().max(2000).optional(),
  items: z.array(requestItemSchema).min(1),
});
export const saveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ organizationId: org, data: requestSchema, requestId: id })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("request_save", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.requestId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

const actionData = z
  .object({
    reason: z.string().trim().min(1).max(600).optional(),
  })
  .default({});

export const requestAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        requestId: org,
        action: z.enum(["submit", "approve", "cancel"]),
        data: actionData,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("request_action", {
      _org: data.organizationId,
      _id: data.requestId,
      _action: data.action,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["requests", "request"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("request_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const quotationItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_of_measure_id: z.string().uuid().optional(),
  unit_price: money,
  discount_amount: money.optional(),
  freight_amount: money.optional(),
  tax_amount: money.optional(),
  other_amount: money.optional(),
  delivery_days: z.number().int().min(0).max(3650).optional(),
  payment_terms: z.string().max(80).optional(),
  valid_until: dateStr,
  notes: z.string().max(600).optional(),
});
const quotationSupplierSchema = z.object({
  supplier_id: z.string().uuid(),
  notes: z.string().max(600).optional(),
  items: z.array(quotationItemSchema).min(1),
});
const quotationSchema = z.object({
  purchase_request_id: z.string().uuid().optional(),
  deadline: dateStr,
  notes: z.string().max(2000).optional(),
  suppliers: z.array(quotationSupplierSchema).min(1),
});
export const saveQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ organizationId: org, data: quotationSchema, quotationId: id })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("quotation_save", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.quotationId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

const awardItemSchema = z.object({
  item_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  award: z.boolean().default(true),
  reason: z.string().max(600).optional(),
});
export const awardQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        quotationId: org,
        data: z.object({ items: z.array(awardItemSchema).min(1) }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("quotation_award", {
      _org: data.organizationId,
      _quotation_id: data.quotationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryQuotations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["quotations", "quotation"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("quotation_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const purchaseOrderItemSchema = z.object({
  variant_id: z.string().uuid(),
  ordered_quantity: z.number().positive(),
  unit_price: money,
  purchase_unit_id: z.string().uuid().optional(),
  inventory_unit_id: z.string().uuid().optional(),
  conversion_factor: z.number().positive().optional(),
  discount_amount: money.optional(),
  tax_amount: money.optional(),
  expected_delivery_date: dateStr,
});
const purchaseOrderSchema = z.object({
  supplier_id: z.string().uuid(),
  quotation_id: z.string().uuid().optional(),
  purchase_request_id: z.string().uuid().optional(),
  issue_date: dateStr,
  expected_delivery_date: dateStr,
  currency: z.literal("BRL").default("BRL"),
  payment_terms: z.string().max(80).optional(),
  destination_location_id: z.string().uuid().optional(),
  financial_category_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  freight_amount: money.optional(),
  other_amount: money.optional(),
  items: z.array(purchaseOrderItemSchema).min(1),
});
export const savePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ organizationId: org, data: purchaseOrderSchema, purchaseOrderId: id })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("po_save", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.purchaseOrderId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

export const purchaseOrderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        purchaseOrderId: org,
        action: z.enum(["submit", "approve", "send", "cancel"]),
        data: actionData,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("po_action", {
      _org: data.organizationId,
      _id: data.purchaseOrderId,
      _action: data.action,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryPurchaseOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["orders", "order", "candidates"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("po_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const receiveItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().positive(),
});
const poReceiveSchema = z.object({
  received_at: dateStr,
  destination_location_id: z.string().uuid().optional(),
  supplier_document_number: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(receiveItemSchema).min(1),
});
export const receivePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        purchaseOrderId: org,
        data: poReceiveSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("po_receive", {
      _org: data.organizationId,
      _po_id: data.purchaseOrderId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

const inspectItemSchema = z.object({
  item_id: z.string().uuid(),
  accepted_quantity: z.number().nonnegative().optional(),
  reason: z.string().max(600).optional(),
});
export const receiptAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        goodsReceiptId: org,
        action: z.enum(["inspect", "post", "cancel"]),
        data: z
          .object({ items: z.array(inspectItemSchema).min(1).optional(), reason: z.string().max(600).optional() })
          .default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("receipt_action", {
      _org: data.organizationId,
      _id: data.goodsReceiptId,
      _action: data.action,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["receipts", "receipt"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("receipt_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const returnItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().positive(),
  batch_id: z.string().uuid().optional(),
  reason: z.string().max(600).optional(),
});
const returnSchema = z.object({
  supplier_id: z.string().uuid(),
  goods_receipt_id: z.string().uuid().optional(),
  source_location_id: z.string().uuid().optional(),
  return_date: dateStr,
  reason: z.string().max(2000).optional(),
  items: z.array(returnItemSchema).min(1),
});
export const saveReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: returnSchema, returnId: id }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("return_save", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.returnId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

export const returnAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        returnId: org,
        action: z.enum(["post", "cancel"]),
        data: actionData,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("return_action", {
      _org: data.organizationId,
      _id: data.returnId,
      _action: data.action,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryReturns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["returns", "return"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("return_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const documentSchema = z.object({
  supplier_id: z.string().uuid(),
  document_type: z.enum(["INVOICE", "CREDIT_NOTE", "FRETUR", "OTHER"]).default("INVOICE"),
  document_number: z.string().trim().min(1).max(60),
  issue_date: dateStr,
  total_amount: money.optional(),
  quantity: z.number().positive().optional(),
  purchase_order_id: z.string().uuid().optional(),
  goods_receipt_id: z.string().uuid().optional(),
  storage_path: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export const saveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: documentSchema, documentId: id }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("document_save", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.documentId,
    });
    if (error) throw new Error(error.message);
    return result as string;
  });

export const documentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        documentId: org,
        action: z.enum(["match", "process", "cancel"]),
        data: actionData,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("document_action", {
      _org: data.organizationId,
      _id: data.documentId,
      _action: data.action,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["documents", "document"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("document_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

export const exceptionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        exceptionId: org,
        action: z.enum(["resolve", "ignore", "reopen"]),
        data: z
          .object({ resolution_notes: z.string().trim().min(1).max(600).optional() })
          .default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("exception_action", {
      _org: data.organizationId,
      _id: data.exceptionId,
      _action: data.action,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const queryExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["exceptions", "open"]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("exception_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

export const queryReplenishment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("replenishment_query", {
      _org: data.organizationId,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

export const queryPurchasing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["dashboard", "settings"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("purchasing_query", {
      _org: data.organizationId,
      _kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PurchasingQueryResult;
  });

const settingsSchema = z.object({
  acquisition_cost_policy: z.enum(["LAST_PURCHASE", "AVERAGE"]).optional(),
  freight_policy: z.enum(["EXPENSE_SEPARATELY", "INCLUDE_IN_INVENTORY_COST"]).optional(),
  over_receipt_policy: z.enum(["BLOCK", "WARN", "AUTH_OVERRIDE"]).optional(),
  payable_on: z.enum(["GOODS_RECEIPT", "INVOICE"]).optional(),
  approval_segregation: z.boolean().optional(),
});
export const savePurchasingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: settingsSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("purchasing_settings_save", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });