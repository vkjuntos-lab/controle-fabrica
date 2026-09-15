// Server-only: varredura periódica do programa de fidelidade.
// - Expira pontos com `expires_at` no passado (kind='expire' no ledger + ajuste em balance).
// - Notifica clientes com pontos expirando em <=7 dias (throttle semanal em last_expiry_notice_at).
// - Notifica upgrades de tier ainda não avisados (last_tier_notice_tier).
//
// Endpoint público (rota /api/public/*) — protegido por CRON_SECRET/MP_WEBHOOK_SECRET.

import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";
import { sendWhatsAppWithCreds, type WaCredentials } from "@/lib/wa-driver.server";
import { sendInstagramMessage, type IgCredentials } from "@/lib/ig-driver.server";

type NotifyResult = {
  kind: "expire_sweep" | "expiry_warning" | "tier_upgrade";
  ok: boolean;
  customer_id?: string;
  points?: number;
  tier?: string;
  error?: string;
};

async function expireDuePoints(admin: any): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("loyalty_ledger")
    .select("id,account_id,customer_id,points,expires_at,kind,expired")
    .eq("kind", "earn")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .eq("expired", false)
    .limit(500);

  for (const entry of ((due as any[]) ?? [])) {
    const pts = Number(entry.points || 0);
    if (pts <= 0) continue;
    const { data: acc } = await admin
      .from("loyalty_accounts").select("*").eq("id", entry.account_id).maybeSingle();
    if (!acc) continue;
    const newBal = Math.max(0, Number(acc.balance || 0) - pts);
    await admin.from("loyalty_ledger").insert({
      account_id: entry.account_id,
      customer_id: entry.customer_id,
      kind: "expire",
      points: -pts,
      reason: "Expiração automática",
    });
    await admin.from("loyalty_ledger").update({ expired: true }).eq("id", entry.id);
    await admin.from("loyalty_accounts").update({ balance: newBal }).eq("id", entry.account_id);
    results.push({ kind: "expire_sweep", ok: true, customer_id: entry.customer_id, points: pts });
  }
  return results;
}

async function pickChannelAndSettings(admin: any, customer_id: string) {
  const { data: conv } = await admin
    .from("wa_conversations")
    .select("id,store_id,phone,channel")
    .eq("customer_id", customer_id)
    .order("updated_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!conv?.store_id || !conv?.phone) return null;
  const { data: settings } = await admin
    .from("wa_settings").select("*").eq("store_id", conv.store_id).maybeSingle();
  if (!settings) return null;
  return { conv, settings, channel: (conv.channel as "whatsapp" | "instagram") ?? "whatsapp" };
}

async function sendMessage(ctx: { settings: any; channel: "whatsapp" | "instagram" }, phone: string, text: string) {
  if (ctx.channel === "instagram") {
    const ig: IgCredentials = {
      ig_token: ctx.settings.ig_token,
      ig_user_id: ctx.settings.ig_user_id,
      ig_active: ctx.settings.ig_active,
    };
    return sendInstagramMessage(ig, phone, text);
  }
  return sendWhatsAppWithCreds(ctx.settings as WaCredentials, phone, text);
}

async function warnExpiringSoon(admin: any): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  const soon = new Date(Date.now() + 7 * 86400_000).toISOString();
  const now = new Date().toISOString();
  const throttle = new Date(Date.now() - 7 * 86400_000).toISOString();

  // Agrega pontos por cliente com vencimento em <=7d ainda não expirados
  const { data: rows } = await admin
    .from("loyalty_ledger")
    .select("customer_id,points,expires_at")
    .eq("kind", "earn")
    .eq("expired", false)
    .gt("expires_at", now)
    .lte("expires_at", soon)
    .limit(2000);

  const byCust = new Map<string, number>();
  for (const r of ((rows as any[]) ?? [])) {
    byCust.set(r.customer_id, (byCust.get(r.customer_id) || 0) + Number(r.points || 0));
  }

  for (const [customer_id, points] of byCust) {
    if (points <= 0) continue;
    const { data: acc } = await admin
      .from("loyalty_accounts").select("id,last_expiry_notice_at").eq("customer_id", customer_id).maybeSingle();
    if (!acc) continue;
    if (acc.last_expiry_notice_at && acc.last_expiry_notice_at > throttle) continue;

    const { data: cust } = await admin.from("customers").select("name").eq("id", customer_id).maybeSingle();
    const ch = await pickChannelAndSettings(admin, customer_id);
    if (!ch) continue;

    const firstName = (cust?.name || "linda").split(" ")[0];
    const text = `Oi ${firstName}! ✨ Você tem **${points} pontos** prestes a expirar nos próximos 7 dias no nosso programa de fidelidade. Que tal usar pra ganhar desconto no próximo pedido? 💄💖`;

    const sendRes = await sendMessage(ch, ch.conv.phone, text);
    if (sendRes.ok) {
      await admin.from("loyalty_accounts").update({ last_expiry_notice_at: new Date().toISOString() }).eq("id", acc.id);
      await admin.from("wa_messages").insert({
        conversation_id: ch.conv.id, direction: "outbound", text, channel: ch.channel,
        meta: { campaign: "loyalty_expiry_warning", points },
      });
    }
    results.push({ kind: "expiry_warning", ok: sendRes.ok, customer_id, points, error: sendRes.error });
  }
  return results;
}

