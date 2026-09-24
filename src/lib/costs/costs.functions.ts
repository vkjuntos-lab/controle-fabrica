import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { CostQueryResult, CostCalculation } from "./types";
const uuid = z.string().uuid();
const payload = z.record(z.string(), z.json());
export const queryCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        kind: z.enum([
          "dashboard",
          "options",
          "pricing_options",
          "materials",
          "labor",
          "overhead",
          "routing",
          "labor_entries",
          "runs",
          "versions",
          "variable_rules",
          "economics",
          "price_tables",
          "settings",
          "sales",
          "snapshot",
          "profitability",
          "impact",
          "comparison",
        ]),
        filters: z.record(z.string(), z.string().max(1000)).default({}),
        page: z.number().int().min(1).max(1000000).default(1),
        export: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("cost_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
      _export: data.export,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CostQueryResult;
  });
export const saveCostInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        kind: z.enum([
          "material",
          "labor",
          "routing",
          "labor_entry",
          "overhead",
          "variable_rule",
          "settings",
          "economics",
          "conversion",
        ]),
        values: payload,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("cost_save_input", {
      _org: data.organizationId,
      _kind: data.kind,
      _data: data.values as Json,
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const calculateCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        simulation: z.boolean().default(false),
        values: z.object({
          variants: z.array(uuid).min(1).max(100),
          effective_from: z.iso.date(),
          production_order_id: uuid.optional(),
          overrides: payload.optional(),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("cost_calculate", {
      _org: data.organizationId,
      _data: data.values as Json,
      _simulate: data.simulation,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CostCalculation;
  });
export const actCostVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ organizationId: uuid, id: uuid, action: z.enum(["approve", "publish", "archive"]) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("cost_version_action", {
      _org: data.organizationId,
      _id: data.id,
      _action: data.action,
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const simulatePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: uuid, values: payload }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("pricing_simulate", {
      _org: data.organizationId,
      _data: data.values as Json,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CostQueryResult;
  });
export const publishPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        values: z.object({
          price_table_id: uuid,
          variant_id: uuid,
          unit_price: z.number().positive(),
          valid_from: z.iso.date(),
          minimum_price: z.number().nonnegative().optional(),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("pricing_publish", {
      _org: data.organizationId,
      _data: data.values,
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const captureProfitability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ organizationId: uuid, sales: z.array(uuid).min(1).max(100) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("profitability_capture", {
      _org: data.organizationId,
      _data: { sales: data.sales },
    });
    if (error) throw new Error(error.message);
    return result;
  });
