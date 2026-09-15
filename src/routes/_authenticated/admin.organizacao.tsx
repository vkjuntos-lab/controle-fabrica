import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOrganization, updateOrganization } from "@/lib/org/organizations.functions";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/admin/organizacao")({
  head: () => ({
    meta: [
      { title: "Organização — Estratégia" },
      { name: "description", content: "Dados cadastrais da organização na plataforma Estratégia." },
      { property: "og:title", content: "Organização — Estratégia" },
      { property: "og:description", content: "Dados cadastrais da organização na plataforma Estratégia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrganizationAdminPage,
});

function OrganizationAdminPage() {
  const { currentOrganization, hasPermission, isLoading: orgLoading } = useOrganization();
  const fetchOrg = useServerFn(getOrganization);
  const saveOrg = useServerFn(updateOrganization);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");

  const organizationId = currentOrganization?.organization_id;

  const orgQuery = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => fetchOrg({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  useEffect(() => {
    if (orgQuery.data) {
      setName(orgQuery.data.name);
      setDocument(orgQuery.data.document ?? "");
    }
  }, [orgQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      saveOrg({ data: { organizationId: organizationId!, name, document: document || null } }),
    onSuccess: () => {
      toast.success("Organização atualizada");
      void orgQuery.refetch();
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  const canManage = hasPermission(PERMISSIONS.organizationManage);

  return (
    <AppShell title="Administração · Organização">
      {orgLoading ? (
        <LoadingState rows={2} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.organizationRead) ? (
        <PermissionDenied permission={PERMISSIONS.organizationRead} />
      ) : orgQuery.isLoading ? (
        <LoadingState rows={2} />
      ) : orgQuery.error ? (
        <ErrorState
          description={(orgQuery.error as Error).message}
          onRetry={() => void orgQuery.refetch()}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da organização</CardTitle>
            <CardDescription>
              {canManage
                ? "Alterações são registradas no log de auditoria."
                : "Você possui apenas acesso de leitura a estes dados."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="max-w-md space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="org-name">Nome</Label>
                <Input
                  id="org-name"
                  value={name}
                  disabled={!canManage}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-doc">CNPJ</Label>
                <Input
                  id="org-doc"
                  value={document}
                  disabled={!canManage}
                  onChange={(e) => setDocument(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Identificador</Label>
                <Input id="org-slug" value={orgQuery.data?.slug ?? ""} disabled />
              </div>
              {canManage ? (
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
