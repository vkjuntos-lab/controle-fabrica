import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Factory, LineChart, Store } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Estratégia — Gestão da fábrica ao recebimento" },
      {
        name: "description",
        content:
          "Plataforma de gestão para fábricas: produção, estoque, marketplaces, parceiros, cobrança e financeiro em um só fluxo.",
      },
      { property: "og:title", content: "Estratégia — Gestão da fábrica ao recebimento" },
      {
        property: "og:description",
        content:
          "Plataforma de gestão para fábricas: produção, estoque, marketplaces, parceiros, cobrança e financeiro em um só fluxo.",
      },
    ],
  }),
  component: LandingPage,
});

const PILLARS = [
  { icon: Factory, title: "Produção", text: "Matéria-prima e produto acabado no mesmo fluxo." },
  { icon: Boxes, title: "Estoque", text: "Saldo formado por movimentos, sem controle paralelo." },
  { icon: Store, title: "Canais", text: "Loja própria, marketplaces, parceiros e B2B." },
  { icon: LineChart, title: "Resultado", text: "Quantidade vendida e financeiro lado a lado." },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            E
          </div>
          <span className="font-heading text-lg font-semibold">Estratégia</span>
        </div>
        <Button asChild>
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:pt-20">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Plataforma de gestão industrial
        </p>
        <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">
          Da matéria-prima ao recebimento, em um fluxo só.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Controle produção, estoque, remessas para parceiros, vendas em marketplaces, cobrança e
          financeiro sem planilhas paralelas. Esta é a fundação do sistema — os módulos operacionais
          serão liberados por etapa.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Acessar a plataforma</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <article key={p.title} className="rounded-xl border border-border bg-card p-5">
              <p.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 font-heading text-base font-semibold">{p.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6">
        <p className="mx-auto w-full max-w-6xl px-6 text-xs text-muted-foreground">
          Estratégia — acesso restrito a usuários autorizados.
        </p>
      </footer>
    </div>
  );
}
