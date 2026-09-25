import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
export type PlanningRow = { id: string; [key: string]: Json | undefined };
export type PlanningResult = {
  rows?: PlanningRow[];
  total?: number;
  [key: string]: Json | PlanningRow[] | undefined;
};
const org = z.string().uuid();
const payload = z.record(z.string(), z.json());
export const queryPlanning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: org,
        kind: z.enum([
          "dashboard",
          "options",
          "runs",
          "run",
          "forecasts",
          "compare",
          "channels",
          "orders",
          "requirements",
          "shortages",
          "exceptions",
          "projections",
          "items",
          "facts",
          "conversions",
        ]),
        filters: z.record(z.string(), z.string().max(1000)).default({}),
        page: z.number().int().min(1).max(1000000).default(1),
        export: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("planning_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
      _export: data.export,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PlanningResult;
  });
export const savePlanning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: org,
        kind: z.enum([
          "settings",
          "availability",
          "scenario",
          "forecast",
          "variant",
          "supplier_product",
        ]),
        values: payload,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("planning_save", {
      _org: data.organizationId,
      _kind: data.kind,
      _data: data.values as Json,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PlanningResult;
  });
export const executePlanning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: org,
        values: z.object({
          name: z.string().trim().min(1).max(200),
          idempotency_key: z.string().uuid(),
          horizon_start: z.iso.date(),
          horizon_end: z.iso.date(),
          scenario_id: org.optional(),
          simulated: z.boolean().default(false),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("planning_execute", {
      _org: data.organizationId,
      _data: data.values,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PlanningResult;
  });
export const actPlanningOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: org,
        id: org,
        action: z.enum(["review", "approve", "dismiss", "convert"]),
        values: payload,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("planning_order_action", {
      _org: data.organizationId,
      _id: data.id,
      _action: data.action,
      _data: data.values as Json,
    });
    if (error) throw new Error(error.message);
    return result as unknown as PlanningResult;
  });
export const actPlanningException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: org,
        id: org,
        action: z.enum(["resolve", "ignore", "reopen"]),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("planning_exception_action", {
      _org: data.organizationId,
      _id: data.id,
      _action: data.action,
      _data: { reason: data.reason },
    });
    if (error) throw new Error(error.message);
    return result;
  });
