import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  addExistingUserAsMember,
  listMembers,
  removeMember,
  updateMemberRole,
} from "@/lib/org/organizations.functions";
import { useOrganization } from "@/lib/org/org-context";
import { APP_ROLES, PERMISSIONS, ROLE_LABELS, type AppRole } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Estratégia" },
      { name: "description", content: "Participantes e papéis da organização na plataforma Estratégia." },
      { property: "og:title", content: "Usuários — Estratégia" },
      { property: "og:description", content: "Participantes e papéis da organização na plataforma Estratégia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsersAdminPage,
});

function UsersAdminPage() {
  const { currentOrganization, hasPermission, role, isLoading: orgLoading } = useOrganization();
  const organizationId = currentOrganization?.organization_id;

  const fetchMembers = useServerFn(listMembers);
  const saveMember = useServerFn(updateMemberRole);
  const deleteMember = useServerFn(removeMember);
  const addMember = useServerFn(addExistingUserAsMember);

  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("comercial");

  const membersQuery = useQuery({
    queryKey: ["members", organizationId],
    queryFn: () => fetchMembers({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { memberId: string; role?: AppRole; isActive?: boolean }) =>
      saveMember({ data: { organizationId: organizationId!, ...input } }),
    onSuccess: () => {
      toast.success("Participante atualizado");
      void membersQuery.refetch();
    },
    onError: (error: Error) => toast.error("Não foi possível atualizar", { description: error.message }),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      deleteMember({ data: { organizationId: organizationId!, memberId } }),
    onSuccess: () => {
      toast.success("Participante removido");
      void membersQuery.refetch();
    },
    onError: (error: Error) => toast.error("Não foi possível remover", { description: error.message }),
  });

  const addMutation = useMutation({
    mutationFn: () => addMember({ data: { organizationId: organizationId!, email, role: newRole } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error("Conta não encontrada", {
          description:
            "Esta pessoa ainda não possui conta. Peça que ela crie a conta em Entrar > Criar conta e tente novamente.",
        });
        return;
      }
      toast.success("Participante adicionado");
      setEmail("");
      void membersQuery.refetch();
    },
    onError: (error: Error) => toast.error("Não foi possível adicionar", { description: error.message }),
  });

  const canManage = hasPermission(PERMISSIONS.usersManage);
  const canRemove = role === "admin";

  return (
    <AppShell title="Administração · Usuários">
      {orgLoading ? (
        <LoadingState rows={3} />
      ) : !currentOrganization ? (
        <EmptyState title="Nenhuma organização selecionada" />
      ) : !hasPermission(PERMISSIONS.usersRead) ? (
        <PermissionDenied permission={PERMISSIONS.usersRead} />
      ) : (
        <>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adicionar participante</CardTitle>
                <CardDescription>
                  Informe o e-mail de alguém que já possui conta na plataforma. O envio de convite por
                  e-mail ainda não está disponível.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addMutation.mutate();
                  }}
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="member-email">E-mail</Label>
                    <Input
                      id="member-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="member-role">Papel</Label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                      <SelectTrigger id="member-role" className="w-full sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APP_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={addMutation.isPending}>
                    {addMutation.isPending ? "Adicionando..." : "Adicionar"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Participantes</CardTitle>
              <CardDescription>Papéis definem o que cada pessoa pode fazer.</CardDescription>
            </CardHeader>
            <CardContent>
              {membersQuery.isLoading ? (
                <LoadingState rows={3} />
              ) : membersQuery.error ? (
                <ErrorState
                  description={(membersQuery.error as Error).message}
                  onRetry={() => void membersQuery.refetch()}
                />
              ) : !membersQuery.data?.length ? (
                <EmptyState title="Nenhum participante" />
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pessoa</TableHead>
                        <TableHead>Papel</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {membersQuery.data.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <p className="font-medium">{m.full_name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{m.email ?? "—"}</p>
                          </TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={m.role}
                                onValueChange={(v) =>
                                  updateMutation.mutate({ memberId: m.id, role: v as AppRole })
                                }
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {APP_ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>
                                      {ROLE_LABELS[r]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              ROLE_LABELS[m.role]
                            )}
                          </TableCell>
                          <TableCell>{m.is_active ? "Ativo" : "Inativo"}</TableCell>
                          <TableCell className="space-x-2 text-right">
                            {canManage ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateMutation.mutate({ memberId: m.id, isActive: !m.is_active })
                                }
                              >
                                {m.is_active ? "Desativar" : "Ativar"}
                              </Button>
                            ) : null}
                            {canRemove && !m.is_self ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeMutation.mutate(m.id)}
                              >
                                Remover
                              </Button>
                            ) : null}
                          </TableCell>
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
