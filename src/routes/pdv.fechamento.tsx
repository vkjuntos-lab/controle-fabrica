import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { AlertTriangle, Download, FileText, RefreshCw } from "lucide-react";
import {
  usePdv,
  selectSessionSummary,
  brl,
  paymentLabels,
  type PaymentMethod,
  type Sale,
  type Payment,
  type SaleLine,
} from "@/lib/pdv-store";
import { ReceiptPreview } from "@/components/receipt-preview";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/pdv/fechamento")({
  component: PdvFechamento,
});

const methodOrder: PaymentMethod[] = ["cash", "pix", "debit", "credit", "cashback"];

type RemoteSaleRow = {
  id: string;
  code: string | null;
  total: number | string;
  cashback_used: number | string;
  lines: unknown;
  payments: unknown;
  created_at: string;
};

function mapRemoteToSale(r: RemoteSaleRow): Sale {
  return {
    id: r.code ?? r.id,
    createdAt: r.created_at,
    total: Number(r.total),
    cashbackUsed: Number(r.cashback_used),
    lines: (Array.isArray(r.lines) ? r.lines : []) as SaleLine[],
    payments: (Array.isArray(r.payments) ? r.payments : []) as Payment[],
    customer: undefined,
  } as unknown as Sale;
}

function PdvFechamento() {
  const { state, closeSessionRemote, openSessionRemote } = usePdv();
  const { currentStore, currentStoreId } = useCurrentStore();
  const navigate = useNavigate();
  const summary = selectSessionSummary(state);
  const [counted, setCounted] = React.useState<Record<PaymentMethod, string>>({
    cash: "", pix: "", debit: "", credit: "", cashback: "",
    gift_card: "", store_credit: "", credit_sale: "", boleto: "", payment_link: "",
  });
  const [previewSale, setPreviewSale] = React.useState<Sale | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [remoteSales, setRemoteSales] = React.useState<Sale[] | null>(null);
  const [loadingRemote, setLoadingRemote] = React.useState(false);
  const [lastSyncAt, setLastSyncAt] = React.useState<Date | null>(null);

  const session = state.session;

  const syncRemote = React.useCallback(async () => {
    if (!session?.id) return;
    setLoadingRemote(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("id, code, operator, total, cashback_used, lines, payments, customer_id, created_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[fechamento] sales", error);
        setRemoteSales([]);
      } else {
        setRemoteSales((data ?? []).map((r) => mapRemoteToSale(r as RemoteSaleRow)));
      }
      setLastSyncAt(new Date());
    } finally {
      setLoadingRemote(false);
    }
  }, [session?.id]);

  // Sincroniza sempre ao entrar na tela e ao trocar de sessão — assim vemos a visão real do banco.
  React.useEffect(() => {
    if (session?.id) void syncRemote();
  }, [session?.id, syncRemote]);

  const closed = session?.closedAt;

  // Fonte da verdade = banco quando disponível.
  const effectiveSales: Sale[] = remoteSales && remoteSales.length > 0 ? remoteSales : state.sales;
  const effectiveTotals = React.useMemo<Record<PaymentMethod, number>>(() => {
    if (!remoteSales || remoteSales.length === 0) return summary.totals;
    const acc: Record<PaymentMethod, number> = {
      cash: 0, pix: 0, debit: 0, credit: 0, cashback: 0,
      gift_card: 0, store_credit: 0, credit_sale: 0, boleto: 0, payment_link: 0,
    };
    for (const s of remoteSales) {
      for (const p of s.payments ?? []) {
        if (p.status && p.status !== "paid") continue;
        acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount || 0);
      }
    }
    return acc;
  }, [remoteSales, summary.totals]);
  const effectiveCount = remoteSales && remoteSales.length > 0 ? remoteSales.length : summary.count;
  const effectiveRevenue = remoteSales && remoteSales.length > 0
    ? remoteSales.reduce((s, x) => s + Number(x.total || 0), 0)
    : summary.revenue;
  const effectiveTicket = effectiveCount ? effectiveRevenue / effectiveCount : 0;

  const totalSys = methodOrder.reduce((s, m) => s + (effectiveTotals[m] ?? 0), 0);
  const totalCnt = methodOrder.reduce((s, m) => s + (Number(counted[m]) || (effectiveTotals[m] ?? 0)), 0);
  const diff = totalCnt - totalSys;

  // -------- Reconciliação memória vs banco --------
  const reconciliation = React.useMemo(() => {
    if (!remoteSales) return null;
    const localIds = new Set(state.sales.map((s) => s.id));
    const remoteIds = new Set(remoteSales.map((s) => s.id));
    const onlyLocal = state.sales.filter((s) => !remoteIds.has(s.id));
    const onlyRemote = remoteSales.filter((s) => !localIds.has(s.id));
    const localRevenue = state.sales.reduce((n, s) => n + Number(s.total || 0), 0);
    const remoteRevenue = remoteSales.reduce((n, s) => n + Number(s.total || 0), 0);
    const revenueDelta = remoteRevenue - localRevenue;
    const hasDivergence =
      onlyLocal.length > 0 || onlyRemote.length > 0 || Math.abs(revenueDelta) > 0.01;
    return { onlyLocal, onlyRemote, localRevenue, remoteRevenue, revenueDelta, hasDivergence };
  }, [remoteSales, state.sales]);

  // -------- Alerta: operador/caixa selecionado sem dados em memória --------
  const showEmptyMemoryAlert =
    !!session &&
    !closed &&
    state.sales.length === 0 &&
    !loadingRemote &&
    remoteSales !== null; // já sincronizamos

  // -------- Exportação --------
  const exportRows = React.useCallback(() => {
    return effectiveSales.map((s) => ({
      loja: currentStore?.name ?? "",
      loja_id: currentStoreId ?? "",
      session_id: session?.id ?? "",
      operador: session?.operator ?? "",
      pedido: s.id,
      data: new Date(s.createdAt).toLocaleString("pt-BR"),
      itens: s.lines.reduce((n, l) => n + l.qty, 0),
      total: Number(s.total || 0).toFixed(2),
      cashback: Number(s.cashbackUsed || 0).toFixed(2),
      pagamentos: (s.payments ?? [])
        .filter((p) => p.status === "paid")
        .map((p) => `${paymentLabels[p.method]} ${brl(p.amount)}`)
        .join(" + "),
    }));
  }, [effectiveSales, currentStore?.name, currentStoreId, session?.id, session?.operator]);

  const exportCsv = () => {
    if (!session) return;
    const rows = exportRows();
    const csv = toCsv(rows);
    const fname = `fechamento_${(currentStore?.code ?? "loja").toLowerCase()}_${session.id}.csv`;
    downloadCsv(fname, csv);
  };

  const exportPdf = async () => {
    if (!session) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const marginX = 40;
    let y = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Fechamento de Caixa", marginX, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const header = [
      `Loja: ${currentStore?.name ?? "-"} (${currentStore?.code ?? "-"})`,
      `Sessão: ${session.id}`,
      `Operador: ${session.operator}`,
      `Aberta: ${new Date(session.openedAt).toLocaleString("pt-BR")}`,
      closed ? `Fechada: ${new Date(closed).toLocaleString("pt-BR")}` : `Emitido: ${new Date().toLocaleString("pt-BR")}`,
    ];
    header.forEach((line) => { doc.text(line, marginX, y); y += 14; });
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Totais por forma de pagamento", marginX, y); y += 16;
    doc.setFont("helvetica", "normal");
    methodOrder.forEach((m) => {
      doc.text(paymentLabels[m], marginX, y);
      doc.text(brl(effectiveTotals[m] ?? 0), 300, y, { align: "right" });
      y += 14;
    });
    doc.setFont("helvetica", "bold");
    doc.text("Total sistema", marginX, y);
    doc.text(brl(totalSys), 300, y, { align: "right" });
    y += 20;

    doc.text("Resumo", marginX, y); y += 16;
    doc.setFont("helvetica", "normal");
    doc.text(`Vendas: ${effectiveCount}`, marginX, y); y += 14;
    doc.text(`Faturamento: ${brl(effectiveRevenue)}`, marginX, y); y += 14;
    doc.text(`Ticket médio: ${brl(effectiveTicket)}`, marginX, y); y += 14;
    doc.text(`Diferença conferência: ${brl(diff)}`, marginX, y); y += 20;

    doc.setFont("helvetica", "bold");
    doc.text("Vendas da sessão", marginX, y); y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    effectiveSales.forEach((s) => {
      if (y > 780) { doc.addPage(); y = 48; }
      const dt = new Date(s.createdAt).toLocaleString("pt-BR");
      doc.text(`${s.id}  ${dt}`, marginX, y);
      doc.text(brl(s.total), 555, y, { align: "right" });
      y += 12;
    });

    doc.save(`fechamento_${(currentStore?.code ?? "loja").toLowerCase()}_${session.id}.pdf`);
  };

  const handleClose = async () => {
    const parsed: Record<PaymentMethod, number> = {
      cash: Number(counted.cash) || effectiveTotals.cash,
      pix: Number(counted.pix) || effectiveTotals.pix,
      debit: Number(counted.debit) || effectiveTotals.debit,
      credit: Number(counted.credit) || effectiveTotals.credit,
      cashback: Number(counted.cashback) || effectiveTotals.cashback,
      gift_card: effectiveTotals.gift_card,
      store_credit: effectiveTotals.store_credit,
      credit_sale: effectiveTotals.credit_sale,
      boleto: effectiveTotals.boleto,
      payment_link: effectiveTotals.payment_link,
    };
    setBusy(true);
    try {
      await closeSessionRemote(parsed);
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma sessão aberta. Abra o caixa no topo para começar.
        </p>
        <Link
          to="/pdv/venda"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          Ir para venda
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Fechamento de Caixa</h2>
          <p className="text-xs text-muted-foreground">
            Sessão {session.id} · Aberta em{" "}
            {new Date(session.openedAt).toLocaleString("pt-BR")} · Op. {session.operator}
            {closed && ` · Fechada em ${new Date(closed).toLocaleString("pt-BR")}`}
          </p>
          {lastSyncAt && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Última sincronização: {lastSyncAt.toLocaleTimeString("pt-BR")}
              {remoteSales && ` · ${remoteSales.length} vendas no banco`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void syncRemote()}
            disabled={loadingRemote}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRemote ? "animate-spin" : ""}`} />
            {loadingRemote ? "Sincronizando…" : "Sincronizar com o banco"}
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={() => void exportPdf()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:border-primary/50"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
          <Link
            to="/pdv/venda"
            className="rounded-md border border-border bg-background px-3 py-2 text-xs"
          >
            + Nova venda
          </Link>
          {!closed ? (
            <button
              onClick={handleClose}
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Fechando…" : "Confirmar fechamento"}
            </button>
          ) : (
            <button
              onClick={async () => {
                try {
                  await openSessionRemote({ opening: 200 });
                  navigate({ to: "/pdv/venda" });
                } catch { /* ignore */ }
              }}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
            >
              Abrir nova sessão
            </button>
          )}
        </div>
      </div>

      {/* Alerta: memória local vazia */}
      {showEmptyMemoryAlert && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">
              Sem dados desta sessão na memória local deste navegador.
            </div>
            <div className="mt-1 text-xs opacity-90">
              Você está inspecionando o caixa <b>{session.operator}</b> (sessão {session.id}) de outro dispositivo,
              ou a página foi recarregada. Os valores exibidos vêm do banco de dados
              {remoteSales && remoteSales.length > 0 ? ` (${remoteSales.length} vendas encontradas)` : " (nenhuma venda encontrada)"}.
              Verifique com o operador antes de confirmar o fechamento — não feche com informações incompletas.
            </div>
          </div>
        </div>
      )}

      {/* Alerta: divergência memória vs banco */}
      {reconciliation?.hasDivergence && state.sales.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">Divergência detectada entre a memória do caixa e o banco de dados</div>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                Memória: {state.sales.length} vendas · {brl(reconciliation.localRevenue)}
              </li>
              <li>
                Banco: {remoteSales?.length ?? 0} vendas · {brl(reconciliation.remoteRevenue)}
              </li>
              <li>
                Diferença de faturamento:{" "}
                <b>{brl(reconciliation.revenueDelta)}</b>
              </li>
              {reconciliation.onlyLocal.length > 0 && (
                <li>
                  Somente na memória (não gravadas no banco):{" "}
                  {reconciliation.onlyLocal.map((s) => s.id).join(", ")}
                </li>
              )}
              {reconciliation.onlyRemote.length > 0 && (
                <li>
                  Somente no banco (não estão na memória):{" "}
                  {reconciliation.onlyRemote.map((s) => s.id).join(", ")}
                </li>
              )}
            </ul>
            <button
              onClick={() => void syncRemote()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-[11px] font-medium hover:bg-destructive/10"
            >
              <RefreshCw className="h-3 w-3" /> Sincronizar novamente
            </button>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Vendas" value={String(effectiveCount)} />
        <Kpi label="Faturamento" value={brl(effectiveRevenue)} />
        <Kpi label="Ticket médio" value={brl(effectiveTicket)} tone="accent" />
        <Kpi
          label="Diferença de caixa"
          value={brl(diff)}
          tone={Math.abs(diff) < 0.01 ? "ok" : diff < 0 ? "warn" : "ok"}
        />
      </div>

      {/* Conferência */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[1fr_140px_160px_140px] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Forma de pagamento</span>
            <span className="text-right">Sistema</span>
            <span className="text-right">Conferido</span>
            <span className="text-right">Diferença</span>
          </div>
          {methodOrder.map((m) => {
            const sys = effectiveTotals[m] ?? 0;
            const cnt = Number(counted[m]) || sys;
            const d = cnt - sys;
            return (
              <div
                key={m}
                className="grid grid-cols-[1fr_140px_160px_140px] items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-0"
              >
                <div className="font-medium">{paymentLabels[m]}</div>
                <div className="text-right tabular-nums">{brl(sys)}</div>
                <div className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    value={counted[m]}
                    disabled={!!closed}
                    onChange={(e) =>
                      setCounted((c) => ({ ...c, [m]: e.target.value }))
                    }
                    placeholder={sys.toFixed(2)}
                    className="w-32 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums disabled:opacity-50"
                  />
                </div>
                <div
                  className={`text-right tabular-nums ${
                    Math.abs(d) < 0.01
                      ? "text-muted-foreground"
                      : d < 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {Math.abs(d) < 0.01 ? "—" : brl(d)}
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[1fr_140px_160px_140px] items-center gap-2 border-t border-border bg-muted/30 px-4 py-3 text-sm font-semibold">
            <div>Total</div>
            <div className="text-right tabular-nums">{brl(totalSys)}</div>
            <div className="text-right tabular-nums">{brl(totalCnt)}</div>
            <div
              className={`text-right tabular-nums ${
                Math.abs(diff) < 0.01
                  ? ""
                  : diff < 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {brl(diff)}
            </div>
          </div>
        </div>

        {/* Vendas da sessão */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>
              Histórico de vendas
              {remoteSales && remoteSales.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-[10px] text-primary">
                  · do banco
                </span>
              )}
            </span>
            <span className="normal-case tracking-normal">
              {effectiveSales.length} {effectiveSales.length === 1 ? "venda" : "vendas"}
            </span>
          </div>
          {effectiveSales.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {loadingRemote ? "Carregando vendas da sessão…" : "Nenhuma venda registrada ainda."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {[...effectiveSales].reverse().map((s) => {
                const dt = new Date(s.createdAt);
                const totalItens = s.lines.reduce((n, l) => n + l.qty, 0);
                return (
                  <li key={s.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">Pedido {s.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {dt.toLocaleDateString("pt-BR")} ·{" "}
                          {dt.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {s.customer?.name && ` · ${s.customer.name}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{brl(s.total)}</div>
                        {s.cashbackUsed > 0 && (
                          <div className="text-[11px] text-primary">
                            − {brl(s.cashbackUsed)} cashback
                          </div>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5 border-l border-border/60 pl-3 text-xs text-muted-foreground">
                      {s.lines.map((l) => (
                        <li
                          key={l.lineId}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span className="truncate">
                            {l.qty}× {l.name}{" "}
                            <span className="text-muted-foreground/70">
                              · lote {l.lotId}
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {brl(l.qty * l.unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {totalItens} {totalItens === 1 ? "item" : "itens"} ·{" "}
                        {s.payments
                          .filter((p) => p.status === "paid")
                          .map((p) => `${p.method.toUpperCase()} ${brl(p.amount)}`)
                          .join(" + ") || "—"}
                      </span>
                      <button
                        onClick={() => setPreviewSale(s)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:border-primary/50 hover:text-primary"
                      >
                        👁 Ver comprovante
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {closed && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          ✓ Sessão {session.id} fechada. Diferença total: {brl(diff)}.
        </div>
      )}

      <ReceiptPreview sale={previewSale} onClose={() => setPreviewSale(null)} />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "ok" | "warn";
}) {
  const color =
    tone === "accent"
      ? "text-primary"
      : tone === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
