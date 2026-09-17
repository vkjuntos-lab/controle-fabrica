import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, RefreshCw, ScrollText } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAuditActions,
  listAuditLogs,
  type AuditLogRow,
} from "@/lib/org/organizations.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria — Estratégia" },
      { name: "description", content: "Registro de auditoria das operações da organização." },
      { property: "og:title", content: "Auditoria — Estratégia" },
      { property: "og:description", content: "Registro de auditoria das operações da organização." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditAdminPage,
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function actionLabel(action: string): string {
  const parts = action.split(".");
  if (parts.length < 2) return action;
  const verb = parts[0];
  const nouns: Record<string, string> = {
    organization: "Organização",
    member: "Participante",
  };
  return `${nouns[parts[1]] ?? parts[1]} · ${verb}`;
}

function contextSummary(context: AuditLogRow["context"]): string | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const entries = Object.entries(context as Record<string, unknown>);
  if (!entries.length) return null;
  const kept = entries.filter(([key, value]) => {
    if (["email", "role", "full_name"].includes(key)) return true;
    return typeof value === "string" || typeof value === "boolean" || typeof value === "number";
  });
  return kept.map(([key, value]) => `${key}=${String(value)}`).join(" · ");
}

function AuditAdminPage() {
  const { hasPermission, currentOrganization, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchLogs = useServerFn(listAuditLogs);
  const fetchActions = useServerFn(listAuditActions);

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [action, setAction] = useState("__all__");

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, action]);

  const logsQuery = useQuery({
    queryKey: ["audit-logs", organizationId, page, deferredQuery, action],
    queryFn: () =>
      fetchLogs({
        data: {
          organizationId: organizationId!,
          page,
          pageSize: 15,
          query: deferredQuery || undefined,
          action: action === "__all__" ? undefined : action,
        },
      }),
    enabled: Boolean(organizationId),
  });

  const actionsQuery = useQuery({
    queryKey: ["audit-actions", organizationId],
    queryFn: () => fetchActions({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  const maxPage = useMemo(
    () => Math.max(1, Math.ceil((logsQuery.data?.total ?? 0) / (logsQuery.data?.pageSize ?? 1))),
    [logsQuery.data],
  );

  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [page, maxPage]);

  const rows = logsQuery.data?.rows ?? [];
  const total = logsQuery.data?.total ?? 0;
  const actions = actionsQuery.data ?? [];

  return (
    <AppShell title="Administração · Auditoria">
      {orgLoading ? (
        <LoadingState rows={3} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.auditRead) ? (
        <PermissionDenied permission={PERMISSIONS.auditRead} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registro de auditoria</CardTitle>
            <CardDescription>
              Operações sensíveis registradas nesta organização. O log é escrito somente pelo
              servidor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                className="sm:max-w-xs"
                placeholder="Buscar por ação, recurso ou resultado..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as ações</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {actionLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void logsQuery.refetch()}
                disabled={logsQuery.isFetching}
                aria-label="Atualizar"
              >
                <RefreshCw className={logsQuery.isFetching ? "animate-spin" : ""} />
              </Button>
              <p className="text-xs text-muted-foreground sm:ml-auto">
                {total === 0 ? "Nenhum registro ainda" : `${total} registro${total === 1 ? "" : "s"}`}
              </p>
            </div>

            {logsQuery.isLoading ? (
              <LoadingState rows={4} />
            ) : logsQuery.error ? (
              <ErrorState
                description={(logsQuery.error as Error).message}
                onRetry={() => void logsQuery.refetch()}
              />
            ) : !rows.length ? (
              <EmptyState
                icon={<ScrollText className="h-8 w-8" />}
                title="Nenhum registro de auditoria"
                description="Os eventos aparecerão aqui conforme operações sensíveis forem executadas."
              />
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Autor</TableHead>
                        <TableHead>Detalhes</TableHead>
                        <TableHead className="text-right">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((entry: AuditLogRow) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDate(entry.created_at)}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{actionLabel(entry.action)}</p>
                            <p className="font-mono text-xs text-muted-foreground">{entry.action}</p>
                          </TableCell>
                          <TableCell>
                            {entry.user_id ? (
                              <>
                                <p className="font-medium">{entry.user_name ?? "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {entry.user_email ?? "—"}
                                </p>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-muted-foreground">
                              {[entry.resource, entry.resource_id, contextSummary(entry.context)]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                entry.result === "success"
                                  ? "secondary"
                                  : entry.result === "error"
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {entry.result}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Página {logsQuery.data?.page ?? 1} de {maxPage}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || logsQuery.isFetching}
                    >
                      <ChevronLeft /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                      disabled={page >= maxPage || logsQuery.isFetching}
                    >
                      Próxima <ChevronRight />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}