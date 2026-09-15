import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import {
  listPixReminders,
  regeneratePixCharge,
  cancelPixCharge,
} from "@/lib/pdv-pix.functions";
import { brl } from "@/lib/pdv-store";

export const Route = createFileRoute("/pdv/pix")({
  component: PixPendentes,
});

function normalizePhoneForWa(raw: string): string | null {
  const d = (raw ?? "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

function PixPendentes() {
  const fetchList = useServerFn(listPixReminders);
  const regenFn = useServerFn(regeneratePixCharge);
  const cancelFn = useServerFn(cancelPixCharge);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pix-reminders"],
    queryFn: () => fetchList(),
    refetchInterval: 15_000,
  });

  const regen = useMutation({
    mutationFn: (id: string) => regenFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pix-reminders"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pix-reminders"] }),
  });

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">PIX pendentes</h2>
          <p className="text-xs text-muted-foreground">
            Fila de cobranças expiradas aguardando lembrete via WhatsApp
            (wa.me — custo zero). Após 60 min sem pagamento, o cron cancela
            automaticamente.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-border px-3 py-1.5 text-xs"
        >
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum PIX pendente. 🎉
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[1fr_120px_140px_140px_320px] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Venda / Telefone</span>
            <span className="text-right">Valor</span>
            <span>Status</span>
            <span>Expira / Expirou</span>
            <span className="text-right">Ações</span>
          </div>
          {rows.map((r) => {
            const wa = normalizePhoneForWa(r.customer_phone);
            const msg = `Olá! Notamos que o pagamento PIX da venda *${r.sale_code}* (${brl(Number(r.amount))}) não foi concluído. Deseja finalizar? Se sim, respondemos com um novo QR válido por 30 min.`;
            const waHref = wa
              ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`
              : null;
            const isReminded = r.status === "reminded";
            return (
              <div
                key={r.id}
                className={`grid grid-cols-[1fr_120px_140px_140px_320px] items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-0 ${
                  isReminded ? "bg-amber-500/5" : ""
                }`}
              >
                <div>
                  <div className="font-medium">{r.sale_code}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.customer_phone || "sem telefone"}
                  </div>
                </div>
                <div className="text-right tabular-nums">{brl(Number(r.amount))}</div>
                <div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isReminded
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {isReminded ? "Aguarda lembrete" : "Pendente"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {new Date(r.expires_at).toLocaleString("pt-BR")}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {waHref ? (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                    >
                      Abrir WhatsApp
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">sem WhatsApp</span>
                  )}
                  <button
                    onClick={() => regen.mutate(r.id)}
                    disabled={regen.isPending}
                    className="rounded-md border border-border bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary disabled:opacity-50"
                  >
                    Gerar novo QR
                  </button>
                  <button
                    onClick={() => cancel.mutate(r.id)}
                    disabled={cancel.isPending}
                    className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <b>Fluxo custo zero:</b> o cron marca a cobrança como <i>reminded</i>{" "}
        aos 30 min. O operador abre o WhatsApp do cliente e envia a mensagem
        pronta. Se o cliente responder que quer pagar, clique em{" "}
        <b>“Gerar novo QR”</b> para emitir uma cobrança nova com +30 min de
        validade. Se ninguém agir, o cron cancela após 60 min.
      </div>
    </div>
  );
}
