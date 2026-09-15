import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Módulo Avançado de Contas a Pagar & Receber
 * Inclui: Provisões, Alertas, Juros/Multa e Conciliação Automática (Gateway)
 */

// --- Contas a Pagar: Provisões & Alertas ---

export const getPayablesAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ storeId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const limit = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const { data: alerts } = await supabase
      .from("accounts_payable")
      .select("id, description, supplier, due_date, amount, status, notes")
      .eq("store_id", data.storeId)
      .in("status", ["open", "overdue"])
      .lte("due_date", limit)
      .order("due_date");

    return (alerts ?? []) as Array<{
      id: string; description: string; supplier: string | null;
      due_date: string; amount: number; status: string; notes: string | null;
    }>;
  });

export const createProvision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      storeId: z.string(),
      description: z.string().min(1),
      due_date: z.string().min(1),
      amount: z.number().positive(),
      supplier: z.string().nullable().optional(),
      category_id: z.string().uuid().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { logFinanceRoutine } = await import("@/lib/finance-ops.server");
    const { storeId, notes, ...rest } = data;
    const { data: entry, error } = await supabase
      .from("accounts_payable")
      .insert({ ...rest, store_id: storeId, status: "open", notes: `${notes ?? ""} [PROVISÃO]`.trim() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logFinanceRoutine(supabase, {
      storeId, action: "payable.provision.create", entity: "accounts_payable",
      entityId: entry.id, details: { amount: rest.amount, due_date: rest.due_date },
    });
    return entry;
  });

// --- Contas a Receber: Juros, Multa & Baixa Automática ---

export const calculateOverdueCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ receivableId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { computeOverdueCharges, logFinanceRoutine } = await import("@/lib/finance-ops.server");
    const { data: rec, error } = await supabase
      .from("accounts_receivable")
      .select("id, store_id, amount, due_date, status")
      .eq("id", data.receivableId)
      .single();
    if (error || !rec) throw new Error(error?.message ?? "Título não encontrado");

    if (rec.status === "paid" || rec.status === "canceled") {
      return { originalAmount: Number(rec.amount), penalty: 0, interest: 0, total: Number(rec.amount), daysOverdue: 0 };
    }

    const charges = computeOverdueCharges(Number(rec.amount), rec.due_date);
    await logFinanceRoutine(supabase, {
      storeId: rec.store_id, action: "receivable.charges.calculate",
      entity: "accounts_receivable", entityId: rec.id, details: charges as any,
    });
    return charges;
  });

/** Dá baixa no título aplicando juros e multa calculados. */
export const settleReceivableWithCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ receivableId: z.string(), bankAccountId: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { computeOverdueCharges, logFinanceRoutine } = await import("@/lib/finance-ops.server");
    const { data: rec, error } = await supabase
      .from("accounts_receivable")
      .select("id, store_id, amount, due_date, status, notes")
      .eq("id", data.receivableId)
      .single();
    if (error || !rec) throw new Error(error?.message ?? "Título não encontrado");

    const charges = computeOverdueCharges(Number(rec.amount), rec.due_date);
    const patch: Record<string, unknown> = {
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount: charges.total,
      notes: charges.daysOverdue > 0
        ? `${rec.notes ?? ""} [juros ${charges.interest} + multa ${charges.penalty} — ${charges.daysOverdue}d]`.trim()
        : rec.notes,
    };
    if (data.bankAccountId) patch['bank_account_id'] = data.bankAccountId;

    const { error: upErr } = await supabase.from("accounts_receivable").update(patch).eq("id", rec.id);
    if (upErr) throw new Error(upErr.message);

    await logFinanceRoutine(supabase, {
      storeId: rec.store_id, action: "receivable.settle", entity: "accounts_receivable",
      entityId: rec.id, details: charges as any,
    });
    return charges;
  });

/** Marca como vencidos os títulos em aberto com data passada (acompanhamento de inadimplência). */
export const refreshOverdueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ storeId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { logFinanceRoutine } = await import("@/lib/finance-ops.server");
    const today = new Date().toISOString().slice(0, 10);
    const results: Record<string, number> = {};
    for (const table of ["accounts_receivable", "accounts_payable"]) {
      const { data: rows } = await supabase
        .from(table)
        .update({ status: "overdue" })
        .eq("store_id", data.storeId)
        .eq("status", "open")
        .lt("due_date", today)
        .select("id");
      results[table] = (rows ?? []).length;
    }
    await logFinanceRoutine(supabase, {
      storeId: data.storeId, action: "finance.refresh_overdue", entity: "system", details: results,
    });
    return results;
  });

// --- Conciliação Mercado Pago / PIX ---

export const syncGatewayTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ storeId: z.string(), gateway: z.enum(["mercado_pago", "pix"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { runReconciliation } = await import("@/lib/gateways/reconcile.server");
    const summary = await runReconciliation({ storeId: data.storeId, limit: 200 });
    return {
      synced: true,
      processed: summary.scanned,
      matched: summary.updated,
      errors: summary.errors,
      details: summary.details.slice(0, 20),
    };
  });
