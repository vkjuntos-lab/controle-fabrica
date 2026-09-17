import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listRolePermissions,
  updateRolePermission,
} from "@/lib/org/organizations.functions";
import { useOrganization } from "@/lib/org/org-context";
import {
  APP_ROLES,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AppRole,
} from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/admin/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões — Estratégia" },
      { name: "description", content: "Matriz de papéis e permissões da plataforma Estratégia." },
      { property: "og:title", content: "Permissões — Estratégia" },
      { property: "og:description", content: "Matriz de papéis e permissões da plataforma Estratégia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PermissionsAdminPage,
});

function PermissionsAdminPage() {
  const { hasPermission, currentOrganization, isLoading: orgLoading } = useOrganization();
  const fetchPermissions = useServerFn(listRolePermissions);

  const query = useQuery({
    queryKey: ["role-permissions", "matrix"],
    queryFn: () => fetchPermissions(),
  });

  const rows = query.data ?? [];
  const permissions = Array.from(new Set(rows.map((r) => r.permission))).sort();
  const granted = new Set(rows.map((r) => `${r.role}:${r.permission}`));

  return (
    <AppShell title="Administração · Permissões">
      {orgLoading ? (
        <LoadingState rows={3} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.permissionsRead) ? (
        <PermissionDenied permission={PERMISSIONS.permissionsRead} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Papéis</CardTitle>
              <CardDescription>
                As permissões são aplicadas no banco de dados, não apenas na tela.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {APP_ROLES.map((role) => (
                <div key={role} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{ROLE_LABELS[role]}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Matriz de permissões</CardTitle>
              <CardDescription>
                Somente leitura nesta etapa. A edição da matriz será liberada em uma próxima fase.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {query.isLoading ? (
                <LoadingState rows={3} />
              ) : query.error ? (
                <ErrorState
                  description={(query.error as Error).message}
                  onRetry={() => void query.refetch()}
                />
              ) : !permissions.length ? (
                <EmptyState title="Nenhuma permissão cadastrada" />
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Permissão</TableHead>
                        {APP_ROLES.map((role) => (
                          <TableHead key={role} className="text-center">
                            {ROLE_LABELS[role]}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {permissions.map((permission) => (
                        <TableRow key={permission}>
                          <TableCell>
                            <p className="font-medium">
                              {PERMISSION_LABELS[permission] ?? permission}
                            </p>
                            <p className="text-xs text-muted-foreground">{permission}</p>
                          </TableCell>
                          {APP_ROLES.map((role) => (
                            <TableCell key={role} className="text-center">
                              {granted.has(`${role}:${permission}`) ? (
                                <Check className="mx-auto h-4 w-4 text-primary" aria-label="Permitido" />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
