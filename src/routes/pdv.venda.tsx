import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import * as React from "react";
import { ScanBarcode } from "lucide-react";
import { usePdv, selectTotals, selectSkuAvailability, brl } from "@/lib/pdv-store";
import { CustomerPanel } from "@/components/customer-panel";
import { BarcodeScanner } from "@/components/catalog/barcode-scanner";


export const Route = createFileRoute("/pdv/venda")({
  component: PdvVenda,
});

function PdvVenda() {
  const { state, dispatch } = usePdv();
  const [query, setQuery] = React.useState("");
  const [cashInput, setCashInput] = React.useState("");
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [suggIndex, setSuggIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const totals = selectTotals(state);
  const sessionActive = !!state.session && !state.session.closedAt;

  // Atalho "/" → foca busca
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Guarda: caixa fechado → redireciona para fechamento
  if (state.session && state.session.closedAt) {
    return <Navigate to="/pdv/fechamento" replace />;
  }

  const q = query.trim().toLowerCase();
  const suggestions = q
    ? state.catalog
        .filter((p) => {
          const bag = `${p.sku} ${p.ean ?? ""} ${p.name}`.toLowerCase();
          return q.split(/\s+/).every((tok) => bag.includes(tok));
        })
        .slice(0, 8)
    : [];

  const addBy = (skuOrEan: string) => {
    if (!skuOrEan.trim()) return;
    dispatch({ type: "ADD_ITEM", skuOrEan, qty: 1 });
    setQuery(""); setSuggIndex(0);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const pick = suggestions[suggIndex] ?? suggestions[0];
    addBy(pick ? pick.sku : query);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Venda</h2>
            <p className="text-xs text-muted-foreground">
              Loja Vila Madalena · Caixa 02 · Op. {state.session?.operator ?? "—"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sessionActive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            ● {sessionActive ? `Sessão ${state.session!.id}` : "Caixa fechado"}
          </span>
        </div>

        {!sessionActive && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
            Abra o caixa no topo para iniciar vendas.
          </div>
        )}

        {/* Busca rápida */}
        <form onSubmit={handleAdd} className="relative rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSuggIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSuggIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSuggIndex((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Escape") setQuery("");
                }}
                disabled={!sessionActive}
                placeholder='Buscar por nome, SKU ou EAN (tecla "/" foca aqui) · Enter adiciona'
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
                  {suggestions.map((p, idx) => {
                    const { free } = selectSkuAvailability(state, p.sku);
                    return (
                      <button
                        key={p.sku}
                        type="button"
                        onMouseEnter={() => setSuggIndex(idx)}
                        onClick={() => addBy(p.sku)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs ${
                          idx === suggIndex ? "bg-primary/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground">SKU {p.sku}{p.ean ? ` · EAN ${p.ean}` : ""}</div>
                        </div>
                        <div className="text-right">
                          <div className="tabular-nums">{brl(p.unit)}</div>
                          <div className={`text-[10px] tabular-nums ${free === 0 ? "text-red-500" : free <= 3 ? "text-amber-500" : "text-muted-foreground"}`}>
                            {free} un.
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={!sessionActive}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
              title="Ler código de barras"
            >
              <ScanBarcode className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={!sessionActive}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.catalog.map((p) => {
              const { free, total, nextLot } = selectSkuAvailability(state, p.sku);
              const out = free === 0;
              return (
                <button
                  type="button"
                  key={p.sku}
                  disabled={!sessionActive || out}
                  onClick={() =>
                    dispatch({ type: "ADD_ITEM", skuOrEan: p.sku, qty: 1 })
                  }
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    out
                      ? "cursor-not-allowed border-dashed border-border/70 bg-muted/30 text-muted-foreground opacity-70"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {p.sku}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {out
                        ? "Sem saldo disponível"
                        : `FEFO ${nextLot?.code ?? nextLot?.id?.slice(0, 6)} · val ${nextLot?.validity}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums text-foreground">{brl(p.unit)}</div>
                    <div
                      className={`text-[11px] tabular-nums ${
                        out
                          ? "text-amber-600 dark:text-amber-400"
                          : free <= 3
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {free} un.{free !== total && ` (de ${total})`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </form>


        <CustomerPanel />


        {/* Itens */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[1fr_140px_80px_120px_120px_40px] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Produto</span>
            <span>Lote / Validade</span>
            <span className="text-right">Qtd</span>
            <span className="text-right">Unit.</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {state.cart.lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum item na cesta. Adicione produtos pelo SKU/EAN.
            </div>
          ) : (
            state.cart.lines.map((l) => (
              <div
                key={l.lineId}
                className="grid grid-cols-[1fr_140px_80px_120px_120px_40px] items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-0"
              >
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">SKU {l.sku}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Lote {l.lotId.slice(0, 6)} · Val {l.validity}
                </div>
                <div className="text-right tabular-nums">{l.qty}</div>
                <div className="text-right tabular-nums">{brl(l.unit)}</div>
                <div className="text-right font-medium tabular-nums">{brl(l.qty * l.unit)}</div>
                <button
                  onClick={() => dispatch({ type: "REMOVE_LINE", lineId: l.lineId })}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span>FEFO aplicado automaticamente · Vendedor: {state.session?.operator ?? "—"}</span>
            <span>
              {state.cart.lines.length} itens ·{" "}
              {state.cart.lines.reduce((s, l) => s + l.qty, 0)} unidades
            </span>
          </div>
        </div>
      </div>

      {/* SIDEBAR TOTAL */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Resumo</div>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Subtotal" value={brl(totals.subtotal)} />
            <Row label="Cashback aplicado" value={`- ${brl(totals.cashback)}`} tone="accent" />
            <div className="my-2 border-t border-border" />
            <Row label="Total a pagar" value={brl(totals.total)} big />
          </dl>

          {state.customer && (
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min={0}
                max={state.customer.cashback}
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder={`Usar cashback (máx ${brl(state.customer.cashback)})`}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={() => {
                  dispatch({ type: "APPLY_CASHBACK", amount: Number(cashInput) || 0 });
                  setCashInput("");
                }}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                Aplicar
              </button>
            </div>
          )}

          <Link
            to="/pdv/pagamento"
            className={`mt-5 inline-flex w-full items-center justify-center rounded-md px-4 py-3 text-sm font-medium ${
              state.cart.lines.length && sessionActive
                ? "bg-primary text-primary-foreground"
                : "pointer-events-none bg-muted text-muted-foreground"
            }`}
          >
            Ir para pagamento →
          </Link>
          <button
            onClick={() => dispatch({ type: "RESET_CART" })}
            className="mt-2 w-full rounded-md border border-border px-4 py-2 text-xs text-muted-foreground"
          >
            Limpar cesta
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">Atalhos</div>
          <ul className="mt-2 space-y-1">
            <li><kbd className="rounded bg-muted px-1">/</kbd> · Focar busca</li>
            <li><kbd className="rounded bg-muted px-1">↑ ↓</kbd> · Navegar sugestões</li>
            <li><kbd className="rounded bg-muted px-1">Enter</kbd> · Adicionar</li>
            <li>F4 · Identificar cliente</li>
            <li>F8 · Aplicar cashback</li>
          </ul>
        </div>
      </aside>
      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onDetect={(code) => { addBy(code); setScannerOpen(false); }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  big,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  tone?: "accent";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={big ? "text-sm font-semibold" : ""}>{label}</dt>
      <dd
        className={`tabular-nums ${big ? "text-xl font-semibold" : ""} ${
          tone === "accent" ? "text-primary" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
