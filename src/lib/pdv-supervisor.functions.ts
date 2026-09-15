// Onda 7 — Supervisor de IA: auditoria de conversas Bella, CSAT e treinamento.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/** KPIs do supervisor (CSAT médio, escalonamentos, backlog de revisão). */
export const getSupervisorKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string; days?: number }) =>
    z.object({ store_id: z.string().uuid(), days: z.number().int().min(1).max(180).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();

    const { data: rows } = await supabase
      .from("bella_reviews")
      .select("status,csat_score,escalation_reason,created_at")
      .eq("store_id", data.store_id)
      .gte("created_at", since);

    const list = rows ?? [];
    const csatVals = list.map((r: any) => r.csat_score).filter((v: number | null) => typeof v === "number") as number[];
    const csatAvg = csatVals.length ? csatVals.reduce((a, b) => a + b, 0) / csatVals.length : null;
    const kpis = {
      total: list.length,
      pending: list.filter((r: any) => r.status === "pending").length,
      escalated: list.filter((r: any) => r.status === "escalated").length,
      needs_training: list.filter((r: any) => r.status === "needs_training").length,
      approved: list.filter((r: any) => r.status === "approved").length,
      csat_avg: csatAvg ? Number(csatAvg.toFixed(2)) : null,
      csat_count: csatVals.length,
    };
    return { kpis };
  });

/** Lista conversas para revisão + suas mensagens (preview). */
export const listReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string; status?: "pending" | "approved" | "needs_training" | "escalated" | "all" }) =>
    z.object({
      store_id: z.string().uuid(),
      status: z.enum(["pending","approved","needs_training","escalated","all"]).default("pending"),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let q = supabase
      .from("bella_reviews")
      .select("id,conversation_id,status,csat_score,csat_comment,escalation_reason,auto_flag_reason,reviewer_notes,reviewed_at,created_at")
      .eq("store_id", data.store_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: reviews, error } = await q;
    if (error) throw new Error(error.message);

    const convIds = (reviews ?? []).map((r: any) => r.conversation_id);
    const convMap = new Map<string, any>();
    if (convIds.length) {
      const { data: convs } = await supabase
        .from("wa_conversations")
        .select("id,phone,wa_name,channel,handoff_reason,last_snippet,updated_at")
        .in("id", convIds);
      (convs ?? []).forEach((c: any) => convMap.set(c.id, c));
    }
    return { reviews: (reviews ?? []).map((r: any) => ({ ...r, conversation: convMap.get(r.conversation_id) ?? null })) };
  });

/** Últimas mensagens de uma conversa (para o painel de revisão). */
export const getReviewMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: rows } = await supabase
      .from("wa_messages")
      .select("direction,text,created_at,meta")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(200);
    return { messages: rows ?? [] };
  });

/** Grava a decisão do supervisor. */
export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    review_id: string;
    status: "approved" | "needs_training" | "escalated";
    reviewer_notes?: string | null;
    csat_score?: number | null;
  }) =>
    z.object({
      review_id: z.string().uuid(),
      status: z.enum(["approved","needs_training","escalated"]),
      reviewer_notes: z.string().max(2000).nullish(),
      csat_score: z.number().int().min(1).max(5).nullish(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("bella_reviews").update({
      status: data.status,
      reviewer_notes: data.reviewer_notes ?? null,
      csat_score: data.csat_score ?? null,
      reviewer_id: userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.review_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Promove uma conversa revisada para a base de conhecimento (retreino manual). */
export const promoteToKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { review_id: string; topic: string; question: string; answer: string; tags?: string[] }) =>
    z.object({
      review_id: z.string().uuid(),
      topic: z.string().min(1).max(80),
      question: z.string().min(1).max(500),
      answer: z.string().min(1).max(3000),
      tags: z.array(z.string()).max(10).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: rev, error: e1 } = await supabase
      .from("bella_reviews").select("store_id").eq("id", data.review_id).single();
    if (e1 || !rev) throw new Error(e1?.message ?? "review not found");
    const { error: e2 } = await supabase.from("bella_knowledge").insert({
      store_id: rev.store_id,
      topic: data.topic,
      question: data.question,
      answer: data.answer,
      tags: data.tags ?? [],
      active: true,
    });
    if (e2) throw new Error(e2.message);
    await supabase.from("bella_reviews").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
    }).eq("id", data.review_id);
    return { ok: true };
  });
