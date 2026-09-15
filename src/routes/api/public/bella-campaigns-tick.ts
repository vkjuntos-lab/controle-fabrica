// Server-only: tick de campanhas automáticas da Bella IA.
// Chamado periodicamente por pg_cron (a cada 15 min).
//
// Endpoint público (rota /api/public/*) — protegido por segredo compartilhado
// (CRON_SECRET/MP_WEBHOOK_SECRET). A chave pública do Supabase NÃO é aceita.

import { createFileRoute } from "@tanstack/react-router";
import { sendWhatsAppWithCreds, type WaCredentials } from "@/lib/wa-driver.server";
import { sendInstagramMessage, type IgCredentials } from "@/lib/ig-driver.server";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

type CampaignSendResult = {
  campaign_type: "cart_recovery" | "birthday" | "inactive";
  ok: boolean;
  error?: string;
  conversation_id?: string;
  customer_id?: string | null;
  stage?: number;
  coupon_code?: string;
  channel: "whatsapp" | "instagram";
};

// Estágios de recuperação de carrinho: (índice = próximo stage a disparar)
const CART_RECOVERY_RULES = [
  { stage: 1, minMinutes: 30, maxMinutes: 24 * 60, coupon: null, template: (name: string, items: string) =>
      `Oi ${name || "linda"}! 💕 Vi que você começou a montar um pedido comigo e não finalizou. Ainda tá interessada em ${items}? Posso te ajudar a fechar agora 💄` },
  { stage: 2, minMinutes: 24 * 60, maxMinutes: 72 * 60, coupon: null, template: (name: string, items: string) =>
      `Oi ${name || "amor"}! ✨ Ainda tô guardando ${items} pra você. Quer que eu finalize o pedido com PIX? Assim você já garante 💜` },
  { stage: 3, minMinutes: 72 * 60, maxMinutes: 30 * 24 * 60, coupon: "BELLA10", template: (name: string, items: string) =>
      `Oi ${name || "linda"}! 🎁 Preparei um mimo pra te convencer: **10% OFF** com o cupom **BELLA10** em ${items}. Válido só hoje. Fecha comigo? 💕` },
];

async function runCartRecovery(supabaseAdmin: any): Promise<CampaignSendResult[]> {
  const results: CampaignSendResult[] = [];

  // Busca conversas com carrinho não vazio, sem handoff, ativas nos últimos 30 dias
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: convs, error } = await supabaseAdmin
    .from("wa_conversations")
    .select("id,store_id,phone,wa_name,customer_id,cart,channel,last_inbound_at,cart_recovery_stage,cart_recovery_last_at,handoff_to_human")
    .gte("last_inbound_at", cutoff)
    .not("cart", "is", null)
    .eq("handoff_to_human", false)
    .lt("cart_recovery_stage", 3)
    .limit(200);

  if (error) { console.error("[campaigns-tick] load convs:", error.message); return results; }

  for (const conv of ((convs as any[]) ?? [])) {
    const cart = Array.isArray(conv.cart) ? conv.cart : [];
    if (!cart.length) continue;
    const lastActivity = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    if (!lastActivity) continue;
    const minutesSince = (Date.now() - lastActivity) / 60000;
    const nextStageIndex = conv.cart_recovery_stage ?? 0;
    const rule = CART_RECOVERY_RULES[nextStageIndex];
    if (!rule) continue;
    if (minutesSince < rule.minMinutes || minutesSince > rule.maxMinutes) continue;

    // Não reenviar se já enviamos algo há < 30min
    const lastCampAt = conv.cart_recovery_last_at ? new Date(conv.cart_recovery_last_at).getTime() : 0;
    if (lastCampAt && (Date.now() - lastCampAt) < 30 * 60 * 1000) continue;

    // Descobre credenciais da loja
    const channel: "whatsapp" | "instagram" = (conv.channel as any) ?? "whatsapp";
    const { data: settings } = await supabaseAdmin
      .from("wa_settings").select("*").eq("store_id", conv.store_id).maybeSingle();
    if (!settings) continue;

    const itemsSummary = cart
      .slice(0, 2)
      .map((i: any) => `${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ""}`)
      .join(", ") + (cart.length > 2 ? ` e mais ${cart.length - 2}` : "");

    const text = rule.template(conv.wa_name ?? "", itemsSummary);

    let sendRes: { ok: boolean; provider?: string; messageId?: string; error?: string };
    if (channel === "instagram") {
      const ig: IgCredentials = {
        ig_token: (settings as any).ig_token,
        ig_user_id: (settings as any).ig_user_id,
        ig_page_id: (settings as any).ig_page_id,
        ig_active: (settings as any).ig_active,
      };
      sendRes = await sendInstagramMessage(ig, conv.phone, text);
    } else {
      sendRes = await sendWhatsAppWithCreds(settings as WaCredentials, conv.phone, text);
    }

    await supabaseAdmin.from("bella_campaign_runs").insert({
      store_id: conv.store_id,
      conversation_id: conv.id,
      customer_id: conv.customer_id,
      campaign_type: "cart_recovery",
      channel,
      stage: rule.stage,
      coupon_code: rule.coupon,
      message_text: text,
      send_ok: sendRes.ok,
      send_error: sendRes.error ?? null,
    });

    if (sendRes.ok) {
      await supabaseAdmin.from("wa_conversations").update({
        cart_recovery_stage: rule.stage,
        cart_recovery_last_at: new Date().toISOString(),
      }).eq("id", conv.id);
      await supabaseAdmin.from("wa_messages").insert({
        conversation_id: conv.id, direction: "outbound", text, channel,
        meta: { campaign: "cart_recovery", stage: rule.stage, coupon: rule.coupon },
      });
    }

    results.push({
      campaign_type: "cart_recovery", ok: sendRes.ok, error: sendRes.error,
      conversation_id: conv.id, customer_id: conv.customer_id, stage: rule.stage,
      coupon_code: rule.coupon ?? undefined, channel,
    });
  }

  return results;
}

