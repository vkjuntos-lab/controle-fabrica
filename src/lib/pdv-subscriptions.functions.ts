import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";

const MP_BASE = "https://api.mercadopago.com";

/**
 * Cria (ou reaproveita) uma Preapproval no Mercado Pago para uma assinatura.
 * Requer que a assinatura exista e tenha payer_email definido.
 * Retorna { initPoint } para o cliente autorizar o débito recorrente.
 */
export const createMPPreapproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string }) =>
    z.object({ subscriptionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error("MP_ACCESS_TOKEN não configurado.");

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("id, title, amount, frequency_type, frequency, next_charge_at, payer_email, mp_preapproval_id, mp_init_point, status")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Assinatura não encontrada.");
    if (sub.mp_preapproval_id && sub.mp_init_point) {
      return { preapprovalId: sub.mp_preapproval_id, initPoint: sub.mp_init_point };
    }
    if (!sub.payer_email) throw new Error("Informe o e-mail do pagador.");

    const host = getRequestHost();
    const proto = host?.includes("localhost") ? "http" : "https";
    const baseUrl = `${proto}://${host}`;
    const backUrl = `${baseUrl}/pdv/recebimentos/assinaturas`;

    // MP aceita 'days' / 'months' — mapeia weeks -> days*7
    let freqType = sub.frequency_type as string;
    let freq = Number(sub.frequency);
    if (freqType === "weeks") { freqType = "days"; freq = freq * 7; }

    const body = {
      reason: sub.title,
      external_reference: `sub:${sub.id}`,
      payer_email: sub.payer_email,
      back_url: backUrl,
      auto_recurring: {
        frequency: freq,
        frequency_type: freqType,
        start_date: new Date(sub.next_charge_at + "T12:00:00Z").toISOString(),
        transaction_amount: Number(Number(sub.amount).toFixed(2)),
        currency_id: "BRL",
      },
      status: "pending",
    };

    const res = await fetch(`${MP_BASE}/preapproval`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Mercado Pago: ${t || res.status}`);
    }
    const pre = (await res.json()) as any;
    const preapprovalId: string = pre.id;
    const initPoint: string = pre.init_point ?? pre.sandbox_init_point ?? "";

    await supabase
      .from("subscriptions")
      .update({
        mp_preapproval_id: preapprovalId,
        mp_init_point: initPoint,
        status: "pending",
      })
      .eq("id", sub.id);

    return { preapprovalId, initPoint };
  });
