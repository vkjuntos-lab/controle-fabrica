// Server functions para Web Push (VAPID).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Retorna a chave VAPID pública (usada pelo cliente para subscribe()). */
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

/** Salva/atualiza uma inscrição push do usuário atual. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
      user_agent: z.string().optional().nullable(),
      store_id: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: (context as any).userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.user_agent ?? null,
          store_id: data.store_id ?? null,
          last_used_at: new Date().toISOString(),
          failure_count: 0,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove uma inscrição do usuário atual (ex.: usuário desativa push). */
export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { endpoint: string }) =>
    z.object({ endpoint: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia push para o usuário atual (útil para "testar notificações"). */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUser } = await import("./push-send.server");
    const n = await sendPushToUser((context as any).userId, {
      title: "KS PDV — teste",
      body: "Notificações push estão funcionando 🎉",
      url: "/pdv/notificacoes",
      tag: "test",
    });
    return { sent: n };
  });
