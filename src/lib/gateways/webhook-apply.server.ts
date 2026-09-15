// Pipeline compartilhado — aplica um WebhookParsed às tabelas de negócio.
// Usado tanto por /api/public/mp-webhook quanto /api/public/asaas-webhook.
import type { WebhookParsed } from "./types";

export async function applyWebhookUpdate(parsed: WebhookParsed): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { providerId, status, externalRef, amount, method, installments } = parsed;
  const now = new Date().toISOString();

  // ------- Payment link -------
  if (externalRef && externalRef.startsWith("link:")) {
    const linkId = externalRef.slice(5);
    const { data: link } = await admin
      .from("payment_links")
      .select("id, store_id, status, amount")
      .eq("id", linkId)
      .maybeSingle();
    if (!link || link.status === "paid") return;

    if (status === "approved") {
      await admin.from("payment_links").update({
        status: "paid",
        paid_at: now,
        paid_amount: amount ?? Number(link.amount),
        paid_method: method ?? "link",
        installments_paid: installments ?? null,
        mp_payment_id: String(providerId),
        updated_at: now,
      }).eq("id", link.id);

      // Onda K — materializa split entries se houver regras.
      try {
        const { data: full } = await admin
          .from("payment_links")
          .select("splits, provider, paid_amount")
          .eq("id", link.id).maybeSingle();
        if (full?.splits) {
          const { materializeSplitEntries } = await import("./split.server");
          await materializeSplitEntries({
            sourceType: "payment_link",
            sourceId: link.id,
            storeId: link.store_id,
            provider: String(full.provider ?? "mercadopago"),
            providerRef: String(providerId),
            totalAmount: Number(full.paid_amount ?? amount ?? link.amount),
            splits: full.splits,
          });
        }
      } catch (e) { console.error("[webhook-apply] split link falhou", (e as Error).message); }

      // Onda K — se o link veio do agente WhatsApp, finaliza venda + baixa estoque + confirma no WA.
      try {
        const { finalizePaidPaymentLink } = await import("@/lib/wa-agent-finalize.server");
        await finalizePaidPaymentLink(link.id);
      } catch (e) { console.error("[webhook-apply] finalize wa link falhou", (e as Error).message); }
    } else if (status === "cancelled" || status === "expired") {
      await admin.from("payment_links")
        .update({ status: status === "expired" ? "expired" : "canceled", updated_at: now })
        .eq("id", link.id);
    }

    try {
      await admin.from("audit_log").insert({
        actor_user_id: null, actor_name: "Gateway webhook", actor_role: "system",
        store_id: link.store_id,
        action: `payment_link.webhook.${status}`,
        entity: "payment_link", entity_id: link.id,
        details: { provider_payment_id: providerId, external_reference: externalRef },
      });
    } catch { /* */ }
    return;
  }

  // ------- Subscription -------
  if (externalRef && externalRef.startsWith("sub:")) {
    const subId = externalRef.slice(4);
    const { data: sub } = await admin
      .from("subscriptions").select("id, store_id, amount, status")
      .eq("id", subId).maybeSingle();
    if (!sub) return;

    const chargeStatus = status === "approved" ? "paid"
      : status === "cancelled" ? "failed" : "pending";

    const { data: existing } = await admin
      .from("subscription_charges").select("id, status")
      .eq("mp_payment_id", String(providerId)).maybeSingle();

    if (existing) {
      if (existing.status !== chargeStatus) {
        await admin.from("subscription_charges").update({
          status: chargeStatus,
          charged_at: chargeStatus === "paid" ? now : null,
        }).eq("id", existing.id);
      }
    } else {
      await admin.from("subscription_charges").insert({
        subscription_id: sub.id, store_id: sub.store_id,
        amount: amount ?? Number(sub.amount),
        status: chargeStatus, mp_payment_id: String(providerId),
        charged_at: chargeStatus === "paid" ? now : null,
      });
    }

    if (chargeStatus === "paid" && sub.status !== "active" && sub.status !== "completed") {
      await admin.from("subscriptions").update({ status: "active" }).eq("id", sub.id);
    }
    try {
      await admin.from("audit_log").insert({
        actor_user_id: null, actor_name: "Gateway webhook", actor_role: "system",
        store_id: sub.store_id, action: `subscription.webhook.${chargeStatus}`,
        entity: "subscription", entity_id: sub.id,
        details: { provider_payment_id: providerId, external_reference: externalRef },
      });
    } catch { /* */ }
    return;
  }

  // ------- Boleto (externalRef "bol:<uuid>") -------
  if (externalRef && externalRef.startsWith("bol:")) {
    const boletoId = externalRef.slice(4);
    if (status === "approved") {
      await admin.from("boletos").update({
        status: "paid", paid_at: now,
      }).eq("id", boletoId);
    } else if (status === "cancelled" || status === "expired") {
      await admin.from("boletos").update({
        status: status === "expired" ? "expired" : "canceled",
      }).eq("id", boletoId);
    }
    return;
  }

  // ------- PIX charge (busca por mp_payment_id) -------
  const { data: found } = await admin
    .from("pix_charges")
    .select("id, store_id, status, amount, credit_installment_id, splits, provider")
    .eq("mp_payment_id", String(providerId))
    .maybeSingle();

  if (!found) {
    console.warn("[webhook-apply] cobrança não encontrada", providerId, externalRef);
    return;
  }
  if (found.status === "approved") return;

  const update: Record<string, unknown> = { updated_at: now };
  if (status === "approved") {
    update.status = "approved";
    update.approved_at = now;
  } else if (status === "cancelled") {
    update.status = "cancelled";
    update.cancelled_at = now;
  } else {
    return;
  }
  await admin.from("pix_charges").update(update).eq("id", found.id);

  if (update.status === "approved" && found.credit_installment_id) {
    try {
      await admin.rpc("system_pay_installment", {
        _installment_id: found.credit_installment_id,
        _amount: Number(found.amount),
        _method: "pix",
        _pix_charge: found.id,
      });
    } catch (e) {
      console.error("[webhook-apply] system_pay_installment falhou", (e as Error).message);
    }
  }

  if (update.status === "approved" && found.splits) {
    try {
      const { materializeSplitEntries } = await import("./split.server");
      await materializeSplitEntries({
        sourceType: "pix_charge",
        sourceId: found.id,
        storeId: found.store_id,
        provider: String(found.provider ?? "mercadopago"),
        providerRef: String(providerId),
        totalAmount: Number(amount ?? found.amount),
        splits: found.splits,
      });
    } catch (e) { console.error("[webhook-apply] split pix falhou", (e as Error).message); }
  }

  try {
    await admin.from("audit_log").insert({
      actor_user_id: null, actor_name: "Gateway webhook", actor_role: "system",
      store_id: found.store_id, action: `pix.webhook.${update.status}`,
      entity: "pix_charge", entity_id: found.id,
      details: { provider_payment_id: providerId, external_reference: externalRef },
    });
  } catch { /* */ }
}
