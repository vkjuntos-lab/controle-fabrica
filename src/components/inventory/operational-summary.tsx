import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/states";
import { getInventoryDashboard } from "@/lib/inventory/inventory.functions";
import { formatQuantity } from "@/lib/inventory/constants";

export function OperationalSummary({ organizationId }: { organizationId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const fetchSummary = useServerFn(getInventoryDashboard);
  const valid = Boolean(from && to && from <= to);
  const summary = useQuery({
    queryKey: ["inventory-summary", organizationId, from, to],
    queryFn: () =>
      fetchSummary({
        data: {
          organizationId,
          from: new Date(`${from}T00:00:00Z`).toISOString(),
          to: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString(),
        },
      }),
    enabled: valid,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumo operacional</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <Label htmlFor="summary-from">De (UTC)</Label>
            <Input
              id="summary-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="summary-to">Até (UTC)</Label>
            <Input id="summary-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {!valid ? (
          <p>Selecione um período válido.</p>
        ) : summary.isLoading ? (
          <LoadingState rows={2} />
        ) : summary.error ? (
          <ErrorState description={summary.error.message} onRetry={() => void summary.refetch()} />
        ) : summary.data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[
                ["SKUs com saldo atual", summary.data.skus_with_balance],
                ["SKUs com saldo zero", summary.data.zero_skus],
                ["Entradas no período", summary.data.in_quantity],
                ["Saídas no período", summary.data.out_quantity],
                ["Ajustes no período", summary.data.adjustments],
                ["Divergências abertas", summary.data.open_differences],
              ].map(([label, value]) => (
                <div className="rounded-lg border p-3" key={label}>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold">{formatQuantity(Number(value))}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Entradas e saídas incluem transferências físicas. Saldo On Hand atual; reservas e
              valor financeiro não são calculados.
            </p>
            <div className="flex flex-wrap gap-3">
              {summary.data.locations.map((l) => (
                <span key={l.id} className="rounded border px-3 py-2 text-sm">
                  {l.name}: <strong>{formatQuantity(l.on_hand)}</strong>
                </span>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
