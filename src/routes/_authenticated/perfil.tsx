import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { ErrorState, LoadingState } from "@/components/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyProfile,
  removeMyAvatar,
  setMyAvatar,
  updateMyProfile,
} from "@/lib/org/organizations.functions";
import { useOrganization } from "@/lib/org/org-context";
import { ROLE_LABELS } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — Estratégia" },
      { name: "description", content: "Dados da sua conta na plataforma Estratégia." },
      { property: "og:title", content: "Meu perfil — Estratégia" },
      { property: "og:description", content: "Dados da sua conta na plataforma Estratégia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const { organizations } = useOrganization();
  const [fullName, setFullName] = useState("");

  const profileQuery = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });

  useEffect(() => {
    if (profileQuery.data?.full_name) setFullName(profileQuery.data.full_name);
  }, [profileQuery.data]);

  const mutation = useMutation({
    mutationFn: (name: string) => saveProfile({ data: { fullName: name } }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      void profileQuery.refetch();
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  return (
    <AppShell title="Meu perfil">
      {profileQuery.isLoading ? (
        <LoadingState rows={2} />
      ) : profileQuery.error ? (
        <ErrorState
          description={(profileQuery.error as Error).message}
          onRetry={() => void profileQuery.refetch()}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados da conta</CardTitle>
              <CardDescription>O e-mail é usado para entrar e não pode ser alterado aqui.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="max-w-md space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(fullName);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="profile-email">E-mail</Label>
                  <Input id="profile-email" value={profileQuery.data?.email ?? ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Nome completo</Label>
                  <Input
                    id="profile-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Minhas organizações</CardTitle>
              <CardDescription>Papel em cada organização da qual você participa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {organizations.map((org) => (
                <div
                  key={org.organization_id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                >
                  <span className="truncate font-medium">{org.name}</span>
                  <span className="text-muted-foreground">{ROLE_LABELS[org.role]}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
