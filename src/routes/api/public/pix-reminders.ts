import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

/**
 * Rotina executada pelo pg_cron a cada minuto.
 *
 * Autenticação: header `x-cron-secret`, `Authorization: Bearer <secret>`
 * ou query `?secret=` — comparado contra CRON_SECRET/MP_WEBHOOK_SECRET.
 * A chave pública do Supabase NÃO é aceita.
 */
export const Route = createFileRoute("/api/public/pix-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const nowIso = now.toISOString();
        const sixtyMinAgo = new Date(now.getTime() - 60 * 60_000).toISOString();

        // 1) pending → reminded (quando expirou)
        const { data: expired, error: e1 } = await (supabaseAdmin as any)
          .from("pix_charges")
          .update({ status: "reminded", reminded_at: nowIso })
          .lte("expires_at", nowIso)
          .eq("status", "pending")
          .select("id, store_id, sale_code");

        // 2) reminded há > 60 min desde expires_at → cancelled
        const { data: cancelled, error: e2 } = await (supabaseAdmin as any)
          .from("pix_charges")
          .update({ status: "cancelled", cancelled_at: nowIso })
          .lte("expires_at", sixtyMinAgo)
          .eq("status", "reminded")
          .select("id, store_id, sale_code");

        if (e1) console.error("[pix-reminders] expired update:", e1.message);
        if (e2) console.error("[pix-reminders] cancel update:", e2.message);

        // Auditoria
        try {
          const rows: any[] = [];
          for (const r of expired ?? []) {
            rows.push({
              actor_user_id: null,
              actor_name: "Cron",
              actor_role: "system",
              store_id: r.store_id,
              action: "pix.expired",
              entity: "pix_charge",
              entity_id: r.id,
              details: { sale_code: r.sale_code },
            });
          }
          for (const r of cancelled ?? []) {
            rows.push({
              actor_user_id: null,
              actor_name: "Cron",
              actor_role: "system",
              store_id: r.store_id,
              action: "pix.auto_cancel",
              entity: "pix_charge",
              entity_id: r.id,
              details: { sale_code: r.sale_code },
            });
          }
          if (rows.length) {
            await (supabaseAdmin as any).from("audit_log").insert(rows);
          }
        } catch (e) {
          console.warn("[pix-reminders] audit err", (e as Error).message);
        }

        return Response.json({
          ok: true,
          reminded: expired?.length ?? 0,
          cancelled: cancelled?.length ?? 0,
        });
      },
      GET: async () => new Response("pix-reminders ok", { status: 200 }),
    },
  },
});
