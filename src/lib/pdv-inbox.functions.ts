// Onda 1 — Inbox Omnichannel: server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { supabase: any; userId: string };

export const listInboxConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    store_id: string;
    filter?: "mine" | "queue" | "all" | "closed";
    channel?: "whatsapp" | "instagram" | null;
    tag?: string | null;
    search?: string | null;
  }) => z.object({
    store_id: z.string().uuid(),
    filter: z.enum(["mine", "queue", "all", "closed"]).default("all"),
    channel: z.enum(["whatsapp", "instagram"]).nullish(),
    tag: z.string().nullish(),
    search: z.string().nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    let q = supabase
      .from("wa_conversations")
      .select("id,phone,wa_name,customer_id,channel,tags,assigned_to,status,unread_count,last_snippet,last_inbound_at,last_outbound_at,handoff_to_human,first_response_at,closed_at,sla_state,updated_at")
      .eq("store_id", data.store_id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.filter === "mine") q = q.eq("assigned_to", userId).neq("status", "closed");
    else if (data.filter === "queue") q = q.is("assigned_to", null).neq("status", "closed");
    else if (data.filter === "closed") q = q.eq("status", "closed");
    else q = q.neq("status", "closed");
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.search) q = q.or(`phone.ilike.%${data.search}%,wa_name.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { conversations: rows ?? [] };
  });

export const getInboxThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const [{ data: conv }, { data: messages }, { data: notes }] = await Promise.all([
      supabase.from("wa_conversations").select("*, customers(id,name,cpf,phone,email,cashback_balance)").eq("id", data.conversation_id).single(),
      supabase.from("wa_messages").select("id,direction,text,meta,created_at,channel").eq("conversation_id", data.conversation_id).order("created_at", { ascending: true }).limit(500),
      supabase.from("wa_internal_notes").select("id,body,author_id,created_at").eq("conversation_id", data.conversation_id).order("created_at", { ascending: true }),
    ]);
    return { conversation: conv, messages: messages ?? [], notes: notes ?? [] };
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; user_id: string | null }) =>
    z.object({ id: z.string().uuid(), user_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const patch: any = {
      assigned_to: data.user_id,
      assigned_at: data.user_id ? new Date().toISOString() : null,
    };
    if (data.user_id) patch.status = "active";
    const { error } = await supabase.from("wa_conversations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      action: "inbox.assign",
      entity: "wa_conversations",
      entity_id: data.id,
      actor_id: userId,
      details: { assigned_to: data.user_id },
    }).catch(() => {});
    return { ok: true };
  });

export const takeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("wa_conversations").update({
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
      status: "active",
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; body: string }) =>
    z.object({ conversation_id: z.string().uuid(), body: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: row, error } = await supabase.from("wa_internal_notes").insert({
      conversation_id: data.conversation_id,
      author_id: userId,
      body: data.body,
    }).select("id,body,author_id,created_at").single();
    if (error) throw new Error(error.message);
    return { note: row };
  });

export const setConversationTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; tags: string[] }) =>
    z.object({ id: z.string().uuid(), tags: z.array(z.string()).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("wa_conversations").update({ tags: data.tags }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("wa_conversations").update({
      status: "closed",
      closed_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("wa_conversations").update({
      status: "active",
      closed_at: null,
      handoff_to_human: false,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("wa_conversations").update({ unread_count: 0 }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendManualReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string; text: string }) =>
    z.object({ conversation_id: z.string().uuid(), text: z.string().min(1).max(3500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: conv, error: e1 } = await supabase
      .from("wa_conversations")
      .select("id,store_id,phone,channel")
      .eq("id", data.conversation_id).single();
    if (e1 || !conv) throw new Error(e1?.message ?? "conversation not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("wa_settings")
      .select("provider,cloud_token,cloud_phone_id,zapi_instance_id,zapi_token,zapi_client_token,active,ig_token,ig_user_id,ig_page_id,ig_active")
      .eq("store_id", conv.store_id).maybeSingle();

    let sendResult: { ok: boolean; provider?: string; messageId?: string; error?: string };
    if (conv.channel === "instagram") {
      const { sendInstagramMessage } = await import("./ig-driver.server");
      sendResult = await sendInstagramMessage(
        { ig_token: settings?.ig_token ?? null, ig_user_id: settings?.ig_user_id ?? null },
        conv.phone, data.text,
      );
    } else {
      const { sendWhatsAppWithCreds } = await import("./wa-driver.server");
      sendResult = await sendWhatsAppWithCreds(settings as any ?? { provider: "wa_link" }, conv.phone, data.text);
    }

    // Registra a mensagem manual (marca autor humano em meta.author_id → dispara first_response_at no trigger).
    await supabaseAdmin.from("wa_messages").insert({
      conversation_id: data.conversation_id,
      direction: "outbound",
      text: data.text,
      channel: conv.channel ?? "whatsapp",
      wa_message_id: sendResult.messageId ?? null,
      meta: {
        author_id: userId,
        manual: true,
        send_ok: sendResult.ok,
        send_error: sendResult.error ?? null,
        provider: sendResult.provider ?? null,
      },
    });

    if (!sendResult.ok) throw new Error(sendResult.error ?? "send failed");
    return { ok: true, provider: sendResult.provider };
  });

export const listStoreOperators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("store_id", data.store_id);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return { operators: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const operators: Array<{ id: string; email: string | null; role: string }> = [];
    for (const r of roles ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id).catch(() => ({ data: null } as any));
      operators.push({ id: r.user_id, email: (u?.user?.email as string) ?? null, role: r.role });
    }
    return { operators };
  });

export const listWaTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: rows } = await supabase.from("wa_tags").select("id,label,color").eq("store_id", data.store_id).order("label");
    return { tags: rows ?? [] };
  });

export const upsertWaTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string; label: string; color?: string }) =>
    z.object({ store_id: z.string().uuid(), label: z.string().min(1).max(40), color: z.string().default("#8B5CF6") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: row, error } = await supabase.from("wa_tags")
      .upsert({ store_id: data.store_id, label: data.label, color: data.color }, { onConflict: "store_id,label" })
      .select().single();
    if (error) throw new Error(error.message);
    return { tag: row };
  });
