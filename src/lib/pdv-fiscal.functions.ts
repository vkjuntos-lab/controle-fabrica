// Onda O — server functions fiscais
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

/* ============ SETTINGS ============ */
export const getFiscalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id?: string | null }) =>
    z.object({ store_id: z.string().uuid().optional().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const q = supabase.from("fiscal_settings").select("*");
    if (data.store_id) q.eq("store_id", data.store_id);
    const { data: row } = await q.order("created_at").limit(1).maybeSingle();
    return { settings: row };
  });

export const upsertFiscalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { id, ...rest } = data ?? {};
    if (id) {
      const { error } = await supabase.from("fiscal_settings").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabase.from("fiscal_settings").insert(rest).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

/* ============ TAX PROFILES ============ */
export const listTaxProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data } = await supabase.from("fiscal_tax_profiles").select("*").order("name");
    return { rows: data ?? [] };
  });

export const saveTaxProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { id, ...rest } = data ?? {};
    if (id) {
      const { error } = await supabase.from("fiscal_tax_profiles").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabase.from("fiscal_tax_profiles").insert(rest).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteTaxProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase.from("fiscal_tax_profiles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ DOCUMENTS ============ */
export const listFiscalDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; days?: number }) =>
    z.object({ status: z.string().optional(), days: z.number().int().positive().max(365).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const since = new Date(Date.now() - (data.days ?? 30) * 86400_000).toISOString();
    let q = supabase.from("fiscal_documents").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const getFiscalDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: doc } = await supabase.from("fiscal_documents").select("*").eq("id", data.id).maybeSingle();
    return { doc };
  });

