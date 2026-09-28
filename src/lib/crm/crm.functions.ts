import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
export type CrmRow = Record<string, Json | undefined> & { id: string };
export type CrmResult = {
  rows?: CrmRow[];
  total?: number;
  [key: string]: Json | CrmRow[] | undefined;
};
const uuid = z.string().uuid();
const values = z.record(z.string(), z.json());
export const queryCrm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        kind: z.string().min(1).max(60),
        filters: values.default({}),
        page: z.number().int().min(1).default(1),
        export: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters as Json,
      _page: data.page,
      _export: data.export,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CrmResult;
  });
export const saveCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ organizationId: uuid, kind: z.string().max(60), values }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_save", {
      _org: data.organizationId,
      _kind: data.kind,
      _data: data.values as Json,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CrmResult;
  });
export const actCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        kind: z.enum(["lead", "portfolio", "opportunity", "quote"]),
        id: uuid.nullable(),
        action: z.string().max(40),
        values: values.default({}),
        key: uuid,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_action", {
      _org: data.organizationId,
      _kind: data.kind,
      _id: data.id as string,
      _action: data.action,
      _data: data.values as Json,
      _key: data.key,
    });
    if (error) throw new Error(error.message);
    return result as unknown as CrmResult;
  });

export const prepareCrmDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        organizationId: uuid,
        companyId: uuid,
        key: uuid,
        name: z.string().trim().min(1).max(200),
        mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
        size: z.number().int().positive().max(10485760),
        purpose: z.string().trim().min(1).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_document", {
      _org: data.organizationId,
      _action: "prepare",
      _data: {
        company_id: data.companyId,
        key: data.key,
        name: data.name,
        mime_type: data.mimeType,
        size_bytes: data.size,
        purpose: data.purpose,
      },
    });
    if (error) throw new Error(error.message);
    return result as unknown as CrmRow;
  });
export const finishCrmDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: uuid, id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_document", {
      _org: data.organizationId,
      _action: "complete",
      _data: { id: data.id },
    });
    if (error) throw new Error(error.message);
    return result;
  });
export const downloadCrmDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: uuid, id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_document", {
      _org: data.organizationId,
      _action: "download",
      _data: { id: data.id },
    });
    if (error) throw new Error(error.message);
    const doc = result as unknown as CrmRow;
    const signed = await context.supabase.storage
      .from("crm-documents")
      .createSignedUrl(String(doc.storage_path), 60, { download: String(doc.name) });
    if (signed.error) throw new Error(signed.error.message);
    return signed.data.signedUrl;
  });
