import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid();
const values = z.record(z.string(), z.json());
export const readSales = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
.inputValidator((i) => z.object({ organizationId: uuid, kind: z.string().max(40), id: uuid.optional(), filters: values.default({}) }).parse(i))
.handler(async ({data, context}) => {
 const result = data.kind === "detail" ? await context.supabase.rpc("sales_order_detail", {_org: data.organizationId, _order: uuid.parse(data.id)})
 : data.kind === "dashboard" ? await context.supabase.rpc("sales_dashboard", {_org: data.organizationId, _filters: data.filters})
 : await context.supabase.rpc("sales_query", {_org: data.organizationId, _kind: data.kind, _filters: data.filters});
 if(result.error) throw new Error(result.error.message);
 return result.data;
});
export const mutateSales = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
.inputValidator((i) => z.object({ organizationId: uuid, operation: z.enum(["save", "convert", "order", "reserve", "reservation", "fulfillment_create", "fulfillment", "scan", "confirm", "pack", "shipment_create", "dispatch", "shipment", "return_create", "return", "exception", "carrier", "settings", "expire"]), id: uuid.optional(), action: z.string().max(40).default(""), values: values.default({}), key: uuid }).parse(i))
.handler(async ({data, context}) => {
 const result = await context.supabase.rpc("sales_execute", {_org:data.organizationId,_operation:data.operation,_id:data.id ?? null,_action:data.action,_data:data.values,_key:data.key});
 if(result.error) throw new Error(result.error.message);
 return result.data;
});