/* ============ EMIT NFC-e ============ */
export const emitNFCeForSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sale_id: string; store_id?: string | null; customer?: any }) =>
    z.object({ sale_id: z.string().uuid(), store_id: z.string().uuid().optional().nullable(), customer: z.any().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;

    const { getProvider } = await import("./fiscal/registry.server");

    // Settings
    const { data: settings } = await supabase.from("fiscal_settings").select("*")
      .eq("store_id", data.store_id ?? null).limit(1).maybeSingle();
    if (!settings) throw new Error("Configuração fiscal não encontrada para a loja.");

    // Sale + items simplificado: usa `sales.items` (jsonb) se existir; caso não, aborta.
    const { data: sale } = await supabase.from("sales").select("*").eq("id", data.sale_id).maybeSingle();
    if (!sale) throw new Error("Venda não encontrada.");
    const rawItems: any[] = Array.isArray(sale.items) ? sale.items : (sale.items?.items ?? []);
    if (rawItems.length === 0) throw new Error("Venda sem itens fiscais.");

    // Enriquecer com perfis fiscais
    const productIds = rawItems.map((i) => i.product_id).filter(Boolean);
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, ncm, cest, unit_commercial, tax_profile_id").in("id", productIds)
      : { data: [] as any[] };
    const pmap = new Map((products ?? []).map((p: any) => [p.id, p]));
    const profileIds = Array.from(new Set((products ?? []).map((p: any) => p.tax_profile_id).filter(Boolean)));
    const { data: profiles } = profileIds.length
      ? await supabase.from("fiscal_tax_profiles").select("*").in("id", profileIds)
      : { data: [] as any[] };
    const prmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    // Alocar número
    const numero = settings.nfce_next_number;
    const serie = settings.nfce_serie;

    // Insere doc pendente (reserva número)
    const { data: doc, error: insErr } = await supabase.from("fiscal_documents").insert({
      store_id: data.store_id ?? null,
      sale_id: data.sale_id,
      customer_id: data.customer?.id ?? null,
      kind: "nfce",
      serie, numero,
      status: "processing",
      environment: settings.environment,
      total_value: sale.total ?? 0,
      reference: `sale-${data.sale_id}`,
      provider: settings.provider,
    }).select("*").single();
    if (insErr) throw new Error(insErr.message);

    await supabase.from("fiscal_settings").update({ nfce_next_number: numero + 1 }).eq("id", settings.id);

    const provider = getProvider(settings.provider);
    const result = await provider.emitNFCe({
      ref: `sale-${data.sale_id}`,
      serie, numero,
      environment: settings.environment,
      emitter: {
        cnpj: settings.cnpj, ie: settings.ie, razao_social: settings.razao_social,
        nome_fantasia: settings.nome_fantasia, uf: settings.uf, municipio: settings.municipio,
        cep: settings.cep, endereco: settings.endereco, regime: settings.regime,
        csc_id: settings.csc_id, csc_token: settings.csc_token,
      },
      customer: data.customer ?? null,
      items: rawItems.map((it) => {
        const p = pmap.get(it.product_id) as any;
        const prof = p?.tax_profile_id ? (prmap.get(p.tax_profile_id) as any) : null;
        return {
          code: it.sku ?? it.product_id ?? "SEM-COD",
          description: it.name ?? it.description ?? "Item",
          ncm: p?.ncm ?? null, cest: p?.cest ?? null,
          cfop: prof?.cfop ?? "5102",
          unit: p?.unit_commercial ?? "UN",
          qty: Number(it.qty ?? 1), unit_price: Number(it.unit_price ?? it.price ?? 0),
          csosn: prof?.csosn ?? null, cst_icms: prof?.cst_icms ?? null,
          origem: prof?.origem ?? 0,
          icms_aliq: Number(prof?.icms_aliq ?? 0),
          pis_aliq: Number(prof?.pis_aliq ?? 0),
          cofins_aliq: Number(prof?.cofins_aliq ?? 0),
        };
      }),
      payments: (sale.payments ?? [{ method: "dinheiro", amount: sale.total ?? 0 }]),
      total: Number(sale.total ?? 0),
    });

    if (result.status === "authorized") {
      await supabase.from("fiscal_documents").update({
        status: "authorized",
        chave: result.chave, protocolo: result.protocolo,
        qrcode_url: result.qrcode_url, danfe_url: result.danfe_url,
        xml_authorized: result.xml, provider_ref: result.provider_ref,
        emitted_at: new Date().toISOString(),
      }).eq("id", doc.id);
    } else if (result.status === "contingency") {
      await supabase.from("fiscal_documents").update({ status: "contingency", error_msg: result.error }).eq("id", doc.id);
      await supabase.from("fiscal_queue").insert({ document_id: doc.id, last_error: result.error });
    } else if (result.status === "processing") {
      await supabase.from("fiscal_documents").update({ status: "processing", provider_ref: result.provider_ref }).eq("id", doc.id);
      await supabase.from("fiscal_queue").insert({ document_id: doc.id });
    } else {
      await supabase.from("fiscal_documents").update({ status: "rejected", error_msg: result.error }).eq("id", doc.id);
    }

    return { doc_id: doc.id, status: result.status, chave: result.chave, qrcode_url: result.qrcode_url, danfe_url: result.danfe_url, error: result.error };
  });

