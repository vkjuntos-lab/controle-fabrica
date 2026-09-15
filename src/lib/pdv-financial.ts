import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type FinKind = "income" | "expense";
export type FinStatus = "open" | "paid" | "overdue" | "canceled";
export type FinSource = "sale" | "pix" | "manual" | "payable" | "receivable" | "adjust";

export type FinCategory = {
  id: string;
  store_id: string;
  name: string;
  kind: FinKind;
  parent_id: string | null;
  color: string | null;
  active: boolean;
};

export type BankAccount = {
  id: string;
  store_id: string;
  name: string;
  bank: string | null;
  opening_balance: number;
  is_cash: boolean;
  active: boolean;
};

export type Payable = {
  id: string;
  store_id: string;
  supplier: string | null;
  description: string;
  category_id: string | null;
  competence: string | null;
  due_date: string;
  amount: number;
  status: FinStatus;
  planned_method: string | null;
  bank_account_id: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  attachment_url: string | null;
  recurring: string | null;
  notes: string | null;
  created_at: string;
};

export type Receivable = {
  id: string;
  store_id: string;
  customer_id: string | null;
  customer_name: string | null;
  description: string;
  category_id: string | null;
  sale_id: string | null;
  due_date: string;
  amount: number;
  status: FinStatus;
  planned_method: string | null;
  bank_account_id: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  notes: string | null;
  created_at: string;
};

export type FinTransaction = {
  id: string;
  store_id: string;
  kind: FinKind;
  source: FinSource;
  description: string | null;
  amount: number;
  payment_method: string | null;
  category_id: string | null;
  bank_account_id: string | null;
  payable_id: string | null;
  receivable_id: string | null;
  sale_id: string | null;
  pix_charge_id: string | null;
  paid_at: string;
};

