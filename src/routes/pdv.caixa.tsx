import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { usePdv, selectTotals, brl } from "@/lib/pdv-store";

export const Route = createFileRoute("/pdv/caixa")({
  component: KioskCaixa,
});

/**
 * Modo Caixa (kiosk) — fullscreen sem sidebar/header.
 * Atalhos:  F2 = foco busca · Enter = adiciona · F5 = pagamento · F10 = limpar · Esc = sair
 */
function KioskCaixa() {
  const { state, dispatch } = usePdv();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [suggIndex, setSuggIndex] = React.useState(0);
  const [isFull, setIsFull] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const totals = selectTotals(state);
  const sessionActive = !!state.session && !state.session.closedAt;

  React.useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if (e.key === "F5") { e.preventDefault(); if (state.cart.lines.length && sessionActive) navigate({ to: "/pdv/pagamento" }); }
      else if (e.key === "F10") { e.preventDefault(); dispatch({ type: "RESET_CART" }); }
      else if (e.key === "Escape" && !query) { navigate({ to: "/pdv/venda" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.cart.lines.length, sessionActive, query, dispatch, navigate]);

  React.useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (state.session && state.session.closedAt) return <Navigate to="/pdv/fechamento" replace />;

  const q = query.trim().toLowerCase();
  const suggestions = q
    ? state.catalog
        .filter((p) => {
          const bag = `${p.sku} ${p.ean ?? ""} ${p.name}`.toLowerCase();
          return q.split(/\s+/).every((tok) => bag.includes(tok));
        })
        .slice(0, 6)
    : [];

  const addBy = (skuOrEan: string) => {
    if (!skuOrEan.trim()) return;
    dispatch({ type: "ADD_ITEM", skuOrEan, qty: 1 });
    setQuery(""); setSuggIndex(0);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const pick = suggestions[suggIndex] ?? suggestions[0];
    addBy(pick ? pick.sku : query);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">Modo Caixa</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              sessionActive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            ● {sessionActive ? `Sessão ${state.session!.id}` : "Caixa fechado"}
          </span>
          <span className="text-xs text-muted-foreground">Op. {state.session?.operator ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={toggleFullscreen} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">
            {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFull ? "Sair fullscreen" : "Fullscreen"}
          </button>
          <Link to="/pdv/venda" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">
            <X className="h-3.5 w-3.5" /> Sair do modo caixa
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_420px]">
        {/* Esquerda: busca + itens */}
        <div className="flex min-h-0 flex-col p-6">
          <form onSubmit={submit} className="relative">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSuggIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setSuggIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSuggIndex((i) => Math.max(i - 1, 0)); }
              }}
              disabled={!sessionActive}
              placeholder="Bipe ou digite SKU / EAN / nome — F2 foca, Enter adiciona"
              className="w-full rounded-xl border-2 border-border bg-card px-5 py-5 text-xl outline-none focus:border-primary disabled:opacity-50"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-border bg-popover shadow-2xl">
                {suggestions.map((p, idx) => (
                  <button
                    key={p.sku}
                    type="button"
                    onMouseEnter={() => setSuggIndex(idx)}
                    onClick={() => addBy(p.sku)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${
                      idx === suggIndex ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">SKU {p.sku}{p.ean ? ` · EAN ${p.ean}` : ""}</div>
                    </div>
                    <div className="tabular-nums font-semibold">{brl(p.unit)}</div>
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Cesta */}
          <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-[1fr_80px_120px_140px_40px] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Produto</span>
              <span className="text-right">Qtd</span>
              <span className="text-right">Unit.</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {state.cart.lines.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Nenhum item — bipe o primeiro produto.
                </div>
              ) : (
                state.cart.lines.map((l) => (
                  <div
                    key={l.lineId}
                    className="grid grid-cols-[1fr_80px_120px_140px_40px] items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-0"
                  >
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">SKU {l.sku} · Lote {l.lotId.slice(0, 6)}</div>
                    </div>
                    <div className="text-right tabular-nums">{l.qty}</div>
                    <div className="text-right tabular-nums">{brl(l.unit)}</div>
                    <div className="text-right font-semibold tabular-nums">{brl(l.qty * l.unit)}</div>
                    <button
                      onClick={() => dispatch({ type: "REMOVE_LINE", lineId: l.lineId })}
                      className="text-sm text-muted-foreground hover:text-destructive"
                      aria-label="Remover"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Direita: totalizador enorme */}
        <aside className="flex flex-col justify-between border-l border-border bg-card p-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">A pagar</div>
            <div className="mt-1 text-6xl font-bold tabular-nums tracking-tight">{brl(totals.total)}</div>
            <div className="mt-4 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{brl(totals.subtotal)}</span></div>
              {totals.cashback > 0 && (
                <div className="flex justify-between text-primary"><span>Cashback</span><span className="tabular-nums">- {brl(totals.cashback)}</span></div>
              )}
              <div className="flex justify-between"><span>Itens</span><span className="tabular-nums">{state.cart.lines.length}</span></div>
              <div className="flex justify-between"><span>Unidades</span><span className="tabular-nums">{state.cart.lines.reduce((s, l) => s + l.qty, 0)}</span></div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate({ to: "/pdv/pagamento" })}
              disabled={!state.cart.lines.length || !sessionActive}
              className="w-full rounded-xl bg-primary py-5 text-lg font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
            >
              F5 · Pagamento →
            </button>
            <button
              onClick={() => dispatch({ type: "RESET_CART" })}
              className="w-full rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-muted"
            >
              F10 · Limpar cesta
            </button>
            <div className="rounded-lg border border-border bg-background p-3 text-[11px] text-muted-foreground">
              <div className="mb-1 font-semibold text-foreground">Atalhos</div>
              <div className="grid grid-cols-2 gap-y-1">
                <span><kbd className="rounded bg-muted px-1">F2</kbd> Focar busca</span>
                <span><kbd className="rounded bg-muted px-1">Enter</kbd> Adicionar</span>
                <span><kbd className="rounded bg-muted px-1">F5</kbd> Pagamento</span>
                <span><kbd className="rounded bg-muted px-1">F10</kbd> Limpar</span>
                <span><kbd className="rounded bg-muted px-1">Esc</kbd> Sair</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
