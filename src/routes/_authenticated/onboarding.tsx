import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "@/lib/org/organizations.functions";
import { useOrganization } from "@/lib/org/org-context";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Criar organização — Estratégia" },
      { name: "description", content: "Cadastre a organização da sua empresa na plataforma Estratégia." },
      { property: "og:title", content: "Criar organização — Estratégia" },
      { property: "og:description", content: "Cadastre a organização da sua empresa na plataforma Estratégia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { refetch, setCurrentOrganization } = useOrganization();
  const create = useServerFn(createOrganization);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { name: string; document?: string }) => create({ data: input }),
    onSuccess: (org) => {
      setCurrentOrganization(org.id);
      refetch();
      toast.success("Organização criada");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível criar a organização", { description: error.message }),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Criar organização</CardTitle>
          <CardDescription>
            Uma organização representa a empresa. Todos os dados (estoque, canais, parceiros e
            financeiro) pertencem a ela. Você entra como administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ name, document: document || undefined });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="org-name">Nome da empresa</Label>
              <Input
                id="org-name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-document">CNPJ (opcional)</Label>
              <Input
                id="org-document"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Criando..." : "Criar organização"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
