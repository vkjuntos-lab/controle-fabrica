// Cron a cada 5 min: reprocessa fila de contingência/processing.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/fiscal-resend")({
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

        const nowIso = new Date().toISOString();
        const { data: due } = await supabase.from("fiscal_queue")
          .select("id, document_id, attempts")
          .lte("next_attempt_at", nowIso).limit(50);

        let processed = 0;
        for (const q of (due ?? []) as any[]) {
          // Marca próximo retry em 5 min; disparo real acontece via UI/manual até driver assíncrono ser plugado.
          await supabase.from("fiscal_queue").update({
            attempts: (q.attempts ?? 0) + 1,
            next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          }).eq("id", q.id);
          processed++;
        }
        return new Response(JSON.stringify({ ok: true, processed }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
