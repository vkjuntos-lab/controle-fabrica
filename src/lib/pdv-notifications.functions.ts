import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Notification = {
  id: string;
  kind: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  message: string | null;
  link_url: string | null;
  context: Record<string, string | number | boolean | null>;
  is_read: boolean;
  created_at: string;
};

export type WaSettings = {
  store_id: string;
  provider: "wa_link" | "zapi" | "cloud";
  from_number: string | null;
  active: boolean;
  cloud_token: string | null;
  cloud_phone_id: string | null;
  cloud_template_name: string | null;
  cloud_template_lang: string | null;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  verified_at: string | null;
  last_test_error: string | null;
  last_test_at: string | null;
};

export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; onlyUnread?: boolean; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<Notification[]> => {
    const { data: rows, error } = await (context.supabase.rpc as any)("list_notifications", {
      _store: data.storeId,
      _only_unread: data.onlyUnread ?? false,
      _limit: data.limit ?? 100,
    });
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity,
      title: r.title,
      message: r.message,
      link_url: r.link_url,
      context: (r.context ?? {}) as Record<string, string | number | boolean | null>,
      is_read: !!r.is_read,
      created_at: r.created_at,
    }));
  });

export const getUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => d)
  .handler(async ({ data, context }) => {
    try {
      const { data: n, error } = await (context.supabase.rpc as any)("notifications_unread_count", {
        _store: data.storeId,
      });
      if (error) return 0;
      return Number(n ?? 0);
    } catch {
      return 0;
    }
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("mark_notification_read", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const markAllRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: n, error } = await (context.supabase.rpc as any)("mark_all_notifications_read", {
      _store: data.storeId,
    });
    if (error) throw error;
    return { count: Number(n ?? 0) };
  });

// ============ WA SETTINGS ============
export const getWaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => d)
  .handler(async ({ data, context }): Promise<WaSettings> => {
    const { data: rows, error } = await (context.supabase.rpc as any)("get_wa_settings", {
      _store: data.storeId,
    });
    if (error) throw error;
    const r = (rows ?? [])[0];
    return {
      store_id: data.storeId,
      provider: (r?.provider ?? "wa_link") as WaSettings["provider"],
      from_number: r?.from_number ?? null,
      active: r?.active ?? true,
      cloud_token: r?.cloud_token ?? null,
      cloud_phone_id: r?.cloud_phone_id ?? null,
      cloud_template_name: r?.cloud_template_name ?? null,
      cloud_template_lang: r?.cloud_template_lang ?? "pt_BR",
      zapi_instance_id: r?.zapi_instance_id ?? null,
      zapi_token: r?.zapi_token ?? null,
      zapi_client_token: r?.zapi_client_token ?? null,
      verified_at: r?.verified_at ?? null,
      last_test_error: r?.last_test_error ?? null,
      last_test_at: r?.last_test_at ?? null,
    };
  });

export type SaveWaInput = {
  storeId: string;
  provider: "wa_link" | "zapi" | "cloud";
  fromNumber?: string | null;
  active?: boolean;
  cloudToken?: string | null;
  cloudPhoneId?: string | null;
  cloudTemplateName?: string | null;
  cloudTemplateLang?: string | null;
  zapiInstance?: string | null;
  zapiToken?: string | null;
  zapiClientToken?: string | null;
};

export const saveWaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SaveWaInput) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as any)("upsert_wa_settings", {
      _store: data.storeId,
      _provider: data.provider,
      _from: data.fromNumber ?? null,
      _active: data.active ?? true,
      _cloud_token: data.cloudToken ?? null,
      _cloud_phone_id: data.cloudPhoneId ?? null,
      _cloud_template_name: data.cloudTemplateName ?? null,
      _cloud_template_lang: data.cloudTemplateLang ?? "pt_BR",
      _zapi_instance: data.zapiInstance ?? null,
      _zapi_token: data.zapiToken ?? null,
      _zapi_client_token: data.zapiClientToken ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

// Testar envio real
export const testWaSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    storeId: string;
    phone: string;
    message?: string;
    useTemplate?: boolean;
    templateName?: string | null;
    templateLang?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase.rpc as any)("get_wa_settings", {
      _store: data.storeId,
    });
    if (error) throw error;
    const creds = (rows ?? [])[0];
    if (!creds) throw new Error("Configuração não encontrada");

    // Se for envio via template, valida existência (name+language APPROVED) antes de chamar a Meta
    if (data.useTemplate) {
      const name = (data.templateName ?? creds.cloud_template_name ?? "").trim();
      const lang = (data.templateLang ?? creds.cloud_template_lang ?? "pt_BR").trim();
      if (!name) {
        return { ok: false, provider: creds.provider, error: "Selecione um template aprovado antes de testar." };
      }
      const { data: tpl } = await (context.supabase as any)
        .from("wa_templates")
        .select("name,language,status")
        .eq("store_id", data.storeId)
        .eq("name", name);
      const list = (tpl ?? []) as Array<{ name: string; language: string; status: string }>;
      if (list.length === 0) {
        return {
          ok: false,
          provider: creds.provider,
          error: `Template "${name}" não encontrado na loja. Sincronize os templates da Meta primeiro.`,
        };
      }
      const match = list.find((r) => r.language === lang);
      if (!match) {
        const avail = list.map((r) => r.language).join(", ");
        return {
          ok: false,
          provider: creds.provider,
          error: `Template "${name}" não existe no idioma "${lang}". Idiomas disponíveis: ${avail}.`,
        };
      }
      if ((match.status ?? "").toUpperCase() !== "APPROVED") {
        return {
          ok: false,
          provider: creds.provider,
          error: `Template "${name}" (${lang}) está com status "${match.status}", não APPROVED. Aguarde aprovação da Meta.`,
        };
      }
      // Sobrescreve credenciais com escolha do usuário para este envio
      creds.cloud_template_name = name;
      creds.cloud_template_lang = lang;
    }

    const { sendWhatsAppWithCreds } = await import("@/lib/wa-driver.server");
    const msg = data.message?.trim() || "🧪 Teste KS MultiMake — WhatsApp configurado com sucesso!";
    const res = await sendWhatsAppWithCreds(creds, data.phone, msg, {
      useTemplate: data.useTemplate,
      templateParams: [msg],
    });

    await (context.supabase.rpc as any)("record_wa_test_result", {
      _store: data.storeId,
      _ok: res.ok,
      _error: res.error ?? null,
    });
    return res;
  });

