import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type {
  DashboardSummary,
  MarketplaceSaleList,
  MarketplaceStoreList,
  PriceTableDetail,
  PriceTableList,
  PreviewResult,
  ReconciliationDetail,
  ReconciliationHistoryRow,
  ReconciliationList,
  ReconciliationException,
  SkuMappingList,
} from "./types";
const org = z.string().uuid();
const filters = z.record(z.string(), z.string().max(200)).default({});

export const queryReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum([
          "dashboard",
          "reconciliations",
          "reconciliation",
          "exceptions",
          "divergences",
          "sales",
          "stores",
          "mappings",
          "price_tables",
          "price_table",
          "price_rules",
          "history",
        ]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as
      | DashboardSummary
      | ReconciliationList
      | ReconciliationDetail
      | ReconciliationException[]
      | MarketplaceSaleList
      | MarketplaceStoreList
      | SkuMappingList
      | PriceTableList
      | PriceTableDetail
      | ReconciliationHistoryRow[];
  });

const storeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(180),
  marketplace: z.string().trim().max(60).default("MERCADO_LIVRE"),
  marketplace_store_id: z.string().max(120).optional(),
  ownership_type: z.enum(["FACTORY", "OWN", "PARTNER"]).default("PARTNER"),
  partner_id: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).default("ACTIVE"),
  notes: z.string().max(4000).optional(),
});
export const saveMarketplaceStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, id: org.optional(), store: storeSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("marketplace_save_store", {
      _org: data.organizationId,
      _data: data.store,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const saveSkuMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        external_sku: z.string().trim().min(1).max(200),
        store_id: org.optional(),
        variant_id: org,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("marketplace_save_mapping", {
      _org: data.organizationId,
      _data: {
        external_sku: data.external_sku,
        store_id: data.store_id,
        variant_id: data.variant_id,
      },
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const registerMarketplaceSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        sale: z.object({
          store_id: org,
          sale_date: z.iso.date(),
          external_order_id: z.string().trim().min(1).max(200),
          external_sku: z.string().trim().min(1).max(200),
          external_event_id: z.string().trim().max(200).optional(),
          quantity: z.number().positive().max(99999999999).multipleOf(0.001),
          gross_amount: z.number().nonnegative().max(1e14).default(0),
          shipping_fee: z.number().nonnegative().max(1e14).default(0),
          discount_amount: z.number().nonnegative().max(1e14).default(0),
          platform_fee: z.number().nonnegative().max(1e14).default(0),
          currency: z.string().max(6).default("BRL"),
          import_key: z.string().max(200).optional(),
          source: z.string().max(60).default("MANUAL"),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("marketplace_register_sale", {
      _org: data.organizationId,
      _data: data.sale,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const cancelMarketplaceSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ organizationId: org, saleId: org, reason: z.string().max(1000).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("marketplace_cancel_sale", {
      _org: data.organizationId,
      _sale_id: data.saleId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const savePriceTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        id: org.optional(),
        table: z.object({
          code: z.string().trim().min(1).max(40),
          name: z.string().trim().min(1).max(180),
          status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
          valid_from: z.iso.date().optional(),
          valid_to: z.iso.date().optional(),
          notes: z.string().max(4000).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("price_save_table", {
      _org: data.organizationId,
      _data: data.table,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const savePriceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        itemId: org.optional(),
        item: z.object({
          price_table_id: org,
          variant_id: org,
          unit_price: z.number().positive().max(1e12).multipleOf(0.01),
          valid_from: z.iso.date().optional(),
          valid_to: z.iso.date().optional(),
          status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("price_save_item", {
      _org: data.organizationId,
      _data: data.item,
      _item_id: data.itemId,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const linkPartnerPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        data: z.object({
          partner_id: org,
          price_table_id: org,
          valid_from: z.iso.date().optional(),
          valid_to: z.iso.date().optional(),
          notes: z.string().max(2000).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("price_link_partner", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const previewReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ organizationId: org, partnerId: org, from: z.iso.date(), to: z.iso.date() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_preview", {
      _org: data.organizationId,
      _partner: data.partnerId,
      _from: data.from,
      _to: data.to,
    });
    if (error) throw new Error(error.message);
    return result as PreviewResult;
  });

export const createReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        data: z.object({
          partner_id: org,
          period_start: z.iso.date(),
          period_end: z.iso.date(),
          frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"]).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_create", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const processReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        reconciliationId: org,
        limit: z.number().int().positive().optional(),
        itemIds: z.array(org).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_process", {
      _org: data.organizationId,
      _reconciliation_id: data.reconciliationId,
      _limit: data.limit,
      _item_ids: data.itemIds,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const reprocessReconciliationItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: org, itemId: org }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_reprocess_item", {
      _org: data.organizationId,
      _item_id: data.itemId,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const resolveReconciliationException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        exceptionId: org,
        resolution: z.enum(["MANUAL", "SUPPLY_MOVEMENT", "REPROCESS", "IGNORED_BY_ADMIN"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_exception_resolve", {
      _org: data.organizationId,
      _exception_id: data.exceptionId,
      _resolution: data.resolution,
      _notes: data.notes,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const addReconciliationAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        reconciliationId: org,
        adjustment_type: z.enum(["CREDIT", "DEBIT"]),
        amount: z.number().nonnegative().max(1e14).multipleOf(0.01),
        reason: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_adjustment", {
      _org: data.organizationId,
      _reconciliation_id: data.reconciliationId,
      _type: data.adjustment_type,
      _amount: data.amount,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const closeReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        reconciliationId: org,
        notes: z.string().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_close", {
      _org: data.organizationId,
      _reconciliation_id: data.reconciliationId,
      _notes: data.notes,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const reopenReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        reconciliationId: org,
        reason: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_reopen", {
      _org: data.organizationId,
      _reconciliation_id: data.reconciliationId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const cancelReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        reconciliationId: org,
        reason: z.string().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_cancel", {
      _org: data.organizationId,
      _reconciliation_id: data.reconciliationId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const reverseReconciliationItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        itemId: org,
        reason: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("rec_reverse_item", {
      _org: data.organizationId,
      _item_id: data.itemId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });
