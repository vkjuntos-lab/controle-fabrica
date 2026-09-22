import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, ErrorState } from "@/components/states";
import { queryPartners } from "@/lib/partners/partners.functions";
import type { PartnerReportList, PartnerMovementList } from "@/lib/partners/types";
import { statusLabel } from "@/lib/partners/types";
import { exportPartnerCsv } from "@/lib/partners/export";

export function PartnerReport({
  organizationId,
  kind,
  filters,
}: {
  organizationId: string;
  kind: "shipments" | "returns";
  filters: Record<string, string>;
}) {
  const fetch = useServerFn(queryPartners);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(filters);
  useEffect(() => setPage(1), [key, organizationId, kind]);
  const reportKind = kind === "shipments" ? "shipment_report" : "return_report";
  const q = useQuery({
    queryKey: ["partners", reportKind, organizationId, filters, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind: reportKind, filters, page },
      })) as PartnerReportList,
  });
  async function exportCsv() {
    setBusy(true);
    try {
      let n = 1;
      const rows: Record<string, unknown>[] = [];
      while (true) {
        const d = (await fetch({
          data: { organizationId, kind: reportKind, filters, page: n },
        })) as PartnerReportList;
        rows.push(
          ...d.rows.map((r) => ({
            Data: r.date,
            Documento: r.number,
            Parceiro: r.partner_name,
            Produto: r.product_name,
            SKU: r.sku,
            Tamanho: r.size,
            Cor: r.color,
            Lote: r.batch_code,
            Quantidade: r.quantity,
            Status: statusLabel(r.status),
            Condição: statusLabel(r.condition ?? ""),
            Motivo: r.reason,
          })),
        );
        if (n * 50 >= d.total) break;
        n++;
      }
      exportPartnerCsv(`${reportKind}.csv`, rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Relatório por produto e SKU</h3>
        <Button
          variant="outline"
          disabled={busy || !q.data?.total}
          onClick={() => void exportCsv()}
        >
          {busy ? "Exportando..." : "Exportar itens filtrados"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Aplica os filtros da listagem. Rascunhos e cancelamentos permanecem identificados pelo
        status; quantidade planejada só é enviada após expedição.
      </p>
      {q.isPending ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Nenhum item para os filtros" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {q.data.rows.map((r) => (
              <div key={r.item_id} className="space-y-1 rounded border p-3">
                <p className="break-all text-xs">
                  {r.number} · {r.date} · {statusLabel(r.status)}
                </p>
                <p className="font-semibold">
                  {r.partner_name} · {r.product_name}
                </p>
                <p>
                  {r.sku} · {[r.size, r.color, r.batch_code].filter(Boolean).join(" / ")} ·{" "}
                  {r.quantity} unidades
                </p>
                {r.condition ? (
                  <p>
                    {statusLabel(r.condition)} · {r.reason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {q.data.total > 50 ? (
            <div className="flex justify-between">
              <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span>Página {page}</span>
              <Button disabled={page * 50 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function PartnerMovementHistory({
  organizationId,
  partnerId,
}: {
  organizationId: string;
  partnerId: string;
}) {
  const fetch = useServerFn(queryPartners);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["partners", "history", organizationId, partnerId, page],
    queryFn: async () =>
      (await fetch({
        data: { organizationId, kind: "history", filters: { partner_id: partnerId }, page },
      })) as PartnerMovementList,
  });
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Movimentos nas localizações do parceiro</h3>
      {q.isPending ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState description={q.error.message} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Nenhuma movimentação" />
      ) : (
        <>
          {q.data.rows.map((m) => (
            <div key={m.id} className="space-y-1 rounded border p-3">
              <p>
                {new Date(m.occurred_at).toLocaleString("pt-BR")} · {m.location_name}
              </p>
              <p>
                {m.product_name} · {m.sku} · {m.direction === "IN" ? "Entrada" : "Saída"}{" "}
                {m.quantity}
              </p>
              <p>
                {m.movement_type} · {statusLabel(m.status)} · {m.reason}
              </p>
              <p className="text-xs">
                Movimento {m.id} · Usuário {m.created_by}
              </p>
            </div>
          ))}
          {q.data.total > 50 ? (
            <div className="flex justify-between">
              <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button disabled={page * 50 >= q.data.total} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
