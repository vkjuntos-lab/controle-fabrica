// Server-only: quando um payment_link é aprovado, cria a venda,
// dá baixa no estoque (FIFO por validade) e envia a confirmação no WhatsApp.
import { sendWhatsAppWithCreds, type WaCredentials } from "./wa-driver.server";

type CartLine = { product_id: string; name: string; qty: number; unit_price: number };
type Fulfillment = {
  mode: "delivery" | "pickup";
  address?: string | null;
  city?: string | null;
  notes?: string | null;
};

function brl(n: number) {
  return `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
}

/**
 * Finaliza um payment_link recém-aprovado:
 *  - grava venda em `sales`
 *  - insere stock_movements (kind='sale') distribuindo por lotes FIFO
 *  - envia mensagem de confirmação no WhatsApp (se houver conversa vinculada)
 *
 * Idempotente: se link.sale_id já existir, apenas retorna.
 */
export async function finalizePaidPaymentLink(linkId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const { data: link } = await admin
    .from("payment_links")
    .select("id,store_id,customer_id,code,amount,paid_amount,paid_method,items,fulfillment,wa_conversation_id,sale_id,fulfilled_at,description")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return;
  if (link.sale_id || link.fulfilled_at) return; // já finalizado

  const items: CartLine[] = Array.isArray(link.items) ? link.items : [];
  const fulfillment: Fulfillment | null = link.fulfillment ?? null;
  const storeId = link.store_id as string;

  // ---------- 1) Baixa de estoque (FIFO) ----------
  const saleLines: Array<{
    product_id: string;
    name: string;
    qty: number;
    unit_price: number;
    lot_id?: string;
  }> = [];
  const movements: Array<{
    lot_id: string;
    store_id: string;
    kind: "sale";
    qty: number;
    note: string;
  }> = [];

  for (const line of items) {
    if (!line?.product_id || !line.qty) continue;
    let remaining = Number(line.qty);
    const { data: lots } = await admin
      .from("product_lots")
      .select("id, qty, validity, created_at")
      .eq("store_id", storeId)
      .eq("product_id", line.product_id)
      .gt("qty", 0)
      .order("validity", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    const chosen: Array<{ lot_id: string; qty: number }> = [];
    for (const lot of (lots ?? []) as any[]) {
      if (remaining <= 0) break;
      const take = Math.min(Number(lot.qty), remaining);
      if (take <= 0) continue;
      chosen.push({ lot_id: lot.id, qty: take });
      remaining -= take;
    }

    // Se faltou estoque, ainda registra a venda mas anota o backorder no primeiro lote (ou pula).
    if (remaining > 0 && chosen.length > 0) {
      chosen[chosen.length - 1].qty += remaining; // negativo depois? Não — deixamos backorder no último lote.
      remaining = 0;
    }

    if (chosen.length === 0) {
      // sem lote — grava a linha sem lot_id (não gera stock_movement)
      saleLines.push({
        product_id: line.product_id,
        name: line.name,
        qty: line.qty,
        unit_price: line.unit_price,
      });
      continue;
    }

    // Primeira linha recebe lot_id principal (SaleLine); movimentos cobrem todos os lotes.
    saleLines.push({
      product_id: line.product_id,
      name: line.name,
      qty: line.qty,
      unit_price: line.unit_price,
      lot_id: chosen[0].lot_id,
    });
    for (const c of chosen) {
      movements.push({
        lot_id: c.lot_id,
        store_id: storeId,
        kind: "sale",
        qty: c.qty,
        note: `wa-agent link=${link.code}`,
      });
    }
  }

  if (movements.length > 0) {
    await admin.from("stock_movements").insert(movements);
  }

  // ---------- 2) Cria a venda ----------
  const total = Number(link.paid_amount ?? link.amount);
  const payments = [{ method: link.paid_method ?? "link", amount: total }];
  const salePayload = {
    code: `WA-${link.code}`,
    customer_id: link.customer_id,
    store_id: storeId,
    total,
    cashback_used: 0,
    lines: saleLines,
    payments,
    operator: "wa-agent",
  };
  const { data: sale, error: saleErr } = await admin
    .from("sales")
    .insert(salePayload)
    .select("id, code")
    .single();
  if (saleErr) {
    console.error("[wa-finalize] sale insert:", saleErr.message);
  }

  await admin
    .from("payment_links")
    .update({
      sale_id: (sale as any)?.id ?? null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", link.id);

  // ---------- 3) Confirmação no WhatsApp (com retry em falha temporária) ----------
  if (link.wa_conversation_id) {
    const { data: conv } = await admin
      .from("wa_conversations")
      .select("id, phone, store_id")
      .eq("id", link.wa_conversation_id)
      .maybeSingle();
    if (conv) {
      const { data: settings } = await admin
        .from("wa_settings")
        .select("provider, active, cloud_token, cloud_phone_id, cloud_template_name, cloud_template_lang, zapi_instance_id, zapi_token, zapi_client_token")
        .eq("store_id", (conv as any).store_id)
        .maybeSingle();

      const linesTxt = items
        .map((l) => `• ${l.qty}x ${l.name} — ${brl(l.qty * l.unit_price)}`)
        .join("\n");
      const fulfilTxt = fulfillment
        ? fulfillment.mode === "pickup"
          ? "🏪 Retirada no balcão da loja."
          : `🚚 Entrega: ${fulfillment.address ?? ""}${fulfillment.city ? " — " + fulfillment.city : ""}`
        : "";

      const message =
        `✅ Pagamento confirmado! Pedido *${(sale as any)?.code ?? link.code}*.\n\n` +
        `${linesTxt}\n\n` +
        `Total: *${brl(total)}*\n` +
        `${fulfilTxt ? fulfilTxt + "\n" : ""}` +
        `\nObrigado pela compra! 💜 Qualquer dúvida é só chamar por aqui.`;

      if (settings) {
        // Retry: 3 tentativas com backoff 1s, 3s, 8s em erros temporários (5xx, timeout, rede).
        const maxAttempts = 3;
        let attempt = 0;
        let lastError: string | null = null;
        let sent = false;
        let providerLabel = (settings as any).provider ?? "wa_link";
        while (attempt < maxAttempts && !sent) {
          attempt++;
          const res = await sendWhatsAppWithCreds(
            settings as WaCredentials,
            (conv as any).phone,
            message,
          );
          providerLabel = res.provider;
          await admin.from("wa_messages").insert({
            conversation_id: (conv as any).id,
            direction: res.ok ? "outbound" : "system",
            text: res.ok ? message : `[falha envio confirmação tentativa ${attempt}] ${res.error ?? "erro"}`,
            meta: {
              source: "payment_confirmation",
              provider: res.provider,
              ok: res.ok,
              error: res.error ?? null,
              attempt,
            },
          });
          if (res.ok) {
            sent = true;
            break;
          }
          lastError = res.error ?? "unknown";
          // Retry apenas em erros temporários (5xx / rede / timeout).
          const retryable =
            /(_5\d\d:|timeout|network|ECONN|ETIMEDOUT|fetch failed|ENOTFOUND)/i.test(lastError);
          if (!retryable) break;
          if (attempt < maxAttempts) {
            const delay = attempt === 1 ? 1000 : attempt === 2 ? 3000 : 8000;
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        await admin
          .from("payment_links")
          .update({
            confirmation_sent_at: sent ? new Date().toISOString() : null,
            confirmation_attempts: attempt,
            confirmation_last_error: sent ? null : lastError,
          })
          .eq("id", link.id);

        if (!sent) {
          console.warn(
            `[wa-finalize] confirmação falhou após ${attempt} tentativas p/ link=${link.code} provider=${providerLabel}: ${lastError}`,
          );
        }
      }

      // Limpa o carrinho da conversa
      await admin.from("wa_conversations").update({ cart: [] }).eq("id", (conv as any).id);
    }
  }
}

/**
 * Reenvia manualmente a confirmação de um pedido (usado pelo painel).
 * Não recria a venda — só tenta enviar a mensagem novamente e atualiza o contador.
 */
export async function resendPaymentConfirmation(linkId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: link } = await admin
    .from("payment_links")
    .select("id,store_id,code,amount,paid_amount,items,fulfillment,wa_conversation_id,confirmation_attempts")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "not_found" };
  if (!link.wa_conversation_id) return { ok: false, error: "sem_conversa_wa" };
  const { data: conv } = await admin
    .from("wa_conversations")
    .select("id, phone, store_id")
    .eq("id", link.wa_conversation_id)
    .maybeSingle();
  if (!conv) return { ok: false, error: "conversa_inexistente" };
  const { data: settings } = await admin
    .from("wa_settings")
    .select("provider, active, cloud_token, cloud_phone_id, cloud_template_name, cloud_template_lang, zapi_instance_id, zapi_token, zapi_client_token")
    .eq("store_id", (conv as any).store_id)
    .maybeSingle();
  if (!settings) return { ok: false, error: "sem_credenciais" };
  const items: CartLine[] = Array.isArray(link.items) ? link.items : [];
  const fulfillment: Fulfillment | null = link.fulfillment ?? null;
  const total = Number(link.paid_amount ?? link.amount);
  const linesTxt = items.map((l) => `• ${l.qty}x ${l.name} — ${brl(l.qty * l.unit_price)}`).join("\n");
  const fulfilTxt = fulfillment
    ? fulfillment.mode === "pickup"
      ? "🏪 Retirada no balcão da loja."
      : `🚚 Entrega: ${fulfillment.address ?? ""}${fulfillment.city ? " — " + fulfillment.city : ""}`
    : "";
  const message =
    `✅ Pagamento confirmado! Pedido *${link.code}*.\n\n${linesTxt}\n\nTotal: *${brl(total)}*\n` +
    `${fulfilTxt ? fulfilTxt + "\n" : ""}\nObrigado pela compra! 💜`;

  const res = await sendWhatsAppWithCreds(settings as WaCredentials, (conv as any).phone, message);
  await admin.from("wa_messages").insert({
    conversation_id: (conv as any).id,
    direction: res.ok ? "outbound" : "system",
    text: res.ok ? message : `[reenvio manual falhou] ${res.error ?? "erro"}`,
    meta: { source: "payment_confirmation_resend", provider: res.provider, ok: res.ok, error: res.error ?? null },
  });
  await admin
    .from("payment_links")
    .update({
      confirmation_sent_at: res.ok ? new Date().toISOString() : null,
      confirmation_attempts: (Number(link.confirmation_attempts) || 0) + 1,
      confirmation_last_error: res.ok ? null : res.error ?? "unknown",
    })
    .eq("id", link.id);
  return { ok: res.ok, error: res.error };
}
