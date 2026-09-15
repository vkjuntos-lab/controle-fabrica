import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useOrganization } from "@/lib/org/org-context";
import { PLATFORM_MODULES, ROLE_LABELS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Estratégia" },
      { name: "description", content: "Visão geral da operação da fábrica na plataforma Estratégia." },
      { property: "og:title", content: "Dashboard — Estratégia" },
      { property: "og:description", content: "Visão geral da operação da fábrica na plataforma Estratégia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { currentOrganization, organizations, role, isLoading, error, refetch } = useOrganization();

  if (isLoading) {
    return (
      <AppShell title="Dashboard">
        <LoadingState rows={4} />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Dashboard">
        <ErrorState description={error.message} onRetry={refetch} />
      </AppShell>
    );
  }

  if (!organizations.length || !currentOrganization) {
    return (
      <AppShell title="Dashboard">
        <EmptyState
          title="Nenhuma organização"
          description="Crie a organização da sua empresa para começar a usar a plataforma."
          action={
            <Button asChild>
              <Link to="/onboarding">Criar organização</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <div>
        <h2 className="font-heading text-xl font-semibold">{currentOrganization.name}</h2>
        <p className="text-sm text-muted-foreground">
          Seu papel nesta organização: {role ? ROLE_LABELS[role] : "-"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indicadores</CardTitle>
          <CardDescription>
            Quantidade vendida, estoque e financeiro aparecerão aqui quando houver movimentações
            registradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Sem movimentações"
            description="Nenhum número é exibido enquanto não existirem dados reais. Nada aqui é simulado."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Módulos da plataforma</CardTitle>
          <CardDescription>Situação real de cada módulo previsto no roadmap.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {PLATFORM_MODULES.map((m) => (
            <div
              key={m.key}
              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
              <Badge variant={m.status === "available" ? "default" : "secondary"}>
                {m.status === "available" ? "Disponível" : "Em breve"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
