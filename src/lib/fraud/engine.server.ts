// Onda L Sprint L2 — Motor de antifraude.
// Avalia regras ativas contra o contexto de uma cobrança e retorna score/ação.

type Action = "allow" | "flag" | "block" | "pending_review";

export interface EvalContext {
  sourceType: "payment_link" | "pix_charge" | "sale";
  sourceId?: string | null;
  storeId?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  ip?: string | null;
  amount: number;
  customerCreatedAt?: string | null; // ISO
}

export interface EvalResult {
  score: number;
  action: Action;
  reasons: Array<{ ruleId: string; ruleName: string; type: string; weight: number; detail?: string }>;
}

function digits(s?: string | null) { return (s ?? "").replace(/\D+/g, ""); }

/** Aplica as regras habilitadas e devolve o resultado consolidado. */
export async function evaluateTransaction(ctx: EvalContext): Promise<EvalResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const { data: rules } = await admin
    .from("fraud_rules").select("*").eq("enabled", true);
  const activeRules = (rules ?? []) as any[];

  const reasons: EvalResult["reasons"] = [];
  let score = 0;
  let hardBlock = false;

  // 1) Blocklist
  const blocklistRule = activeRules.find(r => r.rule_type === "blocklist");
  if (blocklistRule) {
    const checks: Array<{ kind: string; value: string }> = [];
    const cpf = digits(ctx.cpf); if (cpf) checks.push({ kind: "cpf", value: cpf });
    if (ctx.email) checks.push({ kind: "email", value: ctx.email.toLowerCase().trim() });
    const phone = digits(ctx.phone); if (phone) checks.push({ kind: "phone", value: phone });
    if (ctx.ip) checks.push({ kind: "ip", value: ctx.ip });
    for (const c of checks) {
      const { data: hit } = await admin.from("fraud_blocklist")
        .select("id, reason, expires_at").eq("kind", c.kind).eq("value", c.value).maybeSingle();
      if (hit && (!hit.expires_at || new Date(hit.expires_at) > new Date())) {
        reasons.push({ ruleId: blocklistRule.id, ruleName: blocklistRule.name, type: "blocklist", weight: blocklistRule.weight, detail: `${c.kind}=${c.value}${hit.reason ? ` (${hit.reason})` : ""}` });
        score += Number(blocklistRule.weight || 100);
        if (blocklistRule.action === "block") hardBlock = true;
        break;
      }
    }
  }

  // 2) Velocity — cobranças pelo CPF em janela
  const velocityRule = activeRules.find(r => r.rule_type === "velocity");
  if (velocityRule && ctx.cpf) {
    const cpf = digits(ctx.cpf);
    const windowMin = Number(velocityRule.window_minutes || 10);
    const threshold = Number(velocityRule.threshold || 5);
    const since = new Date(Date.now() - windowMin * 60_000).toISOString();
    const { count } = await admin.from("fraud_events")
      .select("id", { count: "exact", head: true })
      .eq("cpf", cpf).gte("created_at", since);
    if ((count ?? 0) + 1 >= threshold) {
      reasons.push({ ruleId: velocityRule.id, ruleName: velocityRule.name, type: "velocity", weight: velocityRule.weight, detail: `${(count ?? 0) + 1} tentativas em ${windowMin}min` });
      score += Number(velocityRule.weight || 40);
      if (velocityRule.action === "block") hardBlock = true;
    }
  }

  // 3) High value
  const highValueRule = activeRules.find(r => r.rule_type === "high_value");
  if (highValueRule && ctx.amount >= Number(highValueRule.threshold || 5000)) {
    reasons.push({ ruleId: highValueRule.id, ruleName: highValueRule.name, type: "high_value", weight: highValueRule.weight, detail: `R$ ${ctx.amount.toFixed(2)}` });
    score += Number(highValueRule.weight || 30);
    if (highValueRule.action === "block") hardBlock = true;
  }

  // 4) Cliente novo + alto valor
  const newHighRule = activeRules.find(r => r.rule_type === "new_customer_high_value");
  if (newHighRule && ctx.customerCreatedAt && ctx.amount >= Number(newHighRule.threshold || 1000)) {
    const maxDays = Number((newHighRule.config?.max_customer_age_days) || 7);
    const ageDays = (Date.now() - new Date(ctx.customerCreatedAt).getTime()) / 86_400_000;
    if (ageDays < maxDays) {
      reasons.push({ ruleId: newHighRule.id, ruleName: newHighRule.name, type: "new_customer_high_value", weight: newHighRule.weight, detail: `cliente ${ageDays.toFixed(1)}d + R$ ${ctx.amount.toFixed(2)}` });
      score += Number(newHighRule.weight || 50);
      if (newHighRule.action === "block") hardBlock = true;
    }
  }

  score = Math.min(100, score);
  let action: Action = "allow";
  if (hardBlock) action = "block";
  else if (reasons.length > 0) action = reasons.some(r => r.weight >= 50) ? "pending_review" : "flag";

  // registra evento (fire-and-forget)
  try {
    await admin.from("fraud_events").insert({
      store_id: ctx.storeId ?? null,
      source_type: ctx.sourceType,
      source_id: ctx.sourceId ?? null,
      cpf: digits(ctx.cpf) || null,
      email: ctx.email?.toLowerCase().trim() || null,
      phone: digits(ctx.phone) || null,
      ip: ctx.ip ?? null,
      amount: ctx.amount,
      score,
      action_taken: action,
      reasons: reasons as any,
      metadata: {} as any,
    });
  } catch (e) {
    console.error("[fraud] insert event falhou:", (e as Error).message);
  }

  // auto-blocklist: 3 flags do mesmo CPF em 7 dias → adiciona
  if (action !== "allow" && ctx.cpf) {
    const cpf = digits(ctx.cpf);
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count } = await admin.from("fraud_events")
      .select("id", { count: "exact", head: true })
      .eq("cpf", cpf).neq("action_taken", "allow").gte("created_at", since);
    if ((count ?? 0) >= 3) {
      await admin.from("fraud_blocklist").upsert({
        kind: "cpf", value: cpf, reason: "Auto: 3+ eventos suspeitos em 7 dias", auto_added: true,
      } as any, { onConflict: "kind,value,store_id" });
    }
  }

  return { score, action, reasons };
}