async function runBirthday(supabaseAdmin: any): Promise<CampaignSendResult[]> {
  const results: CampaignSendResult[] = [];
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  const { data: customers } = await supabaseAdmin
    .from("customers")
    .select("id,name,phone,birthday")
    .not("birthday", "is", null)
    .not("phone", "is", null)
    .limit(500);

  const todaysBirthdays = ((customers as any[]) ?? []).filter((c) => {
    if (!c.birthday) return false;
    const b = String(c.birthday);
    return b.slice(5, 10) === `${mm}-${dd}`;
  });
  if (!todaysBirthdays.length) return results;

  for (const cust of todaysBirthdays) {
    // Localiza conversa mais recente (qualquer loja) — usa a última conversa
    const { data: conv } = await supabaseAdmin
      .from("wa_conversations")
      .select("id,store_id,phone,channel")
      .eq("customer_id", cust.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let storeId: string | null = (conv as any)?.store_id ?? null;
    let phone: string = (conv as any)?.phone ?? cust.phone;
    let channel: "whatsapp" | "instagram" = ((conv as any)?.channel as any) ?? "whatsapp";
    if (!storeId) {
      const { data: firstStore } = await supabaseAdmin.from("stores").select("id").limit(1).maybeSingle();
      storeId = (firstStore as any)?.id ?? null;
    }
    if (!storeId) continue;

    // Dedupe: já enviou hoje?
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const { data: already } = await supabaseAdmin
      .from("bella_campaign_runs")
      .select("id")
      .eq("customer_id", cust.id)
      .eq("campaign_type", "birthday")
      .gte("created_at", startOfDay)
      .maybeSingle();
    if (already) continue;

    const { data: settings } = await supabaseAdmin
      .from("wa_settings").select("*").eq("store_id", storeId).maybeSingle();
    if (!settings) continue;

    const text = `🎉 Feliz aniversário, ${cust.name?.split(" ")[0] ?? "linda"}! 💕\n\nPreparei um presente pra você: **15% OFF** em toda a loja com o cupom **BELLA-BDAY15** — válido só hoje. Vem escolher seu mimo! 🎁💄`;

    let sendRes: { ok: boolean; error?: string };
    if (channel === "instagram") {
      const ig: IgCredentials = {
        ig_token: (settings as any).ig_token,
        ig_user_id: (settings as any).ig_user_id,
        ig_active: (settings as any).ig_active,
      };
      sendRes = await sendInstagramMessage(ig, phone, text);
    } else {
      sendRes = await sendWhatsAppWithCreds(settings as WaCredentials, phone, text);
    }

    await supabaseAdmin.from("bella_campaign_runs").insert({
      store_id: storeId,
      conversation_id: (conv as any)?.id ?? null,
      customer_id: cust.id,
      campaign_type: "birthday",
      channel,
      coupon_code: "BELLA-BDAY15",
      message_text: text,
      send_ok: sendRes.ok,
      send_error: sendRes.error ?? null,
    });

    results.push({
      campaign_type: "birthday", ok: sendRes.ok, error: sendRes.error,
      conversation_id: (conv as any)?.id, customer_id: cust.id,
      coupon_code: "BELLA-BDAY15", channel,
    });
  }
  return results;
}

export const Route = createFileRoute("/api/public/bella-campaigns-tick")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, hint: "POST to run campaign tick" }),
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const runId = crypto.randomUUID();
        console.log(`[bella-campaigns-tick] ${runId} start`);
        try {
          const [cartRes, bdayRes] = await Promise.all([
            runCartRecovery(supabaseAdmin),
            runBirthday(supabaseAdmin),
          ]);
          const all = [...cartRes, ...bdayRes];
          const okCount = all.filter((r) => r.ok).length;
          console.log(`[bella-campaigns-tick] ${runId} done: ${okCount}/${all.length}`);
          return Response.json({ ok: true, sent: okCount, total: all.length, results: all });
        } catch (e) {
          console.error(`[bella-campaigns-tick] ${runId} error:`, (e as Error).message);
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
