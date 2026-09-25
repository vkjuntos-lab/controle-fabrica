import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, PermissionDenied, ErrorState } from "@/components/states";
import { useOrganization } from "@/lib/org/org-context";
export function PlanningShell({
  title,
  permission = "planning.read",
  children,
}: {
  title: string;
  permission?: string;
  children: (org: string) => ReactNode;
}) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  return (
    <AppShell title={title}>
      <nav className="flex flex-wrap gap-2">
        {[
          ["/planejamento", "Dashboard", "planning.read"],
          ["/planejamento/execucoes", "Planejamentos", "planning.read"],
          ["/planejamento/forecast", "Forecast manual", "planning.adjust_forecast"],
          ["/planejamento/simulacao", "Simulação e comparação", "planning.simulate"],
          ["/planejamento/configuracoes", "Parâmetros", "planning.run"],
        ]
          .filter(([, , p]) => hasPermission(p))
          .map(([href, label]) => (
            <Button key={href} asChild variant="outline">
              <a href={href}>{label}</a>
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
export function State({
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
      description="Revise os filtros ou registre os dados necessários para planejar."
    />
  ) : (
    <>{children}</>
  );
}
export function Pagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (p: number) => void;
}) {
  return total > 50 ? (
    <div className="flex items-center gap-3">
      <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Anterior
      </Button>
      <span>
        {page} / {Math.ceil(total / 50)}
      </span>
      <Button disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>
        Próxima
      </Button>
    </div>
  ) : null;
}
