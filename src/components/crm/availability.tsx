import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/lib/org/org-context";
import { useCrmDetail } from "./data";
import { Picker, ResultState, str } from "./shared";

export function QuoteAvailability({ org }: { org: string }) {
  const { hasPermission } = useOrganization();
  const [variant, setVariant] = useState("");
  const stock = useCrmDetail(
    org,
    "stock",
    { id: variant },
    !!variant && hasPermission("inventory.read"),
  );
  const future = useCrmDetail(
    org,
    "availability",
    { id: variant },
    !!variant && hasPermission("planning.read") && hasPermission("inventory.read"),
  );
  if (!hasPermission("inventory.read")) return null;
  return (
    <details className="rounded border p-3">
      <summary className="cursor-pointer font-medium">Consultar estoque e previsões</summary>
      <div className="mt-3 space-y-3">
        <Picker org={org} kind="variants" value={variant} onChange={setVariant} label="Variante" />
        <p className="text-sm text-muted-foreground">
          On hand é saldo físico. Esta consulta não reserva estoque. Entradas planejadas e previsão
          estatística não garantem entrega.
        </p>
        {variant && (
          <ResultState
            loading={stock.isLoading}
            error={stock.error}
            empty={!stock.data?.rows?.length}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {stock.data?.rows?.map((r) => (
                <div key={r.id} className="rounded border p-2">
                  {str(r.name)} ({str(r.type)}): <strong>{str(r.on_hand)}</strong>
                </div>
              ))}
            </div>
          </ResultState>
        )}
        {variant && hasPermission("planning.read") && (
          <ResultState
            loading={future.isLoading}
            error={future.error}
            empty={!future.data?.rows?.length}
          >
            <p className="text-sm">
              Último planejamento base concluído (snapshot histórico); até 50 dias projetados.
            </p>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Entrada programada</th>
                    <th>Entrada planejada</th>
                    <th>Saldo projetado</th>
                  </tr>
                </thead>
                <tbody>
                  {future.data?.rows?.map((r) => (
                    <tr key={r.id}>
                      <td>{str(r.bucket_date)}</td>
                      <td>{str(r.scheduled_receipts)}</td>
                      <td>{str(r.planned_receipts)}</td>
                      <td>{str(r.projected_quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button asChild variant="link">
              <a href="/planejamento/execucoes">Consultar origem do planejamento</a>
            </Button>
          </ResultState>
        )}
      </div>
    </details>
  );
}
