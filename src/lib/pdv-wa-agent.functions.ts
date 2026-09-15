// Server functions do painel do agente WhatsApp (leitura + testes).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listWaConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) =>
    z.object({ store_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase
      .from("wa_conversations")
      .select("id,phone,wa_name,customer_id,cart,last_inbound_at,last_outbound_at,status,updated_at")
      .eq("store_id", data.store_id)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { conversations: rows ?? [] };
  });

export const listWaMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase
      .from("wa_messages")
      .select("id,direction,text,meta,created_at")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

/**
 * Retorna a URL do webhook + verify token (para o admin colar no Meta).
 * Não expõe segredos: só ecoa o env var já configurado.
 */
export const getWaWebhookInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "";
    return {
      webhook_path: "/api/public/wa-agent-webhook",
      verify_token_set: !!token,
      verify_token_preview: token ? token.slice(0, 4) + "…" + token.slice(-2) : null,
    };
  });

/**
 * Lista pedidos gerados via WhatsApp (payment_links com wa_conversation_id) para uma loja,
 * com status derivado: link_created / paid / stock_baixa / sent / failed.
 */
export const listWaOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string }) =>
    z.object({ store_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase
      .from("payment_links")
      .select(
        "id,code,amount,paid_amount,status,description,items,fulfillment,wa_conversation_id,sale_id,paid_at,fulfilled_at,confirmation_sent_at,confirmation_attempts,confirmation_last_error,order_confirmed_at,created_at",
      )
      .eq("store_id", data.store_id)
      .not("wa_conversation_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);
    const orders = (rows ?? []).map((r: any) => {
      const stages = {
        link_created: !!r.created_at,
        order_confirmed: !!r.order_confirmed_at,
        paid: r.status === "paid" || !!r.paid_at,
        stock_baixa: !!r.fulfilled_at && !!r.sale_id,
        confirmation_sent: !!r.confirmation_sent_at,
        failed_send: !r.confirmation_sent_at && (r.confirmation_attempts ?? 0) > 0,
      };
      return { ...r, stages };
    });
    return { orders };
  });

/** Reenvia manualmente a mensagem de confirmação de pagamento. */
export const resendWaConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { link_id: string }) =>
    z.object({ link_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { resendPaymentConfirmation } = await import("@/lib/wa-agent-finalize.server");
    return await resendPaymentConfirmation(data.link_id);
  });