// Cron/UI: envia fila usando credenciais por loja
export const sendQueuedReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const { data: queued, error } = await (context.supabase.rpc as any)("list_queued_reminders", {
      _limit: data.limit ?? 50,
    });
    if (error) throw error;
    const rows = (queued ?? []) as Array<{
      id: string; store_id: string; phone: string | null; message: string; provider: string;
    }>;
    if (rows.length === 0) return { attempted: 0, sent: 0, failed: 0, skipped: 0 };

    const { sendWhatsAppWithCreds } = await import("@/lib/wa-driver.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const credsCache = new Map<string, any>();
    async function getCreds(storeId: string) {
      if (credsCache.has(storeId)) return credsCache.get(storeId);
      const { data: crows } = await admin.rpc("get_wa_credentials_for_send", { _store: storeId });
      const c = (crows ?? [])[0] ?? { provider: "wa_link", active: false };
      credsCache.set(storeId, c);
      return c;
    }

    let sent = 0, failed = 0, skipped = 0;
    for (const row of rows) {
      const creds = await getCreds(row.store_id);
      if (!creds?.active || creds.provider === "wa_link") { skipped++; continue; }
      const res = await sendWhatsAppWithCreds(creds, row.phone ?? "", row.message);
      await admin.rpc("record_reminder_result", {
        _id: row.id, _ok: res.ok, _provider: res.provider,
        _msg_id: res.messageId ?? null, _error: res.error ?? null,
      });
      if (res.ok) sent++; else failed++;
    }
    return { attempted: rows.length, sent, failed, skipped };
  });

/**
 * Executa manualmente o mesmo pipeline do cron diário:
 *  1) run_due_reminders (gera fila de cobranças do dia)
 *  2) mark_expired_payment_links
 *  3) sendQueuedReminders (dispara via WhatsApp para cada loja)
 * Apenas admin/gerente.
 */
export const runPaymentsDailyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    const { data: isManager } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "manager",
    });
    if (!isAdmin && !isManager) throw new Error("Somente admin/gerente pode executar.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const out: Record<string, any> = {};
    try {
      const { data: r } = await admin.rpc("run_due_reminders");
      out.reminders = Number(r ?? 0);
    } catch (e) { out.reminders_error = (e as Error).message; }

    try {
      const { data: r } = await admin.rpc("mark_expired_payment_links");
      out.expired_links = Number(r ?? 0);
    } catch (e) { out.expired_links_error = (e as Error).message; }

    try {
      const { data: queued } = await admin.rpc("list_queued_reminders", { _limit: 100 });
      const rows = (queued ?? []) as Array<{ id: string; store_id: string; phone: string | null; message: string; provider: string }>;
      const { sendWhatsAppWithCreds } = await import("@/lib/wa-driver.server");
      const credsCache = new Map<string, any>();
      async function getCreds(storeId: string) {
        if (credsCache.has(storeId)) return credsCache.get(storeId);
        const { data: crows } = await admin.rpc("get_wa_credentials_for_send", { _store: storeId });
        const c = (crows ?? [])[0] ?? { provider: "wa_link", active: false };
        credsCache.set(storeId, c);
        return c;
      }
      let sent = 0, failed = 0, skipped = 0;
      for (const row of rows) {
        const creds = await getCreds(row.store_id);
        if (!creds?.active || creds.provider === "wa_link") { skipped++; continue; }
        const res = await sendWhatsAppWithCreds(creds, row.phone ?? "", row.message);
        await admin.rpc("record_reminder_result", {
          _id: row.id, _ok: res.ok, _provider: res.provider,
          _msg_id: res.messageId ?? null, _error: res.error ?? null,
        });
        if (res.ok) sent++; else failed++;
      }
      out.wa = { attempted: rows.length, sent, failed, skipped };
    } catch (e) { out.wa_error = (e as Error).message; }

    return out;
  });
