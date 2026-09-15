import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron } from "@/lib/cron-auth.server";

/**
 * Cron diário do Crediário Inteligente.
 *
 * Autenticação: header `x-cron-secret`, `Authorization: Bearer <secret>`
 * ou query `?secret=` — comparado contra CRON_SECRET/MP_WEBHOOK_SECRET.
 * A chave pública do Supabase NÃO é aceita.
 */

export const Route = createFileRoute("/api/public/hooks/credit-collections")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const mpToken = process.env.MP_ACCESS_TOKEN ?? "";
        const admin = supabaseAdmin as any;
        const nowIso = new Date().toISOString();

        // 1) marca vencidas
        await admin
          .from("credit_installments")
          .update({ status: "overdue", updated_at: nowIso })
          .eq("status", "open")
          .lt("vencimento", new Date().toISOString().slice(0, 10));

        // 2) parcelas ainda não pagas
        const { data: installments } = await admin
          .from("credit_installments")
          .select("id, credit_sale_id, customer_id, store_id, numero, vencimento, valor, status")
          .in("status", ["open", "overdue"]);

        const { data: rulesAll } = await admin
          .from("collection_rules")
          .select("*")
          .eq("active", true);

        const { data: customers } = await admin
          .from("customers")
          .select("id, name, phone");

        const custMap = new Map<string, { name: string; phone: string | null }>();
        (customers ?? []).forEach((c: any) => custMap.set(c.id, { name: c.name, phone: c.phone }));

        const rulesByStore = new Map<string, any[]>();
        (rulesAll ?? []).forEach((r: any) => {
          const arr = rulesByStore.get(r.store_id) ?? [];
          arr.push(r);
          rulesByStore.set(r.store_id, arr);
        });

        let sent = 0;
        let blocked = 0;
        let pixCreated = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const inst of installments ?? []) {
          const due = new Date(inst.vencimento + "T00:00:00");
          const diffDays = Math.round((today.getTime() - due.getTime()) / 86_400_000);
          const rules = rulesByStore.get(inst.store_id) ?? [];
          const rule = rules.find((r: any) => r.offset_days === diffDays);
          if (!rule) continue;

          // Já enviamos essa regra p/ essa parcela?
          const { data: existing } = await admin
            .from("collection_events")
            .select("id")
            .eq("installment_id", inst.id)
            .eq("offset_days", diffDays)
            .maybeSingle();
          if (existing) continue;

          const cust = custMap.get(inst.customer_id);
          if (!cust) continue;

          let pixChargeId: string | null = null;
          let pixLink = "";

          // 3) gera PIX quando aplicável
          if (rule.auto_pix && mpToken && cust.phone) {
            try {
              const idem = crypto.randomUUID();
              const expires = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
              const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${mpToken}`,
                  "Content-Type": "application/json",
                  "X-Idempotency-Key": idem,
                },
                body: JSON.stringify({
                  transaction_amount: Number(Number(inst.valor).toFixed(2)),
                  description: `Parcela ${inst.numero} — Crediário`,
                  payment_method_id: "pix",
                  date_of_expiration: expires,
                  payer: {
                    email: `credit+${inst.id.slice(0, 8)}@ksmultimake.local`,
                    first_name: cust.name?.split(" ")[0] ?? "Cliente",
                  },
                  external_reference: `credit:${inst.id}`,
                }),
              });
              if (mpRes.ok) {
                const mp = (await mpRes.json()) as any;
                const qr: string | undefined = mp?.point_of_interaction?.transaction_data?.qr_code;
                const ticket: string | undefined = mp?.point_of_interaction?.transaction_data?.ticket_url;
                const qrB64: string | undefined = mp?.point_of_interaction?.transaction_data?.qr_code_base64;

                const { data: pix } = await admin
                  .from("pix_charges")
                  .insert({
                    store_id: inst.store_id,
                    customer_id: inst.customer_id,
                    sale_code: `CRED-${inst.id.slice(0, 8)}-${inst.numero}`,
                    amount: Number(inst.valor),
                    customer_phone: cust.phone ?? "",
                    mp_payment_id: String(mp.id),
                    mp_qr_code: qr,
                    mp_qr_code_base64: qrB64 ?? null,
                    mp_ticket_url: ticket ?? null,
                    status: "pending",
                    expires_at: expires,
                    credit_installment_id: inst.id,
                  })
                  .select("id")
                  .single();
                pixChargeId = pix?.id ?? null;
                pixLink = ticket ?? qr ?? "";
                pixCreated++;
                if (pixChargeId) {
                  await admin
                    .from("credit_installments")
                    .update({ pix_charge_id: pixChargeId })
                    .eq("id", inst.id);
                }
              } else {
                console.warn("[collections] MP fail", mpRes.status);
              }
            } catch (e) {
              console.error("[collections] MP erro", (e as Error).message);
            }
          }

          // Monta mensagem
          const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
            .format(Number(inst.valor));
          const vencStr = due.toLocaleDateString("pt-BR");
          const msg = String(rule.template)
            .replaceAll("{cliente}", cust.name.split(" ")[0])
            .replaceAll("{valor}", brl)
            .replaceAll("{vencimento}", vencStr)
            .replaceAll("{dias}", String(Math.abs(diffDays)))
            .replaceAll("{pix}", pixLink);

          const phoneDigits = (cust.phone ?? "").replace(/\D+/g, "");
          const waUrl = phoneDigits
            ? `https://wa.me/${phoneDigits.length === 11 ? "55" + phoneDigits : phoneDigits}?text=${encodeURIComponent(msg)}`
            : null;

          // 4) bloqueio automático
          if (rule.auto_block) {
            try {
              await admin.rpc("system_block_customer", {
                _customer: inst.customer_id,
                _store: inst.store_id,
                _reason: `Atraso ${diffDays}d — parcela ${inst.numero}`,
              });
              blocked++;
            } catch (e) {
              console.error("[collections] block err", (e as Error).message);
            }
          }

          // 5) registra evento
          await admin.from("collection_events").insert({
            installment_id: inst.id,
            store_id: inst.store_id,
            customer_id: inst.customer_id,
            rule_id: rule.id,
            offset_days: diffDays,
            level: rule.level,
            channel: "whatsapp",
            message: msg,
            wa_url: waUrl,
            pix_charge_id: pixChargeId,
            status: rule.notify_manager ? "queued" : "queued",
          });
          sent++;
        }

        // 6) Onda C: aplica penalidade de score em parcelas 30+ dias em atraso
        let penalized = 0;
        try {
          const { data: pen } = await admin.rpc("apply_overdue_penalties");
          penalized = Number(pen ?? 0);
        } catch (e) {
          console.error("[collections] penalty err", (e as Error).message);
        }

        return Response.json({ ok: true, sent, pixCreated, blocked, penalized });
      },
      GET: async () => new Response("credit-collections ok", { status: 200 }),
    },
  },
});
