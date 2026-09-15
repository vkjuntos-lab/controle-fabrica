import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  issueGiftCard,
  listGiftCards,
  cancelGiftCard,
  type GiftCard,
} from "@/lib/pdv-gift-cards.functions";
import { usePdvAuth } from "@/lib/pdv-auth";
import { brl } from "@/lib/pdv-store";

export const Route = createFileRoute("/pdv/vales")({
  component: PdvVales,
});

const statusColor: Record<GiftCard["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  redeemed: "bg-slate-500/10 text-slate-500",
  expired: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const statusLabel: Record<GiftCard["status"], string> = {
  active: "Ativo",
  redeemed: "Resgatado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

function PdvVales() {
  const { user } = usePdvAuth();
  const qc = useQueryClient();
  const list = useServerFn(listGiftCards);
  const issue = useServerFn(issueGiftCard);
  const cancel = useServerFn(cancelGiftCard);

  const [amount, setAmount] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<string>("");
  const [issued, setIssued] = React.useState<GiftCard | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["gift-cards", user?.storeId, filterStatus],
    queryFn: () => list({ data: { storeId: user?.storeId, status: filterStatus || null } }),
    enabled: !!user,
  });

  const issueMut = useMutation({
    mutationFn: async () => {
      if (!user?.storeId) throw new Error("Sem loja vinculada");
      const val = Number(amount);
      if (!val || val <= 0) throw new Error("Valor inválido");
      const gc = await issue({
        data: {
          storeId: user.storeId,
          amount: val,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          notes: notes.trim() || null,
        },
      });
      return gc;
    },
    onSuccess: (gc) => {
      setIssued(gc);
      setAmount(""); setExpiresAt(""); setNotes(""); setErr(null);
      qc.invalidateQueries({ queryKey: ["gift-cards"] });
    },
    onError: (e: any) => setErr(e?.message ?? "Falha ao emitir vale"),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => cancel({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gift-cards"] }),
  });

  const active = cards.filter((c) => c.status === "active");
  const totalActive = active.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Vales-presente</h2>
          <p className="text-xs text-muted-foreground">
            Emita, consulte e cancele vales que o cliente pode usar no PDV.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {active.length} ativos · {brl(totalActive)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Emitir */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Emitir novo vale
          </div>
          <label className="block text-xs">
            <div className="mb-1 text-muted-foreground">Valor (R$)</div>
            <input
              type="number" step="0.01" min={0} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <div className="mb-1 text-muted-foreground">Validade (opcional)</div>
            <input
              type="date" value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <div className="mb-1 text-muted-foreground">Notas (opcional)</div>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Cliente, campanha, motivo…"
            />
          </label>
          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {err}
            </div>
          )}
          <button
            onClick={() => issueMut.mutate()}
            disabled={issueMut.isPending || !amount}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {issueMut.isPending ? "Emitindo…" : "Emitir vale-presente"}
          </button>

          {issued && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
              <div className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Vale gerado
              </div>
              <div className="mt-1 font-mono text-lg font-bold tracking-widest">{issued.code}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {brl(Number(issued.initial_amount))}
                {issued.expires_at && ` · válido até ${new Date(issued.expires_at).toLocaleDateString("pt-BR")}`}
              </div>
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined") {
                    void navigator.clipboard.writeText(issued.code);
                  }
                }}
                className="mt-2 rounded-md border border-border px-2 py-1 text-[11px]"
              >
                Copiar código
              </button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Vales emitidos
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="">Todos</option>
              <option value="active">Ativos</option>
              <option value="redeemed">Resgatados</option>
              <option value="expired">Expirados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>
          <div className="divide-y divide-border">
            {isLoading && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando…</div>
            )}
            {!isLoading && cards.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum vale encontrado.
              </div>
            )}
            {cards.map((gc) => (
              <div key={gc.id} className="grid grid-cols-[1fr_120px_120px_100px_80px] items-center gap-3 px-4 py-3">
                <div>
                  <div className="font-mono text-sm font-semibold tracking-widest">{gc.code}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Emitido {new Date(gc.created_at).toLocaleDateString("pt-BR")}
                    {gc.expires_at && ` · exp ${new Date(gc.expires_at).toLocaleDateString("pt-BR")}`}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  Inicial<br /><span className="text-sm text-foreground">{brl(Number(gc.initial_amount))}</span>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  Saldo<br /><span className="text-sm font-semibold text-foreground">{brl(Number(gc.balance))}</span>
                </div>
                <div className="text-center">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${statusColor[gc.status]}`}>
                    {statusLabel[gc.status]}
                  </span>
                </div>
                <div className="text-right">
                  {gc.status === "active" && (
                    <button
                      onClick={() => {
                        if (confirm(`Cancelar vale ${gc.code}?`)) cancelMut.mutate(gc.id);
                      }}
                      className="text-[11px] text-rose-600 hover:underline"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
