import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus, Check, Trash2, TrendingUp, TrendingDown, AlertTriangle, Wallet } from "lucide-react";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { brl } from "@/lib/pdv-store";
import {
  listCategories, listBankAccounts, listPayables, listReceivables, listTransactions,
  financialSummary, createPayable, createReceivable, payPayable, payReceivable,
  deletePayable, deleteReceivable, upsertCategory, deleteCategory, upsertBankAccount,
  type FinStatus, type Payable, type Receivable, type FinCategory,
} from "@/lib/pdv-financial";

export const Route = createFileRoute("/pdv/financeiro")({
  component: FinanceiroPage,
});

type Tab = "dashboard" | "payables" | "receivables" | "transactions" | "categories" | "banks";

function FinanceiroPage() {
  const { currentStoreId, stores, setStore, loading } = useCurrentStore();
  const [tab, setTab] = React.useState<Tab>("dashboard");

  // Auto-seleciona quando há apenas uma loja disponível
  React.useEffect(() => {
    if (!loading && !currentStoreId && stores.length === 1) {
      setStore(stores[0].id);
    }
  }, [loading, currentStoreId, stores, setStore]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando lojas…</div>;
  }

  if (!currentStoreId) {
    if (stores.length === 0) {
      return (
        <div className="p-6">
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Você ainda não tem lojas vinculadas ao seu usuário.
          </div>
        </div>
      );
    }
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md space-y-3 rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="text-sm font-semibold">Selecione uma loja</h2>
          <p className="text-xs text-muted-foreground">Escolha a loja para visualizar o financeiro.</p>
          <div className="grid gap-2">
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => setStore(s.id)}
                className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.code}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
          <DollarSign className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Financeiro</h1>
          <p className="text-xs text-muted-foreground">Contas, recebimentos e fluxo da loja</p>
        </div>
      </header>


      <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1 text-xs">
        {([
          ["dashboard", "Dashboard"],
          ["payables", "A Pagar"],
          ["receivables", "A Receber"],
          ["transactions", "Movimentações"],
          ["categories", "Categorias"],
          ["banks", "Contas"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <Dashboard storeId={currentStoreId} />}
      {tab === "payables" && <PayablesTab storeId={currentStoreId} />}
      {tab === "receivables" && <ReceivablesTab storeId={currentStoreId} />}
      {tab === "transactions" && <TransactionsTab storeId={currentStoreId} />}
      {tab === "categories" && <CategoriesTab storeId={currentStoreId} />}
      {tab === "banks" && <BanksTab storeId={currentStoreId} />}
    </div>
  );
}

/* -------------------- Dashboard -------------------- */
function Dashboard({ storeId }: { storeId: string }) {
  const q = useQuery({ queryKey: ["fin-summary", storeId], queryFn: () => financialSummary(storeId) });
  const s = q.data;
  const { data: alerts } = useQuery({ 
    queryKey: ["payables-alerts", storeId], 
    queryFn: () => getPayablesAlerts({ data: { storeId } } as any),
    enabled: !!storeId 
  });
  const showAlert = (s && (s.payables_overdue > 0 || s.payables_7d > 0)) || (alerts && alerts.length > 0);
  return (
    <div className="space-y-3">
      {showAlert && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-700 dark:text-orange-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            {s && s.payables_overdue > 0 && (
              <div><strong>{brl(s.payables_overdue)}</strong> em contas vencidas.</div>
            )}
            {s && s.payables_7d > 0 && (
              <div><strong>{brl(s.payables_7d)}</strong> vencem nos próximos 7 dias.</div>
            )}
            {alerts && alerts.length > 0 && (
              <div className="mt-1 border-t border-orange-500/20 pt-1">
                <strong>Alerta crítico:</strong> {alerts.length} conta(s) vencendo hoje ou amanhã.
              </div>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="A pagar (aberto)" value={s ? brl(s.payables_open) : "—"} sub={s ? `${brl(s.payables_7d)} em 7d` : ""} icon={<TrendingDown className="h-4 w-4" />} tone="destructive" />
        <Kpi title="A receber (aberto)" value={s ? brl(s.receivables_open) : "—"} sub={s ? `${brl(s.receivables_7d)} em 7d` : ""} icon={<TrendingUp className="h-4 w-4" />} tone="emerald" />
        <Kpi title="Vencidos (a pagar)" value={s ? brl(s.payables_overdue) : "—"} icon={<AlertTriangle className="h-4 w-4" />} tone="orange" />
        <Kpi title="Resultado do mês" value={s ? brl(s.month_net) : "—"} sub={s ? `${brl(s.month_income)} − ${brl(s.month_expense)}` : ""} icon={<Wallet className="h-4 w-4" />} tone={s && s.month_net >= 0 ? "emerald" : "destructive"} />
      </div>
    </div>
  );
}


function Kpi({ title, value, sub, icon, tone }: { title: string; value: string; sub?: string; icon: React.ReactNode; tone: "emerald" | "destructive" | "orange" }) {
  const toneCls = tone === "emerald" ? "text-emerald-600 bg-emerald-500/10"
    : tone === "destructive" ? "text-destructive bg-destructive/10"
    : "text-orange-600 bg-orange-500/10";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-md ${toneCls}`}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* -------------------- Payables -------------------- */
import { getPayablesAlerts, calculateOverdueCharges, syncGatewayTransactions, refreshOverdueStatus } from "@/lib/pdv-finance-ops.functions";

function PayablesTab({ storeId }: { storeId: string }) {
  const [status, setStatus] = React.useState<FinStatus | "all">("open");
  const [creating, setCreating] = React.useState(false);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payables", storeId, status], queryFn: () => listPayables(storeId, { status }) });
  const cats = useQuery({ queryKey: ["fin-cats", storeId], queryFn: () => listCategories(storeId) });
  const banks = useQuery({ queryKey: ["banks", storeId], queryFn: () => listBankAccounts(storeId) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payables", storeId] });
    qc.invalidateQueries({ queryKey: ["fin-summary", storeId] });
    qc.invalidateQueries({ queryKey: ["fin-tx", storeId] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusFilter value={status} onChange={setStatus} />
          <button
            onClick={async () => {
              const res = await refreshOverdueStatus({ data: { storeId } } as any);
              alert(`Vencimentos atualizados: ${res.accounts_payable} a pagar / ${res.accounts_receivable} a receber.`);
              refresh();
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-[11px] font-medium hover:bg-accent"
          >
            Atualizar vencimentos
          </button>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nova conta a pagar
        </button>
      </div>

      <AccountTable
        rows={q.data ?? []}
        cats={cats.data ?? []}
        loading={q.isLoading}
        onPay={async (r) => { await payPayable(r.id, {}); refresh(); }}
        onDelete={async (r) => { if (confirm("Excluir esta conta?")) { await deletePayable(r.id); refresh(); } }}
        variant="payable"
      />

      {creating && (
        <AccountDrawer
          kind="payable"
          categories={(cats.data ?? []).filter((c) => c.kind === "expense")}
          banks={banks.data ?? []}
          onClose={() => setCreating(false)}
          onSave={async (input) => { await createPayable(storeId, input); setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------- Receivables -------------------- */
function ReceivablesTab({ storeId }: { storeId: string }) {
  const [status, setStatus] = React.useState<FinStatus | "all">("open");
  const [creating, setCreating] = React.useState(false);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["receivables", storeId, status], queryFn: () => listReceivables(storeId, { status }) });
  const cats = useQuery({ queryKey: ["fin-cats", storeId], queryFn: () => listCategories(storeId) });
  const banks = useQuery({ queryKey: ["banks", storeId], queryFn: () => listBankAccounts(storeId) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["receivables", storeId] });
    qc.invalidateQueries({ queryKey: ["fin-summary", storeId] });
    qc.invalidateQueries({ queryKey: ["fin-tx", storeId] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusFilter value={status} onChange={setStatus} />
          <button 
            onClick={async () => {
              const res = await syncGatewayTransactions({ data: { storeId, gateway: "mercado_pago" } } as any);
              alert(`Conciliação concluída: ${res.matched} transações baixadas automaticamente.`);
              refresh();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-[11px] font-medium hover:bg-accent"
          >
            Conciliar MP/PIX
          </button>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nova conta a receber
        </button>
      </div>

      <AccountTable
        rows={q.data ?? []}
        cats={cats.data ?? []}
        loading={q.isLoading}
        onPay={async (r) => { await payReceivable(r.id, {}); refresh(); }}
        onDelete={async (r) => { if (confirm("Excluir?")) { await deleteReceivable(r.id); refresh(); } }}
        variant="receivable"
      />

      {creating && (
        <AccountDrawer
          kind="receivable"
          categories={(cats.data ?? []).filter((c) => c.kind === "income")}
          banks={banks.data ?? []}
          onClose={() => setCreating(false)}
          onSave={async (input) => { await createReceivable(storeId, input); setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------- Transactions -------------------- */
function TransactionsTab({ storeId }: { storeId: string }) {
  const q = useQuery({ queryKey: ["fin-tx", storeId], queryFn: () => listTransactions(storeId, { limit: 200 }) });
  return (
    <div className="rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Origem</th>
            <th className="px-3 py-2">Descrição</th>
            <th className="px-3 py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {q.isLoading && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
          {!q.isLoading && (q.data?.length ?? 0) === 0 && (
            <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sem movimentações.</td></tr>
          )}
          {q.data?.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 whitespace-nowrap">{new Date(t.paid_at).toLocaleString("pt-BR")}</td>
              <td className="px-3 py-2"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{t.source}</span></td>
              <td className="px-3 py-2">{t.description ?? "—"}</td>
              <td className={`px-3 py-2 text-right font-medium ${t.kind === "income" ? "text-emerald-600" : "text-destructive"}`}>
                {t.kind === "income" ? "+" : "−"} {brl(Number(t.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------- Categories -------------------- */
function CategoriesTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fin-cats", storeId], queryFn: () => listCategories(storeId) });
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"income" | "expense">("expense");
  const refresh = () => qc.invalidateQueries({ queryKey: ["fin-cats", storeId] });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Nova categoria</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await upsertCategory({ store_id: storeId, name: name.trim(), kind });
            setName(""); refresh();
          }}
          className="flex gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
          <select value={kind} onChange={(e) => setKind(e.target.value as "income" | "expense")} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <button className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">Add</button>
        </form>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold">Categorias ({q.data?.length ?? 0})</div>
        <ul className="divide-y divide-border text-xs">
          {q.data?.map((c: FinCategory) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color ?? "#94a3b8" }} />
                <span>{c.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.kind === "income" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                  {c.kind === "income" ? "receita" : "despesa"}
                </span>
              </div>
              <button
                onClick={async () => { if (confirm("Excluir categoria?")) { await deleteCategory(c.id); refresh(); } }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------- Bank accounts -------------------- */
function BanksTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["banks", storeId], queryFn: () => listBankAccounts(storeId) });
  const [name, setName] = React.useState("");
  const [isCash, setIsCash] = React.useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["banks", storeId] });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Nova conta</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await upsertBankAccount({ store_id: storeId, name: name.trim(), is_cash: isCash });
            setName(""); refresh();
          }}
          className="flex gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Itaú CC / Caixa loja" className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
          <label className="inline-flex items-center gap-1 text-[11px]">
            <input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} /> caixa físico
          </label>
          <button className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">Add</button>
        </form>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold">Contas ({q.data?.length ?? 0})</div>
        <ul className="divide-y divide-border text-xs">
          {q.data?.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-3 py-2">
              <span>{b.name}{b.is_cash && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">caixa</span>}</span>
              <span className="text-muted-foreground">saldo inicial {brl(Number(b.opening_balance ?? 0))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------- Shared components -------------------- */

function StatusFilter({ value, onChange }: { value: FinStatus | "all"; onChange: (v: FinStatus | "all") => void }) {
  const opts: [FinStatus | "all", string][] = [
    ["all", "Todas"],
    ["open", "Em aberto"],
    ["paid", "Pagas"],
    ["overdue", "Vencidas"],
    ["canceled", "Canceladas"],
  ];
  return (
    <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1 text-[11px]">
      {opts.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`rounded px-2 py-1 ${value === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

function AccountTable({
  rows, cats, loading, onPay, onDelete, variant,
}: {
  rows: (Payable | Receivable)[];
  cats: FinCategory[];
  loading: boolean;
  onPay: (r: Payable | Receivable) => Promise<void>;
  onDelete: (r: Payable | Receivable) => Promise<void>;
  variant: "payable" | "receivable";
}) {
  const today = new Date().toISOString().slice(0, 10);
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Vencimento</th>
            <th className="px-3 py-2">{variant === "payable" ? "Fornecedor" : "Cliente"}</th>
            <th className="px-3 py-2">Descrição</th>
            <th className="px-3 py-2">Categoria</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Carregando…</td></tr>}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sem lançamentos.</td></tr>
          )}
          {rows.map((r) => {
            const overdue = r.status === "open" && r.due_date < today;
            const isProvision = r.notes?.includes("[PROVISÃO]");
            return (
              <tr key={r.id} className={`${overdue ? "bg-destructive/5" : ""} ${isProvision ? "bg-muted/30 opacity-80" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">{r.due_date}</td>
                <td className="px-3 py-2">{variant === "payable" ? (r as Payable).supplier ?? "—" : (r as Receivable).customer_name ?? "—"}</td>
                <td className="px-3 py-2">{r.description}</td>
                <td className="px-3 py-2 text-muted-foreground">{catName(r.category_id)}</td>
                <td className="px-3 py-2 text-right font-medium">{brl(Number(r.amount))}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                    r.status === "paid" ? "bg-emerald-500/10 text-emerald-600"
                    : overdue ? "bg-destructive/10 text-destructive"
                    : r.status === "canceled" ? "bg-muted text-muted-foreground"
                    : "bg-sky-500/10 text-sky-600"
                  }`}>
                    {r.status === "paid" ? "pago" : isProvision ? "provisão" : overdue ? "vencido" : r.status === "canceled" ? "cancelado" : "aberto"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {overdue && variant === "receivable" && (
                      <button 
                        onClick={async () => {
                          const charges = await calculateOverdueCharges({ data: { receivableId: r.id } } as any);
                          alert(`Juros: ${brl(charges.interest)} | Multa: ${brl(charges.penalty)} | Total: ${brl(charges.total)}`);
                        }}
                        title="Calcular Juros/Multa" 
                        className="rounded p-1 text-orange-600 hover:bg-orange-500/10"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {r.status !== "paid" && (
                      <button onClick={() => onPay(r)} title="Dar baixa" className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => onDelete(r)} title="Excluir" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AccountDrawer({
  kind, categories, banks, onClose, onSave,
}: {
  kind: "payable" | "receivable";
  categories: FinCategory[];
  banks: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: {
    description: string; due_date: string; amount: number;
    category_id: string | null; bank_account_id: string | null;
    planned_method: string | null; supplier?: string | null; customer_name?: string | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [desc, setDesc] = React.useState("");
  const [party, setParty] = React.useState("");
  const [due, setDue] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [bankId, setBankId] = React.useState<string>("");
  const [method, setMethod] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isProvision, setIsProvision] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const a = Number(amount.replace(",", "."));
    if (!Number.isFinite(a) || a <= 0) { setErr("Valor inválido."); return; }
    setBusy(true);
    try {
      await onSave({
        description: desc.trim(),
        due_date: due,
        amount: a,
        category_id: categoryId || null,
        bank_account_id: bankId || null,
        planned_method: method || null,
        notes: (notes || "") + (isProvision ? " [PROVISÃO]" : ""),
        ...(kind === "payable" ? { supplier: party || null } : { customer_name: party || null }),
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">{kind === "payable" ? "Nova conta a pagar" : "Nova conta a receber"}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="col-span-2 text-xs">
            <span className="text-muted-foreground">Descrição *</span>
            <input required value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">{kind === "payable" ? "Fornecedor" : "Cliente"}</span>
            <input value={party} onChange={(e) => setParty(e.target.value)} maxLength={200} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Vencimento *</span>
            <input required type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Valor *</span>
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Categoria</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Conta / caixa</span>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5">
              <option value="">—</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Forma prevista</span>
            <input value={method} onChange={(e) => setMethod(e.target.value)} maxLength={40} placeholder="pix, boleto, dinheiro…" className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </label>
          {kind === "payable" && (
            <label className="col-span-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={isProvision} onChange={(e) => setIsProvision(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              <span className="text-muted-foreground">Esta é uma provisão (lançamento planejado)</span>
            </label>
          )}
          <label className="col-span-2 text-xs">
            <span className="text-muted-foreground">Observações</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" />
          </label>
        </div>
        {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs">Cancelar</button>
          <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
