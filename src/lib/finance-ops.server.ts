// Lógica de Contas a Pagar/Receber e conciliação. Mantida fora do módulo
// *.functions.ts para não vazar runtime no bundle do cliente.

export type OverdueCharges = {
  originalAmount: number;
  penalty: number;
  interest: number;
  total: number;
  daysOverdue: number;
};

/** Multa de 2% + juros de 1% ao mês (0,033%/dia), padrão de mercado BR. */
export const PENALTY_RATE = 0.02;
export const DAILY_INTEREST_RATE = 0.00033;

export function computeOverdueCharges(amount: number, dueDate: string, today = new Date()): OverdueCharges {
  const base = Number(amount) || 0;
  const due = new Date(`${String(dueDate).slice(0, 10)}T00:00:00Z`);
  const ref = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const daysOverdue = Math.max(0, Math.floor((ref.getTime() - due.getTime()) / 86_400_000));
  if (daysOverdue === 0) {
    return { originalAmount: base, penalty: 0, interest: 0, total: base, daysOverdue: 0 };
  }
  const penalty = base * PENALTY_RATE;
  const interest = base * DAILY_INTEREST_RATE * daysOverdue;
  return {
    originalAmount: base,
    penalty: Math.round(penalty * 100) / 100,
    interest: Math.round(interest * 100) / 100,
    total: Math.round((base + penalty + interest) * 100) / 100,
    daysOverdue,
  };
}

/** Registra evidência de execução de rotina financeira em audit_log. */
export async function logFinanceRoutine(
  supabase: any,
  params: { storeId: string | null; action: string; entity: string; entityId?: string | null; details: Record<string, unknown> },
) {
  try {
    await supabase.from("audit_log").insert({
      store_id: params.storeId,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      details: params.details,
    });
  } catch {
    /* auditoria nunca deve quebrar a rotina */
  }
}
