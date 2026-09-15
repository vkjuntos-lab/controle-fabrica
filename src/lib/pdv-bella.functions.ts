// Server functions do painel Bella IA (dashboard, leads, campanhas, prompts, conhecimento).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StoreInput = (d: unknown) => z.object({ store_id: z.string().uuid() }).parse(d);

/** KPIs do dashboard da Bella. */
export const getBellaDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(StoreInput)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const storeId = data.store_id;
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [convs, msgs, leads, orders, camps, handoffs] = await Promise.all([
      supabase.from("wa_conversations").select("id,channel,updated_at,handoff_to_human", { count: "exact" })
        .eq("store_id", storeId).gte("updated_at", since7d),
      supabase.from("wa_messages").select("id,direction,channel,created_at", { count: "exact" })
        .gte("created_at", since24h),
      supabase.from("bella_leads").select("id,stage,channel,created_at", { count: "exact" })
        .eq("store_id", storeId).gte("created_at", since7d),
      supabase.from("payment_links").select("id,amount,paid_amount,status,created_at,wa_conversation_id")
        .eq("store_id", storeId).not("wa_conversation_id", "is", null).gte("created_at", since7d),
      supabase.from("bella_campaign_runs").select("id,campaign_type,send_ok,created_at", { count: "exact" })
        .eq("store_id", storeId).gte("created_at", since7d),
      supabase.from("wa_conversations").select("id", { count: "exact" })
        .eq("store_id", storeId).eq("handoff_to_human", true),
    ]);

    const ordersRows = (orders.data as any[]) ?? [];
    const paid = ordersRows.filter((o) => o.status === "paid");
    const gmv = paid.reduce((s, o) => s + Number(o.paid_amount ?? o.amount ?? 0), 0);
    const campsRows = (camps.data as any[]) ?? [];

    return {
      kpis: {
        conversations_7d: convs.count ?? 0,
        messages_24h: msgs.count ?? 0,
        leads_7d: leads.count ?? 0,
        orders_7d: ordersRows.length,
        orders_paid_7d: paid.length,
        gmv_7d: gmv,
        campaigns_7d: campsRows.length,
        campaigns_ok: campsRows.filter((c) => c.send_ok).length,
        handoffs_active: handoffs.count ?? 0,
      },
      channels: {
        whatsapp: ((convs.data as any[]) ?? []).filter((c) => c.channel !== "instagram").length,
        instagram: ((convs.data as any[]) ?? []).filter((c) => c.channel === "instagram").length,
      },
      leads_by_stage: ((leads.data as any[]) ?? []).reduce<Record<string, number>>((acc, r: any) => {
        acc[r.stage] = (acc[r.stage] ?? 0) + 1; return acc;
      }, {}),
    };
  });

export const listBellaLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(StoreInput)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase.from("bella_leads")
      .select("id,contact,name,channel,stage,interest,reason,last_interaction_at,created_at,customer_id,conversation_id")
      .eq("store_id", data.store_id)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { leads: rows ?? [] };
  });

export const updateBellaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    lead_id: z.string().uuid(),
    stage: z.enum(["new","qualified","negotiating","won","lost","handoff"]).optional(),
    reason: z.string().max(500).optional(),
    interest: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.stage) patch.stage = data.stage;
    if (data.reason !== undefined) patch.reason = data.reason;
    if (data.interest !== undefined) patch.interest = data.interest;
    const { error } = await supabase.from("bella_leads").update(patch).eq("id", data.lead_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBellaCampaignRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(StoreInput)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase.from("bella_campaign_runs")
      .select("id,campaign_type,channel,stage,coupon_code,message_text,send_ok,send_error,created_at,conversation_id,customer_id")
      .eq("store_id", data.store_id)
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });

export const triggerBellaCampaignsTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Chama o próprio endpoint público em background (não bloqueia).
    try {
      const base = process.env.PUBLIC_APP_URL ?? "https://project--2bff89e1-7464-48ef-a026-6814e05c6ee1.lovable.app";
      const res = await fetch(`${base}/api/public/bella-campaigns-tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, ...body };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

// ---------- Prompts ----------
export const listBellaPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(StoreInput)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase.from("bella_prompts")
      .select("id,title,body,is_active,version,created_at,updated_at")
      .eq("store_id", data.store_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { prompts: rows ?? [] };
  });

export const saveBellaPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    store_id: z.string().uuid(),
    title: z.string().min(1).max(120),
    body: z.string().min(10).max(20000),
    is_active: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    if (data.id) {
      const { error } = await supabase.from("bella_prompts")
        .update({ title: data.title, body: data.body, is_active: data.is_active ?? false })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("bella_prompts").insert({
        store_id: data.store_id, title: data.title, body: data.body, is_active: data.is_active ?? false,
      });
      if (error) throw new Error(error.message);
    }
    // Garante um único prompt ativo por loja
    if (data.is_active) {
      await supabase.from("bella_prompts").update({ is_active: false })
        .eq("store_id", data.store_id).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    return { ok: true };
  });

// ---------- Conhecimento ----------
export const listBellaKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(StoreInput)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase.from("bella_knowledge")
      .select("id,topic,question,answer,tags,active,updated_at")
      .eq("store_id", data.store_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const saveBellaKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    store_id: z.string().uuid(),
    topic: z.string().min(1).max(120),
    question: z.string().max(500).optional().nullable(),
    answer: z.string().min(1).max(5000),
    active: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    if (data.id) {
      const { error } = await supabase.from("bella_knowledge")
        .update({ topic: data.topic, question: data.question ?? null, answer: data.answer, active: data.active ?? true })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("bella_knowledge").insert({
        store_id: data.store_id, topic: data.topic, question: data.question ?? null,
        answer: data.answer, active: data.active ?? true,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteBellaKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase.from("bella_knowledge").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
