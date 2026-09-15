// Onda T — funções administrativas da vitrine (uso pelo PDV autenticado).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type StorefrontAdminOrder = {
  code: string;
  status: string;
  channel: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  items: Array<{ product_id: string; sku: string; name: string; qty: number; unit_price: number }>;
  notes: string | null;
  wa_status: string | null;
  wa_message_id: string | null;
  reserved_until: string | null;
  cancelled_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  store_id: string | null;
  store_name: string | null;
};

export const listStorefrontAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id?: string | null; status?: string | null; limit?: number }) =>
    z.object({
      store_id: z.string().uuid().nullable().optional(),
      status: z.string().max(40).nullable().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }): Promise<StorefrontAdminOrder[]> => {
    const { data: rows, error } = await (context.supabase as any).rpc("storefront_admin_list_orders", {
      _store_id: data.store_id ?? null,
      _status: data.status ?? null,
      _limit: data.limit ?? 100,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      code: r.code, status: r.status, channel: r.channel,
      total: Number(r.total ?? 0),
      customer_name: r.customer_name ?? null,
      customer_phone: r.customer_phone ?? null,
      items: (r.items ?? []) as StorefrontAdminOrder["items"],
      notes: r.notes ?? null,
      wa_status: r.wa_status ?? null,
      wa_message_id: r.wa_message_id ?? null,
      reserved_until: r.reserved_until ?? null,
      cancelled_at: r.cancelled_at ?? null,
      confirmed_at: r.confirmed_at ?? null,
      created_at: r.created_at,
      store_id: r.store_id ?? null,
      store_name: r.store_name ?? null,
    }));
  });

export const confirmStorefrontOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("storefront_admin_confirm_order", {
      _code: data.code, _user_id: context.userId,
    });
    if (error) return { ok: false as const, error: error.message };
    const row: any = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.ok === false) return { ok: false as const, error: row.error ?? "Falha ao confirmar" };
    return { ok: true as const };
  });

export const cancelStorefrontAdminOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await (context.supabase as any).rpc("storefront_cancel_order", { _code: data.code });
    if (error) return { ok: false as const, error: error.message };
    return { ok: !!ok };
  });

/** Atendente marca manualmente o message_id retornado ao enviar via WhatsApp Business. */
export const setStorefrontWaMessageId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; message_id: string }) =>
    z.object({ code: z.string().min(1), message_id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await (context.supabase as any).rpc("storefront_wa_set_message_id", {
      _code: data.code, _message_id: data.message_id,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: !!ok };
  });

function normalizeDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}
function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Envia a mensagem do pedido via WhatsApp Cloud API (Meta), capturando o
 * message_id automaticamente e vinculando ao pedido — sem cópia manual.
 * Requer os secrets WA_CLOUD_PHONE_ID e WA_CLOUD_TOKEN.
 */
export const sendStorefrontWhatsappViaCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const phoneId = process.env.WA_CLOUD_PHONE_ID;
    const token = process.env.WA_CLOUD_TOKEN;
    if (!phoneId || !token) {
      return {
        ok: false as const,
        error: "WhatsApp Cloud API não configurada (defina WA_CLOUD_PHONE_ID e WA_CLOUD_TOKEN nos secrets).",
      };
    }

    const { data: rows, error } = await (context.supabase as any).rpc(
      "storefront_admin_get_send_payload",
      { _code: data.code },
    );
    if (error) return { ok: false as const, error: error.message };
    const row: any = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { ok: false as const, error: "Pedido não encontrado" };
    if (row.wa_message_id) {
      return { ok: false as const, error: "Pedido já possui message_id vinculado" };
    }

    const toDigits = normalizeDigits(row.customer_phone);
    if (!toDigits || toDigits.length < 10) {
      return {
        ok: false as const,
        error: "Cliente sem telefone válido — solicite o WhatsApp antes de enviar automaticamente.",
      };
    }

    const items: Array<{ name: string; sku: string; qty: number; unit_price: number }> =
      Array.isArray(row.items) ? row.items : [];
    const lines = [
      `Olá${row.customer_name ? `, ${row.customer_name}` : ""}! 👋`,
      `Recebemos seu pedido *#${row.code}* na ${row.store_name ?? "nossa loja"}.`,
      ``,
      `*Itens:*`,
      ...items.map((it) => `• ${it.qty}× ${it.name} (${it.sku}) — ${brl(it.qty * Number(it.unit_price ?? 0))}`),
      ``,
      `*Total:* ${brl(Number(row.total ?? 0))}`,
      ``,
      `Para confirmar retirada/entrega, responda esta mensagem. 💜`,
    ];
    const body = lines.join("\n");

    let resp: Response;
    try {
      resp = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toDigits,
          type: "text",
          text: { preview_url: false, body },
        }),
      });
    } catch (e: any) {
      return { ok: false as const, error: `Falha de rede: ${e?.message ?? "erro desconhecido"}` };
    }

    const txt = await resp.text();
    let payload: any = {};
    try { payload = JSON.parse(txt); } catch { /* provider retornou não-JSON */ }
    if (!resp.ok) {
      const detail = payload?.error?.message ?? txt.slice(0, 300);
      return { ok: false as const, error: `WhatsApp Cloud [${resp.status}]: ${detail}` };
    }

    const messageId: string | undefined = payload?.messages?.[0]?.id;
    if (!messageId) {
      return { ok: false as const, error: "API não retornou message_id." };
    }

    const { error: linkErr } = await (context.supabase as any).rpc("storefront_wa_set_message_id", {
      _code: data.code, _message_id: messageId,
    });
    if (linkErr) return { ok: false as const, error: `Envio ok, mas falhou ao vincular: ${linkErr.message}` };

    await (context.supabase as any).rpc("storefront_mark_whatsapp", { _code: data.code, _confirmed: false });

    return { ok: true as const, message_id: messageId };
  });
