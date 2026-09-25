import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { useOrganization } from "@/lib/org/org-context";
import { labels, money, type CostRow } from "@/lib/costs/types";
import type { Json } from "@/integrations/supabase/types";
export const inputClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
export const asRows = (value: unknown): CostRow[] =>
  Array.isArray(value) ? (value as CostRow[]) : [];
export const asRecord = (value: unknown): Record<string, Json | undefined> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
export function CostShell({
  title,
  permission,
  children,
}: {
  title: string;
  permission: string;
  children: (org: string) => ReactNode;
}) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  return (
    <AppShell title={title}>
      <nav className="flex flex-wrap gap-2">
        {[
          ["/custos", "Custos", "costs.read"],
          ["/custos/calcular", "Calcular", "costs.calculate"],
          ["/custos/simulador", "Simular custo", "costs.simulate"],
          ["/custos/insumos", "Configurações", "costs.read"],
          ["/custos/versoes", "Versões", "costs.read"],
          ["/custos/impacto", "Impacto", "costs.simulate"],
          ["/custos/producao", "Padrão × real", "costs.read"],
          ["/precificacao", "Precificação", "pricing.read"],
          ["/relatorios/rentabilidade", "Rentabilidade", "profitability.read"],
        ]
          .filter(([, , p]) => hasPermission(p))
          .map(([to, label]) => (
            <Button key={to} variant="outline" asChild>
              <a href={to}>{label}</a>
            </Button>
          ))}
      </nav>
      {isLoading ? (
        <LoadingState />
      ) : !currentOrganization ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission(permission) ? (
        <PermissionDenied permission={permission} />
      ) : (
        <div key={currentOrganization.organization_id} className="space-y-5">
          {children(currentOrganization.organization_id)}
        </div>
      )}
    </AppShell>
  );
}
export function QueryState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: Error | null;
  empty: boolean;
  children: ReactNode;
}) {
  return loading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState description={error.message} />
  ) : empty ? (
    <EmptyState
      title="Nenhum resultado"
      description="Revise os filtros ou registre os dados necessários."
    />
  ) : (
    <>{children}</>
  );
}
export function Pages({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return total > 50 ? (
    <div className="flex items-center justify-between gap-3">
      <Button disabled={page === 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span>
        Página {page} de {Math.ceil(total / 50)}
      </span>
      <Button disabled={page * 50 >= total} onClick={() => onPage(page + 1)}>
        Próxima
      </Button>
    </div>
  ) : null;
}
export function Issues({ value }: { value: unknown }) {
  return Array.isArray(value) && value.length ? (
    <ul className="space-y-1 text-sm">
      {value.map((raw, i) => {
        const v = typeof raw === "string" ? { code: raw } : asRecord(raw);
        return (
          <li
            key={i}
            className={v.severity === "BLOCKING" ? "text-destructive" : "text-muted-foreground"}
          >
            {labels[String(v.code)] ?? String(v.code)} {v.activity ? `· ${v.activity}` : ""}
            {v.variant_id ? ` · Variante ${v.variant_id}` : ""}
          </li>
        );
      })}
    </ul>
  ) : null;
}
export function Breakdown({ row }: { row: CostRow }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          "material_cost",
          "component_cost",
          "packaging_cost",
          "labor_cost",
          "loss_cost",
          "overhead_cost",
          "other_cost",
          "total_unit_cost",
        ].map((key) => (
          <div key={key} className="rounded border p-3">
            <p className="text-xs text-muted-foreground">{labels[key]}</p>
            <strong>{money(row[key])}</strong>
          </div>
        ))}
      </div>
      <Issues value={row.issues} />
      {row.error ? (
        <p className="text-destructive" role="alert">
          {String(row.error)}
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm">Memória de cálculo e fontes utilizadas</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
          {JSON.stringify(row.source_reference ?? row, null, 2)}
        </pre>
      </details>
    </div>
  );
}