export const payableSchema = z.object({
  supplier: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(300),
  category_id: z.string().uuid().nullable().optional(),
  competence: z.string().nullable().optional(),
  due_date: z.string().min(1, "Vencimento obrigatório"),
  amount: z.number().positive("Valor deve ser positivo"),
  planned_method: z.string().max(40).nullable().optional(),
  bank_account_id: z.string().uuid().nullable().optional(),
  recurring: z.enum(["monthly", "weekly"]).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const receivableSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().min(1).max(300),
  category_id: z.string().uuid().nullable().optional(),
  sale_id: z.string().uuid().nullable().optional(),
  due_date: z.string().min(1),
  amount: z.number().positive(),
  planned_method: z.string().max(40).nullable().optional(),
  bank_account_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/* -------- Client helpers (usam RLS) -------- */

export async function listCategories(storeId: string) {
  const { data, error } = await supabase
    .from("financial_categories")
    .select("*")
    .eq("store_id", storeId)
    .order("kind")
    .order("name");
  if (error) throw error;
  return (data ?? []) as FinCategory[];
}

export async function upsertCategory(row: Partial<FinCategory> & { store_id: string; name: string; kind: FinKind }) {
  const { data, error } = await supabase.from("financial_categories").upsert(row).select().single();
  if (error) throw error;
  return data as FinCategory;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("financial_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function listBankAccounts(storeId: string) {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("store_id", storeId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as BankAccount[];
}

export async function upsertBankAccount(row: Partial<BankAccount> & { store_id: string; name: string }) {
  const { data, error } = await supabase.from("bank_accounts").upsert(row).select().single();
  if (error) throw error;
  return data as BankAccount;
}

export async function listPayables(storeId: string, opts?: { status?: FinStatus | "all" }) {
  let q = supabase.from("accounts_payable").select("*").eq("store_id", storeId).order("due_date");
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Payable[];
}

export async function createPayable(storeId: string, input: z.infer<typeof payableSchema>) {
  const parsed = payableSchema.parse(input);
  const { data, error } = await supabase
    .from("accounts_payable")
    .insert({ ...parsed, store_id: storeId })
    .select()
    .single();
  if (error) throw error;
  return data as Payable;
}

export async function updatePayable(id: string, patch: Partial<Payable>) {
  const { data, error } = await supabase.from("accounts_payable").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Payable;
}

export async function payPayable(id: string, params: { paid_amount?: number; paid_at?: string; bank_account_id?: string | null; planned_method?: string | null }) {
  const patch: Partial<Payable> = {
    status: "paid",
    paid_at: params.paid_at ?? new Date().toISOString(),
    paid_amount: params.paid_amount ?? undefined,
    bank_account_id: params.bank_account_id ?? undefined,
    planned_method: params.planned_method ?? undefined,
  };
  return updatePayable(id, patch);
}

export async function deletePayable(id: string) {
  const { error } = await supabase.from("accounts_payable").delete().eq("id", id);
  if (error) throw error;
}

export async function listReceivables(storeId: string, opts?: { status?: FinStatus | "all" }) {
  let q = supabase.from("accounts_receivable").select("*").eq("store_id", storeId).order("due_date");
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Receivable[];
}

export async function createReceivable(storeId: string, input: z.infer<typeof receivableSchema>) {
  const parsed = receivableSchema.parse(input);
  const { data, error } = await supabase
    .from("accounts_receivable")
    .insert({ ...parsed, store_id: storeId })
    .select()
    .single();
  if (error) throw error;
  return data as Receivable;
}

export async function updateReceivable(id: string, patch: Partial<Receivable>) {
  const { data, error } = await supabase.from("accounts_receivable").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Receivable;
}

export async function payReceivable(id: string, params: { paid_amount?: number; paid_at?: string; bank_account_id?: string | null; planned_method?: string | null }) {
  return updateReceivable(id, {
    status: "paid",
    paid_at: params.paid_at ?? new Date().toISOString(),
    paid_amount: params.paid_amount ?? undefined,
    bank_account_id: params.bank_account_id ?? undefined,
    planned_method: params.planned_method ?? undefined,
  });
}

export async function deleteReceivable(id: string) {
  const { error } = await supabase.from("accounts_receivable").delete().eq("id", id);
  if (error) throw error;
}

export async function listTransactions(storeId: string, opts?: { from?: string; to?: string; limit?: number }) {
  let q = supabase.from("financial_transactions").select("*").eq("store_id", storeId).order("paid_at", { ascending: false });
  if (opts?.from) q = q.gte("paid_at", opts.from);
  if (opts?.to) q = q.lte("paid_at", opts.to);
  q = q.limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinTransaction[];
}

export async function financialSummary(storeId: string) {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [payOpen, recOpen, monthTx] = await Promise.all([
    supabase.from("accounts_payable").select("amount,due_date,status").eq("store_id", storeId).in("status", ["open", "overdue"]),
    supabase.from("accounts_receivable").select("amount,due_date,status").eq("store_id", storeId).in("status", ["open", "overdue"]),
    supabase.from("financial_transactions").select("amount,kind").eq("store_id", storeId).gte("paid_at", monthStart),
  ]);

  const sum = (rows: { amount: number }[] | null | undefined) => (rows ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const sumFilter = <T extends { due_date: string; amount: number }>(rows: T[] | null | undefined, until: string) =>
    (rows ?? []).filter((r) => r.due_date <= until).reduce((s, r) => s + Number(r.amount || 0), 0);

  const overdue = (rows: { due_date: string; amount: number; status: string }[] | null | undefined) =>
    (rows ?? []).filter((r) => r.due_date < today).reduce((s, r) => s + Number(r.amount || 0), 0);

  const monthIncome = (monthTx.data ?? []).filter((t) => t.kind === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthExpense = (monthTx.data ?? []).filter((t) => t.kind === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);

  return {
    payables_open: sum(payOpen.data as { amount: number }[] | null),
    payables_7d: sumFilter(payOpen.data as { due_date: string; amount: number }[] | null, in7),
    payables_30d: sumFilter(payOpen.data as { due_date: string; amount: number }[] | null, in30),
    payables_overdue: overdue(payOpen.data as { due_date: string; amount: number; status: string }[] | null),
    receivables_open: sum(recOpen.data as { amount: number }[] | null),
    receivables_7d: sumFilter(recOpen.data as { due_date: string; amount: number }[] | null, in7),
    receivables_overdue: overdue(recOpen.data as { due_date: string; amount: number; status: string }[] | null),
    month_income: monthIncome,
    month_expense: monthExpense,
    month_net: monthIncome - monthExpense,
  };
}
