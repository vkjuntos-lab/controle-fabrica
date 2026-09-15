import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

/**
 * Cron unificado de cobranças diárias:
 *  - marca boletos vencidos
 *  - dispara lembretes das agendas do dia (payment_schedules → payment_reminders)
 *  - reencaminha para o hook de crediário (cobranças + penalidade de score)
 *  - expira payment_links vencidos
 *
 * Autenticação: header `x-cron-secret`, `Authorization: Bearer <secret>`
 * ou query `?secret=` — comparado contra CRON_SECRET/MP_WEBHOOK_SECRET.
 * A chave pública do Supabase NÃO é aceita.
 */
export const Route = createFileRoute("/api/public/hooks/payments-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const expectedSecret = process.env.CRON_SECRET || process.env.MP_WEBHOOK_SECRET || "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        const results: Record<string, unknown> = {};

        // 1) boletos vencidos + agendas do dia
        try {
          const { data: reminders } = await admin.rpc("run_due_reminders");
          results.reminders = Number(reminders ?? 0);
        } catch (e) {
          results.reminders_error = (e as Error).message;
        }

        // 2) expira payment_links pendentes
        try {
          const { data: expired } = await admin.rpc("mark_expired_payment_links");
          results.expired_links = Number(expired ?? 0);
        } catch (e) {
          results.expired_links_error = (e as Error).message;
        }

        // 2b) envia fila de WhatsApp (Z-API / Cloud API) usando credenciais por loja
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
          results.wa = { attempted: rows.length, sent, failed, skipped };
        } catch (e) {
          results.wa_error = (e as Error).message;
        }

        // 3) reencaminha para o cron de crediário (cobranças + score)
        try {
          const origin = url.origin;
          const forwardUrl = `${origin}/api/public/hooks/credit-collections${expectedSecret ? `?secret=${expectedSecret}` : ""}`;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (expectedSecret) headers["x-cron-secret"] = expectedSecret;
          const r = await fetch(forwardUrl, { method: "POST", headers, body: "{}" });
          if (r.ok) {
            results.credit = await r.json().catch(() => ({ ok: true }));
          } else {
            results.credit_error = `status ${r.status}`;
          }
        } catch (e) {
          results.credit_error = (e as Error).message;
        }

        return Response.json({ ok: true, ...results });
      },
      GET: async () => new Response("payments-daily ok", { status: 200 }),
    },
  },
});
