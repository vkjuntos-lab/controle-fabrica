// Onda N Sprint N3 — Campanhas
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listSegmentCustomers } from "./pdv-crm.functions";

type AnyClient = { from: (t: string) => any };

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows } = await supabase
      .from("campaigns")
      .select("*")
      .eq("store_id", data.store_id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { rows: rows ?? [] };
  });

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { id, store_id, ...rest } = data;
    if (!store_id) throw new Error("store_id é obrigatório");

    if (id) {
      const { error } = await supabase.from("campaigns").update(rest).eq("id", id).eq("store_id", store_id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: c, error } = await supabase.from("campaigns").insert({ ...rest, store_id }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: c.id };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; store_id: string }) => 
    z.object({ id: z.string().uuid(), store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    await supabase.from("campaigns").delete().eq("id", data.id).eq("store_id", data.store_id);
    return { ok: true };
  });

export const runCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; store_id: string }) => 
    z.object({ id: z.string().uuid(), store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: c } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .eq("store_id", data.store_id)
      .single();
      
    if (!c) throw new Error("Campanha não encontrada");
    await supabase.from("campaigns").update({ status: "running" }).eq("id", data.id);
    const audience = await listSegmentCustomers({ data: { key: c.segment_key } });

    let creds: any = null;
    let tpl: any = null;
    if (c.channel === "wa" && c.store_id) {
      const { data: s } = await supabase.from("wa_settings").select("*").eq("store_id", c.store_id).maybeSingle();
      creds = s ?? null;
      if (c.template_id) {
        const { data: t } = await supabase.from("wa_templates").select("*").eq("id", c.template_id).maybeSingle();
        tpl = t ?? null;
      }
    }

    let sent = 0, errs = 0;
    for (const cust of audience.rows) {
      const vars = {
        nome: cust.name ?? "",
        cpf: cust.cpf ?? "",
        telefone: cust.phone ?? "",
      };
      const msg = renderTemplate(c.template ?? "", vars);
      const paramsArr: string[] = Array.isArray(c.template_params)
        ? (c.template_params as string[]).map((p: string) => renderTemplate(p, vars))
        : [];

      let dispatchResult: { ok: boolean; error?: string; messageId?: string } = { ok: false, error: "not_sent" };
      try {
        if (c.channel === "wa" && creds?.active && cust.phone) {
          const { sendWhatsAppWithCreds } = await import("./wa-driver.server");
          dispatchResult = await sendWhatsAppWithCreds(
            {
              provider: creds.provider,
              active: creds.active,
              cloud_token: creds.cloud_token,
              cloud_phone_id: creds.cloud_phone_id,
              cloud_template_name: tpl?.name ?? creds.cloud_template_name,
              cloud_template_lang: tpl?.language ?? creds.cloud_template_lang,
              zapi_instance_id: creds.zapi_instance_id,
              zapi_token: creds.zapi_token,
              zapi_client_token: creds.zapi_client_token,
            },
            cust.phone,
            msg,
            tpl ? { useTemplate: true, templateParams: paramsArr } : {},
          );
        } else {
          dispatchResult = { ok: true };
        }

        await supabase.from("campaign_deliveries").insert({
          campaign_id: c.id,
          customer_id: cust.id,
          store_id: data.store_id,
          channel: c.channel,
          status: dispatchResult.ok ? "sent" : "error",
          sent_at: dispatchResult.ok ? new Date().toISOString() : null,
          error: dispatchResult.ok ? null : dispatchResult.error ?? "erro",
        } as any);
        if (dispatchResult.ok) sent += 1; else errs += 1;
      } catch (e: any) {
        errs += 1;
        await supabase.from("campaign_deliveries").insert({
          campaign_id: c.id,
          customer_id: cust.id,
          store_id: data.store_id,
          channel: c.channel,
          status: "error",
          error: e.message ?? "erro",
        } as any);
      }
    }
    await supabase.from("campaigns").update({
      status: "done", sent_count: sent, error_count: errs,
    }).eq("id", data.id);
    return { sent, errs };
  });

export const listCampaignDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaign_id: string; store_id: string }) => 
    z.object({ campaign_id: z.string().uuid(), store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data: rows } = await supabase.from("campaign_deliveries")
      .select("*, customers:customer_id(name)")
      .eq("campaign_id", data.campaign_id)
      .eq("store_id", data.store_id)
      .order("created_at", { ascending: false }).limit(500);
    return { rows: rows ?? [] };
  });
