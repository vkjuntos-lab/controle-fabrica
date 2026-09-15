import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MP_BASE = "https://api.mercadopago.com";

const schema = z.object({ installmentId: z.string().uuid() });

/**
 * Gera um PIX Mercado Pago para uma parcela específica do crediário.
 * Vincula pix_charges.credit_installment_id → parcela.
 * Quando o webhook receber o pagamento, dá baixa automática via system_pay_installment.
 */
export const generateInstallmentPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId as string;
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error("MP_ACCESS_TOKEN não configurado.");

    const { data: inst, error: e1 } = await supabase
      .from("credit_installments")
      .select("id, credit_sale_id, customer_id, store_id, numero, vencimento, valor, status")
      .eq("id", data.installmentId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!inst) throw new Error("Parcela não encontrada.");
    if (inst.status === "paid") throw new Error("Parcela já paga.");

    const { data: cust } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("id", inst.customer_id)
      .maybeSingle();

    const phoneDigits = (cust?.phone ?? "").replace(/\D+/g, "");
    const expires = new Date(Date.now() + 48 * 60 * 60_000).toISOString();

    const mpRes = await fetch(`${MP_BASE}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: Number(Number(inst.valor).toFixed(2)),
        description: `Parcela ${inst.numero} — Crediário`,
        payment_method_id: "pix",
        date_of_expiration: expires,
        payer: {
          email: `credit+${inst.id.slice(0, 8)}@ksmultimake.local`,
          first_name: cust?.name?.split(" ")[0] ?? "Cliente",
        },
        external_reference: `credit:${inst.id}`,
      }),
    });
    if (!mpRes.ok) {
      const t = await mpRes.text();
      throw new Error(`Mercado Pago: ${t || mpRes.status}`);
    }
    const mp = (await mpRes.json()) as any;
    const qr: string | undefined = mp?.point_of_interaction?.transaction_data?.qr_code;
    const ticket: string | undefined = mp?.point_of_interaction?.transaction_data?.ticket_url;
    const qrB64: string | undefined = mp?.point_of_interaction?.transaction_data?.qr_code_base64;
    if (!qr) throw new Error("MP não retornou QR.");

    const { data: pix, error: e2 } = await supabase
      .from("pix_charges")
      .insert({
        store_id: inst.store_id,
        customer_id: inst.customer_id,
        operator_user_id: userId,
        sale_code: `CRED-${inst.id.slice(0, 8)}-${inst.numero}`,
        amount: Number(inst.valor),
        customer_phone: phoneDigits,
        mp_payment_id: String(mp.id),
        mp_qr_code: qr,
        mp_qr_code_base64: qrB64 ?? null,
        mp_ticket_url: ticket ?? null,
        status: "pending",
        expires_at: expires,
        credit_installment_id: inst.id,
      })
      .select("id, mp_qr_code, mp_qr_code_base64, mp_ticket_url, expires_at")
      .single();
    if (e2) throw new Error(e2.message);

    await supabase
      .from("credit_installments")
      .update({ pix_charge_id: pix.id })
      .eq("id", inst.id);

    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(Number(inst.valor));
    const vencStr = new Date(inst.vencimento + "T00:00:00").toLocaleDateString("pt-BR");
    const msg =
      `Olá ${cust?.name?.split(" ")[0] ?? ""}! Sua parcela ${inst.numero} de ${brl} ` +
      `(venc. ${vencStr}). Pague pelo PIX: ${ticket ?? qr}`;
    const waUrl = phoneDigits
      ? `https://wa.me/${phoneDigits.length === 11 ? "55" + phoneDigits : phoneDigits}?text=${encodeURIComponent(msg)}`
      : null;

    return {
      pixChargeId: pix.id as string,
      qrCode: pix.mp_qr_code as string,
      qrCodeBase64: (pix.mp_qr_code_base64 as string) ?? null,
      ticketUrl: (pix.mp_ticket_url as string) ?? null,
      expiresAt: pix.expires_at as string,
      whatsappUrl: waUrl,
      message: msg,
    };
  });
