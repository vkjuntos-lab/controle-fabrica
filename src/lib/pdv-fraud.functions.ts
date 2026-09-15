// Onda L — server functions do painel antifraude.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

/* ---------- Regras ---------- */
export const listFraudRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data, error } = await supabase.from("fraud_rules").select("*").order("weight", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const toggleSchema = z.object({ ruleId: z.string().uuid(), enabled: z.boolean() });
export const toggleFraudRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof toggleSchema>) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase.from("fraud_rules").update({ enabled: data.enabled }).eq("id", data.ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateRuleSchema = z.object({
  ruleId: z.string().uuid(),
  threshold: z.number().nullable().optional(),
  windowMinutes: z.number().int().nullable().optional(),
  action: z.enum(["block", "flag", "notify"]).optional(),
  weight: z.number().int().min(0).max(100).optional(),
});
export const updateFraudRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof updateRuleSchema>) => updateRuleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const patch: Record<string, any> = {};
    if (data.threshold !== undefined) patch.threshold = data.threshold;
    if (data.windowMinutes !== undefined) patch.window_minutes = data.windowMinutes;
    if (data.action) patch.action = data.action;
    if (data.weight !== undefined) patch.weight = data.weight;
    const { error } = await supabase.from("fraud_rules").update(patch).eq("id", data.ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Blocklist ---------- */
export const listBlocklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { data, error } = await supabase.from("fraud_blocklist").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const addBlockSchema = z.object({
  kind: z.enum(["cpf", "email", "phone", "ip"]),
  value: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(200).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export const addBlocklistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof addBlockSchema>) => addBlockSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const value = data.kind === "email" ? data.value.toLowerCase() : data.kind === "ip" ? data.value : data.value.replace(/\D+/g, "");
    const { error } = await supabase.from("fraud_blocklist").insert({
      kind: data.kind, value, reason: data.reason ?? null, expires_at: data.expiresAt ?? null, auto_added: false,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const removeBlockSchema = z.object({ id: z.string().uuid() });
export const removeBlocklistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof removeBlockSchema>) => removeBlockSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase.from("fraud_blocklist").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Eventos ---------- */
const listEventsSchema = z.object({
  action: z.enum(["all", "allow", "flag", "block", "pending_review"]).default("all"),
  limit: z.number().int().min(1).max(500).default(100),
});
export const listFraudEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<z.infer<typeof listEventsSchema>>) => listEventsSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    let q = supabase.from("fraud_events").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.action !== "all") q = q.eq("action_taken", data.action);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const reviewSchema = z.object({
  eventId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(300).optional(),
});
export const reviewFraudEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof reviewSchema>) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const { error } = await supabase.from("fraud_events").update({
      action_taken: data.approve ? "allow" : "block",
      reviewed_at: new Date().toISOString(),
      reviewed_by: (context as any).userId,
      review_note: data.note ?? null,
    } as any).eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- KPIs ---------- */
export const fraudStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase as AnyClient;
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: rows } = await supabase.from("fraud_events").select("action_taken, reasons").gte("created_at", since);
    const events = (rows ?? []) as any[];
    const total = events.length;
    const blocked = events.filter(e => e.action_taken === "block").length;
    const flagged = events.filter(e => e.action_taken === "flag" || e.action_taken === "pending_review").length;
    const reasonCount: Record<string, number> = {};
    for (const e of events) {
      for (const r of (e.reasons ?? [])) {
        const t = r?.type ?? "unknown";
        reasonCount[t] = (reasonCount[t] ?? 0) + 1;
      }
    }
    const topReasons = Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([type, count]) => ({ type, count }));
    return { total, blocked, flagged, blockRate: total ? blocked / total : 0, topReasons };
  });
