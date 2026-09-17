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
  const saveAvatar = useServerFn(setMyAvatar);
  const clearAvatar = useServerFn(removeMyAvatar);
  const { organizations } = useOrganization();
  const [fullName, setFullName] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleAvatarChange(file: File | undefined) {
    const profile = profileQuery.data;
    if (!file || !profile) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Formato não suportado", { description: "Use JPG, PNG ou WebP." });
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Imagem muito grande", { description: "Envie uma imagem de até 1,5 MB." });
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        cacheControl: "3600",
      });
      if (uploadError) throw new Error(uploadError.message);

      const result = await saveAvatar({ data: { path } });
      if (!result.ok) throw new Error("Não foi possível salvar o avatar.");

      toast.success("Foto atualizada");
      void profileQuery.refetch();
    } catch (error) {
      toast.error("Não foi possível enviar a foto", {
        description: (error as Error).message,
      });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAvatarRemove() {
    setUploadingAvatar(true);
    try {
      const result = await clearAvatar();
      if (!result.ok) throw new Error("Não foi possível remover a foto.");
      toast.success("Foto removida");
      void profileQuery.refetch();
    } catch (error) {
      toast.error("Não foi possível remover a foto", { description: (error as Error).message });
    } finally {
      setUploadingAvatar(false);
    }
  }

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
              <CardTitle className="text-base">Sua foto</CardTitle>
              <CardDescription>Usada para identificação visual nas telas da plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={profileQuery.data?.avatar_url ?? undefined}
                    alt="Foto de perfil"
                  />
                  <AvatarFallback className="text-lg">
                    {(profileQuery.data?.full_name?.[0] ?? "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? "Enviando..." : "Enviar foto"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handleAvatarChange(e.target.files?.[0])}
                  />
                  {profileQuery.data?.avatar_url ? (
                    <Button variant="ghost" onClick={() => void handleAvatarRemove()} disabled={uploadingAvatar}>
                      Remover
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

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
