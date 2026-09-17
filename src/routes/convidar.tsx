import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation, getInvitationByToken } from "@/lib/org/organizations.functions";
import { ROLE_LABELS, type AppRole } from "@/lib/rbac";

export const Route = createFileRoute("/convidar")({
  validateSearch: (search) => z.object({ token: z.string().uuid().optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Convite — Estratégia" },
      { name: "description", content: "Aceite seu convite para entrar na organização." },
      { property: "og:title", content: "Convite — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const token = Route.useSearch({ select: (s) => s.token }) ?? "";
  const navigate = useNavigate();
  const fetchInvitation = useServerFn(getInvitationByToken);
  const accept = useServerFn(acceptInvitation);

  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(undefined);
  const [invitation, setInvitation] = useState<{
    organizationName: string;
    email: string;
    role: AppRole;
    inviteMatchesAccount: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Link de convite inválido.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchInvitation({ data: { token } })
      .then((data) => {
        if (cancelled) return;
        setInvitation(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const acceptMutation = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: () => {
      toast.success("Convite aceito");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (err: Error) => toast.error("Não foi possível aceitar", { description: err.message }),
  });

  if (!token) {
    return (
      <PublicLayout>
        <Card>
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>O link de convite não foi informado.</CardDescription>
          </CardHeader>
        </Card>
      </PublicLayout>
    );
  }

  if (loading) {
    return (
      <PublicLayout>
        <LoadingState rows={2} />
      </PublicLayout>
    );
  }

  if (error) {
    return (
      <PublicLayout>
        <Alert>
          <AlertTitle>Não foi possível abrir o convite</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <ErrorState
          title="Precisa de ajuda?"
          description="Entre em contato com quem te enviou o convite para gerar um novo link."
          onRetry={() => navigate({ to: "/convidar", search: { token }, replace: true })}
        />
      </PublicLayout>
    );
  }

  if (sessionUserId === undefined || !invitation) {
    return (
      <PublicLayout>
        <LoadingState rows={2} />
      </PublicLayout>
    );
  }

  if (!sessionUserId) {
    return (
      <PublicLayout>
        <Card>
          <CardHeader>
            <CardTitle>Você foi convidado</CardTitle>
            <CardDescription>
              {invitation.organizationName} te convidou para participar como{" "}
              {ROLE_LABELS[invitation.role].toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para aceitar, entre ou crie uma conta usando o e-mail convidado:
            </p>
            <p className="font-medium">{invitation.email}</p>
            <Button
              className="w-full"
              onClick={() =>
                navigate({
                  to: "/auth",
                  search: { redirect: `/convidar?token=${encodeURIComponent(token)}` },
                })
              }
            >
              Entrar ou criar conta
            </Button>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <Card>
        <CardHeader>
          <CardTitle>Convite para {invitation.organizationName}</CardTitle>
          <CardDescription>
            Este convite é para <span className="font-medium">{invitation.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Papel previsto:</span>
            <Badge variant="secondary">{ROLE_LABELS[invitation.role]}</Badge>
          </div>

          {invitation.inviteMatchesAccount ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O convite corresponde ao e-mail da sua conta. Aceite para começar.
              </p>
              <Button
                className="w-full"
                disabled={acceptMutation.isPending}
                onClick={() => acceptMutation.mutate()}
              >
                {acceptMutation.isPending ? "Aceitando..." : "Aceitar convite"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Você está logado com outro e-mail. Saia e entre com{" "}
              <strong>{invitation.email}</strong> para aceitar este convite.
            </p>
          )}
        </CardContent>
      </Card>
    </PublicLayout>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            E
          </div>
          <span className="font-heading text-lg font-semibold">Estratégia</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