async function announceTierUpgrades(admin: any): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  const { data: accs } = await admin
    .from("loyalty_accounts")
    .select("id,customer_id,tier,last_tier_notice_tier")
    .in("tier", ["prata", "ouro", "diamante"])
    .limit(500);

  for (const acc of ((accs as any[]) ?? [])) {
    if (acc.last_tier_notice_tier === acc.tier) continue;
    const ch = await pickChannelAndSettings(admin, acc.customer_id);
    if (!ch) {
      await admin.from("loyalty_accounts").update({ last_tier_notice_tier: acc.tier }).eq("id", acc.id);
      continue;
    }
    const { data: cust } = await admin.from("customers").select("name").eq("id", acc.customer_id).maybeSingle();
    const firstName = (cust?.name || "linda").split(" ")[0];
    const tierLabel = acc.tier === "diamante" ? "💎 Diamante" : acc.tier === "ouro" ? "🥇 Ouro" : "🥈 Prata";
    const text = `Parabéns, ${firstName}! 🎉 Você subiu para o nível **${tierLabel}** no nosso clube de fidelidade. A partir de agora, você ganha mais pontos em cada compra. Aproveite! ✨`;

    const sendRes = await sendMessage(ch, ch.conv.phone, text);
    if (sendRes.ok) {
      await admin.from("loyalty_accounts").update({ last_tier_notice_tier: acc.tier }).eq("id", acc.id);
      await admin.from("wa_messages").insert({
        conversation_id: ch.conv.id, direction: "outbound", text, channel: ch.channel,
        meta: { campaign: "loyalty_tier_upgrade", tier: acc.tier },
      });
    }
    results.push({ kind: "tier_upgrade", ok: sendRes.ok, customer_id: acc.customer_id, tier: acc.tier, error: sendRes.error });
  }
  return results;
}

export const Route = createFileRoute("/api/public/bella-loyalty-tick")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, hint: "POST to run loyalty tick" }),
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const runId = crypto.randomUUID();
        console.log(`[bella-loyalty-tick] ${runId} start`);
        try {
          const expired = await expireDuePoints(supabaseAdmin);
          const warned = await warnExpiringSoon(supabaseAdmin);
          const upgraded = await announceTierUpgrades(supabaseAdmin);
          const all = [...expired, ...warned, ...upgraded];
          const okCount = all.filter((r) => r.ok).length;
          console.log(`[bella-loyalty-tick] ${runId} done: ${okCount}/${all.length}`);
          return Response.json({
            ok: true,
            expired: expired.length,
            warned: warned.filter((r) => r.ok).length,
            upgraded: upgraded.filter((r) => r.ok).length,
            results: all,
          });
        } catch (e) {
          console.error(`[bella-loyalty-tick] ${runId} error:`, (e as Error).message);
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
