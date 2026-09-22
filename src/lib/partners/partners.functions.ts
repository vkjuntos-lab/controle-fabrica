import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type {
  PartnerDetail,
  PartnerList,
  OperationDetail,
  PositionList,
  PartnerSummary,
  PartnerReportList,
  PartnerMovementList,
} from "./types";
const org = z.string().uuid();
const filters = z.record(z.string(), z.string().max(200)).default({});
export const queryPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum([
          "companies",
          "company",
          "shipments",
          "shipment",
          "returns",
          "return",
          "positions",
          "dashboard",
          "shipment_report",
          "return_report",
          "history",
        ]),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("partner_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as
      | PartnerList
      | PartnerDetail
      | OperationDetail
      | PositionList
      | PartnerSummary
      | PartnerReportList
      | PartnerMovementList;
  });
const company = z.object({
  code: z.string().trim().min(1).max(40),
  legal_name: z.string().trim().min(2).max(180),
  trade_name: z.string().max(180).optional(),
  document_type: z.enum(["CNPJ", "CPF", "OTHER"]).optional(),
  document_number: z.string().max(80).optional(),
  state_registration: z.string().max(80).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().max(50).optional(),
  website: z.union([z.url(), z.literal("")]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]),
  blocked_reason: z.string().max(1000).optional(),
  roles: z.array(z.enum(["PARTNER", "CUSTOMER", "SUPPLIER", "RESELLER"])).min(1),
  settlement_frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"]),
  notes: z.string().max(4000).optional(),
});
export const savePartnerCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, id: org.optional(), company }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("partner_save_company", {
      _org: data.organizationId,
      _id: data.id,
      _data: data.company,
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const savePartnerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        companyId: org,
        id: org.optional(),
        kind: z.enum(["contact", "address"]),
        values: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("partner_save_detail", {
      _org: data.organizationId,
      _company: data.companyId,
      _id: data.id,
      _kind: data.kind,
      _data: data.values,
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const createPartnerOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["shipment", "return"]),
        operation: z.object({
          partner_id: org,
          source_location_id: org,
          destination_location_id: org,
          shipment_id: z.union([org, z.literal("")]).optional(),
          date: z.iso.date(),
          expected_delivery_date: z.union([z.iso.date(), z.literal("")]).optional(),
          carrier_name: z.string().max(180).optional(),
          tracking_code: z.string().max(180).optional(),
          notes: z.string().max(4000).optional(),
          items: z
            .array(
              z.object({
                variant_id: org,
                batch_id: org.nullable().optional(),
                quantity: z.number().positive().max(99999999999).multipleOf(0.001),
                condition: z.enum(["SELLABLE", "DAMAGED", "DEFECTIVE", "OTHER"]).optional(),
                reason: z.string().max(2000).optional(),
              }),
            )
            .min(1)
            .max(200),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("partner_create_operation", {
      _org: data.organizationId,
      _kind: data.kind,
      _data: data.operation,
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const actOnShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        id: org,
        action: z.enum(["approve", "start_picking", "pick", "ship", "receive", "cancel"]),
        values: z
          .object({
            item_id: org.optional(),
            quantity: z.number().nonnegative().optional(),
            received_by: z.string().max(180).optional(),
            delivered_at: z.iso.datetime().optional(),
          })
          .default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("partner_shipment_action", {
      _org: data.organizationId,
      _id: data.id,
      _action: data.action,
      _data: data.values,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });
export const receivePartnerReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: org, id: org }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("partner_receive_return", {
      _org: data.organizationId,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });
