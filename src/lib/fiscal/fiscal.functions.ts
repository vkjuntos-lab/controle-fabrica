import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const values = z.record(z.string(), z.json());
export const readFiscal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({ organizationId: uuid, kind: z.string().max(40), filters: values.default({}) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("fiscal_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });
export const mutateFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        organizationId: uuid,
        operation: z.string().max(40),
        id: uuid.optional(),
        values: values.default({}),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("fiscal_execute", {
      _org: data.organizationId,
      _operation: data.operation,
      _id: data.id ?? undefined,
      _data: data.values,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });
export const importFiscalXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        organizationId: uuid,
        establishmentId: uuid,
        supplierId: uuid,
        xml: z.string().min(1).max(2097152),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("fiscal_import_xml", {
      _org: data.organizationId,
      _est: data.establishmentId,
      _supplier: data.supplierId,
      _xml: data.xml,
    });
    if (r.error) throw new Error(r.error.message);
    const row = z.object({ xml_storage_path: z.string() }).parse(r.data);
    const storage = context.supabase.storage.from("fiscal-private");
    // Immutable path + SQL hash deduplication; failed uploads can be retried with the same bytes.
    const upload = await storage.upload(
      row.xml_storage_path,
      new Blob([data.xml], { type: "application/xml" }),
      { upsert: false, contentType: "application/xml" },
    );
    if (upload.error) {
      const existing = await storage.download(row.xml_storage_path);
      if (existing.error || (await existing.data.text()) !== data.xml)
        throw new Error(
          "Importação registrada, mas XML não arquivado. Reenvie o mesmo arquivo para concluir o armazenamento.",
        );
    }
    return r.data;
  });
export const downloadFiscalFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ path: z.string().min(1).max(600) }).parse(v))
  .handler(async ({ data, context }) => {
    const audit = await context.supabase.rpc("fiscal_record_download", { _path: data.path });
    if (audit.error) throw new Error(audit.error.message);
    const r = await context.supabase.storage.from("fiscal-private").createSignedUrl(data.path, 60);
    if (r.error) throw new Error(r.error.message);
    return r.data.signedUrl;
  });
export const exportFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        organizationId: uuid,
        kind: z.enum(["documents", "inbound", "reconciliations"]),
        filters: values.default({}),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("fiscal_execute", {
      _org: data.organizationId,
      _operation: "report",
      _data: { kind: data.kind, filters: data.filters },
    });
    if (r.error) throw new Error(r.error.message);
    return {
      disclaimer:
        "Relatório interno da página selecionada. Não substitui obrigação fiscal oficial.",
      rows: r.data,
    };
  });
