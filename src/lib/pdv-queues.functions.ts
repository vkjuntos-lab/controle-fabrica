// Onda 2 — Filas de atendimento e métricas TME/TMA.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { supabase: any; userId: string };

export const listQueues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) =>
    z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: rows, error } = await supabase
      .from("wa_queues")
      .select("*")
      .eq("store_id", data.store_id)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return { queues: rows ?? [] };
  });

const queueInput = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  description: z.string().max(240).nullable().optional(),
  color: z.string().default("#8D6E63"),
  sla_first_response_seconds: z.number().int().min(30).max(86400).default(300),
  sla_resolution_seconds: z.number().int().min(60).max(604800).default(3600),
  is_default: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const upsertQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => queueInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    if (data.is_default) {
      // Garante apenas uma default por loja
      await supabase.from("wa_queues").update({ is_default: false })
        .eq("store_id", data.store_id).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { data: row, error } = await supabase
      .from("wa_queues")
      .upsert(data, { onConflict: "id" })
      .select().single();
    if (error) throw new Error(error.message);
    return { queue: row };
  });

export const deleteQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("wa_queues").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignConversationQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; queue_id: string | null }) =>
    z.object({ conversation_id: z.string().uuid(), queue_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("wa_conversations")
      .update({ queue_id: data.queue_id })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getQueueMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) =>
    z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [{ data: queues }, { data: metrics }] = await Promise.all([
      supabase.from("wa_queues").select("id,name,color,sla_first_response_seconds,sla_resolution_seconds,is_default,active")
        .eq("store_id", data.store_id),
      supabase.from("wa_queue_metrics_24h").select("*").eq("store_id", data.store_id),
    ]);

    // Totais globais da loja (últimas 24h)
    const totals = (metrics ?? []).reduce((acc: any, m: any) => {
      acc.open += Number(m.open_count ?? 0);
      acc.waiting += Number(m.waiting_count ?? 0);
      acc.answered += Number(m.answered_count ?? 0);
      acc.closed += Number(m.closed_count ?? 0);
      acc.sla_breached += Number(m.sla_breached ?? 0);
      if (m.tme_seconds != null) { acc._tme_sum += Number(m.tme_seconds) * Number(m.answered_count ?? 1); acc._tme_n += Number(m.answered_count ?? 1); }
      if (m.tma_seconds != null) { acc._tma_sum += Number(m.tma_seconds) * Number(m.closed_count ?? 1); acc._tma_n += Number(m.closed_count ?? 1); }
      return acc;
    }, { open: 0, waiting: 0, answered: 0, closed: 0, sla_breached: 0, _tme_sum: 0, _tme_n: 0, _tma_sum: 0, _tma_n: 0 });

    return {
      queues: queues ?? [],
      metrics: metrics ?? [],
      totals: {
        open: totals.open,
        waiting: totals.waiting,
        answered: totals.answered,
        closed: totals.closed,
        sla_breached: totals.sla_breached,
        tme_seconds: totals._tme_n > 0 ? totals._tme_sum / totals._tme_n : null,
        tma_seconds: totals._tma_n > 0 ? totals._tma_sum / totals._tma_n : null,
      },
    };
  });
