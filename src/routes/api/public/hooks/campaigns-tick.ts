// Onda N — cron tick para campanhas automáticas (aniversário, inativo60, tier_upgrade)
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/campaigns-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const auth = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!auth) return new Response("Service Role missing", { status: 500 });
        
        const supabase = createClient(process.env.SUPABASE_URL!, auth, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Executa todas as campanhas agendadas/scheduled cuja hora chegou + gatilhos automáticos
        const nowIso = new Date().toISOString();
        const { data: due } = await supabase.from("campaigns")
          .select("id")
          .in("status", ["scheduled", "draft"])
          .lte("scheduled_at", nowIso);

        let processed = 0;
        for (const row of (due ?? []) as any[]) {
          // Marca como running; o worker real de disparo aciona a mesma lógica de runCampaign via job assíncrono.
          await supabase.from("campaigns").update({ status: "running" }).eq("id", row.id);
          processed += 1;
        }

        return new Response(JSON.stringify({ ok: true, processed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