/* ============ EMIT NFC-e diretamente do carrinho (sem sale persistida) ============ */
export const emitNFCeFromCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    store_id: z.string().uuid().nullable().optional(),
    reference: z.string().min(1),
    total: z.number().nonnegative(),
    customer: z.object({
      id: z.string().uuid().optional().nullable(),
      name: z.string().optional().nullable(),
      cpf: z.string().optional().nullable(),
      cnpj: z.string().optional().nullable(),
    }).partial().optional().nullable(),
    items: z.array(z.object({
      sku: z.string().optional().nullable(),
      product_id: z.string().uuid().optional().nullable(),
      name: z.string(),
      qty: z.number().positive(),
      unit_price: z.number().nonnegative(),
    })).min(1),
    payments: z.array(z.object({
      method: z.string(),
      amount: z.number().nonnegative(),
    })).min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { getProvider } = await import("./fiscal/registry.server");

    let sq = supabase.from("fiscal_settings").select("*");
    if (data.store_id) sq = sq.eq("store_id", data.store_id);
    const { data: settings } = await sq.order("created_at").limit(1).maybeSingle();
    if (!settings) throw new Error("Configuração fiscal não encontrada. Configure em /pdv/fiscal/config.");

    // Enriquecer com perfis fiscais
    const productIds = data.items.map((i) => i.product_id).filter(Boolean) as string[];
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, ncm, cest, unit_commercial, tax_profile_id").in("id", productIds)
      : { data: [] as any[] };
    const pmap = new Map((products ?? []).map((p: any) => [p.id, p]));
    const profileIds = Array.from(new Set((products ?? []).map((p: any) => p.tax_profile_id).filter(Boolean)));
    const { data: profiles } = profileIds.length
      ? await supabase.from("fiscal_tax_profiles").select("*").in("id", profileIds)
      : { data: [] as any[] };
    const prmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const numero = settings.nfce_next_number;
    const serie = settings.nfce_serie;

    const { data: doc, error: insErr } = await supabase.from("fiscal_documents").insert({
      store_id: data.store_id ?? null,
      customer_id: data.customer?.id ?? null,
      kind: "nfce",
      serie, numero,
      status: "processing",
      environment: settings.environment,
      total_value: data.total,
      reference: data.reference,
      provider: settings.provider,
    }).select("*").single();
    if (insErr) throw new Error(insErr.message);

    await supabase.from("fiscal_settings").update({ nfce_next_number: numero + 1 }).eq("id", settings.id);

    const provider = getProvider(settings.provider);
    const result = await provider.emitNFCe({
      ref: data.reference,
      serie, numero,
      environment: settings.environment,
      emitter: {
        cnpj: settings.cnpj, ie: settings.ie, razao_social: settings.razao_social,
        nome_fantasia: settings.nome_fantasia, uf: settings.uf, municipio: settings.municipio,
        cep: settings.cep, endereco: settings.endereco, regime: settings.regime,
        csc_id: settings.csc_id, csc_token: settings.csc_token,
      },
      customer: data.customer ?? null,
      items: data.items.map((it) => {
        const p = it.product_id ? (pmap.get(it.product_id) as any) : null;
        const prof = p?.tax_profile_id ? (prmap.get(p.tax_profile_id) as any) : null;
        return {
          code: it.sku ?? it.product_id ?? "SEM-COD",
          description: it.name,
          ncm: p?.ncm ?? null, cest: p?.cest ?? null,
          cfop: prof?.cfop ?? "5102",
          unit: p?.unit_commercial ?? "UN",
          qty: it.qty, unit_price: it.unit_price,
          csosn: prof?.csosn ?? null, cst_icms: prof?.cst_icms ?? null,
          origem: prof?.origem ?? 0,
          icms_aliq: Number(prof?.icms_aliq ?? 0),
          pis_aliq: Number(prof?.pis_aliq ?? 0),
          cofins_aliq: Number(prof?.cofins_aliq ?? 0),
        };
      }),
      payments: data.payments,
      total: data.total,
    });

    const patch: any = {};
    if (result.status === "authorized") {
      Object.assign(patch, {
        status: "authorized",
        chave: result.chave, protocolo: result.protocolo,
        qrcode_url: result.qrcode_url, danfe_url: result.danfe_url,
        xml_authorized: result.xml, provider_ref: result.provider_ref,
        emitted_at: new Date().toISOString(),
      });
    } else if (result.status === "contingency") {
      Object.assign(patch, { status: "contingency", error_msg: result.error });
      await supabase.from("fiscal_queue").insert({ document_id: doc.id, last_error: result.error });
    } else if (result.status === "processing") {
      Object.assign(patch, { status: "processing", provider_ref: result.provider_ref });
      await supabase.from("fiscal_queue").insert({ document_id: doc.id });
    } else {
      Object.assign(patch, { status: "rejected", error_msg: result.error });
    }
    await supabase.from("fiscal_documents").update(patch).eq("id", doc.id);

    return {
      doc_id: doc.id,
      status: result.status,
      chave: result.chave,
      qrcode_url: result.qrcode_url,
      danfe_url: result.danfe_url,
      error: result.error,
      numero, serie,
      environment: settings.environment,
    };
  });

