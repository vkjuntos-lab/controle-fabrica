import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StoreInput = z.object({ store_id: z.string().uuid() });

/** CRM: Kanban, Tags e Scheduled Messages */

export const getKanbanBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, name, phone, kanban_stage, value_potential, tags")
      .eq("store_id", data.store_id);
    if (error) throw new Error(error.message);
    
    // Agrupar por estágio
    const board: Record<string, any[]> = {
      "novo": [],
      "contato feito": [],
      "negociacao": [],
      "fechado": []
    };

    (customers ?? []).forEach((c: any) => {
      const stage = (c.kanban_stage || "novo").toLowerCase();
      if (board[stage]) board[stage].push(c);
      else board["novo"].push(c);
    });

    return { board };
  });

export const updateKanbanStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    customer_id: z.string().uuid(),
    stage: z.string()
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase
      .from("customers")
      .update({ kanban_stage: data.stage })
      .eq("id", data.customer_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStoreTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: tags, error } = await supabase
      .from("tags")
      .select("*")
      .eq("store_id", data.store_id);
    if (error) throw new Error(error.message);
    return { tags: tags ?? [] };
  });

export const saveScheduledMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    store_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    text: z.string().min(1),
    send_at: z.string()
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase
      .from("scheduled_messages")
      .insert({
        store_id: data.store_id,
        customer_id: data.customer_id,
        text: data.text,
        send_at: data.send_at,
        status: 'pending'
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listScheduledMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: messages, error } = await supabase
      .from("scheduled_messages")
      .select("*, customers(name)")
      .eq("store_id", data.store_id)
      .order("send_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: messages ?? [] };
  });

export const listAutoResponses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StoreInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: responses, error } = await supabase
      .from("auto_responses")
      .select("*")
      .eq("store_id", data.store_id);
    if (error) throw new Error(error.message);
    return { responses: responses ?? [] };
  });

export const saveAutoResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    store_id: z.string().uuid(),
    trigger_type: z.string(),
    response_text: z.string(),
    is_active: z.boolean()
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const payload = {
      store_id: data.store_id,
      trigger_type: data.trigger_type,
      response_text: data.response_text,
      is_active: data.is_active
    };
    if (data.id) {
      const { error } = await supabase.from("auto_responses").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("auto_responses").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