/* ============ Upload/gestão de certificado A1 ============ */
export const setFiscalCertRef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { settings_id: string; cert_path: string; cert_pass_secret_name?: string | null }) =>
    z.object({
      settings_id: z.string().uuid(),
      cert_path: z.string().min(1),
      cert_pass_secret_name: z.string().max(256).optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase.from("fiscal_settings").update({
      cert_secret_name: data.cert_path,
      cert_pass_secret_name: data.cert_pass_secret_name ?? null,
    }).eq("id", data.settings_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ CANCEL ============ */
export const cancelFiscalDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; motivo: string }) =>
    z.object({ id: z.string().uuid(), motivo: z.string().min(15, "Justificativa >= 15 chars") }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { getProvider } = await import("./fiscal/registry.server");
    const { data: doc } = await supabase.from("fiscal_documents").select("*").eq("id", data.id).single();
    if (!doc?.chave) throw new Error("Documento sem chave para cancelar.");
    const provider = getProvider(doc.provider);
    const r = await provider.cancelDoc({ ref: doc.reference ?? doc.id, chave: doc.chave, motivo: data.motivo, environment: doc.environment });
    if (r.status === "cancelled") {
      await supabase.from("fiscal_documents").update({
        status: "cancelled", cancelled_at: new Date().toISOString(),
        xml_cancelled: r.xml, protocolo: r.protocolo ?? doc.protocolo,
      }).eq("id", doc.id);
      return { ok: true };
    }
    throw new Error(r.error ?? "Falha ao cancelar");
  });

/* ============ RESEND QUEUE ============ */
export const resendPendingDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: queue } = await supabase.from("fiscal_queue").select("*, fiscal_documents(*)").limit(20);
    let processed = 0;
    for (const q of (queue ?? []) as any[]) {
      await supabase.from("fiscal_queue").update({ attempts: (q.attempts ?? 0) + 1, next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", q.id);
      processed++;
    }
    return { processed };
  });

/* ============ SEFAZ status ============ */
export const querySefazStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uf?: string }) => z.object({ uf: z.string().length(2).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { getProvider } = await import("./fiscal/registry.server");
    const { data: settings } = await supabase.from("fiscal_settings").select("*").limit(1).maybeSingle();
    const uf = data.uf ?? settings?.uf ?? "SP";
    const env = settings?.environment ?? "homologacao";
    const provider = getProvider(settings?.provider);
    const st = await provider.queryStatus(uf, env);
    return { uf, env, ...st };
  });

/* ============ SPED / EXPORT ============ */
export const exportSpedFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { month: string }) =>
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM") }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const [y, m] = data.month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 1)).toISOString();
    const { data: docs } = await supabase.from("fiscal_documents").select("*")
      .eq("status", "authorized")
      .gte("emitted_at", start).lt("emitted_at", end)
      .order("numero");

    // Bloco 0 e C simplificados — suficiente para o contador enxergar itens; validação final Sped Fiscal via PVA/Contador.
    const lines: string[] = [];
    lines.push(`|0000|017|0|${data.month.replace("-", "01")}|${(data.month + "-31").replace(/-/g, "")}|EMPRESA|CNPJ|UF|IE|COD_MUN|IM|SUFRAMA||A|1|`);
    lines.push(`|0001|0|`);
    lines.push(`|0990|${2 + (docs?.length ?? 0)}|`);
    lines.push(`|C001|0|`);
    for (const d of (docs ?? []) as any[]) {
      lines.push(`|C100|1|1||55|00|${d.serie}|${d.numero}|${d.chave ?? ""}|${(d.emitted_at ?? "").slice(0, 10).replace(/-/g, "")}|${(d.emitted_at ?? "").slice(0, 10).replace(/-/g, "")}|${Number(d.total_value).toFixed(2)}|0|||0|0|0|0|0|0|0|0|0|0|0|0|0|0|`);
    }
    lines.push(`|C990|${2 + (docs?.length ?? 0)}|`);
    lines.push(`|9001|0|`);
    lines.push(`|9999|${lines.length + 1}|`);

    return { filename: `SPED_${data.month}.txt`, content: lines.join("\n"), count: docs?.length ?? 0 };
  });
