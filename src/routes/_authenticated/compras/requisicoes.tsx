import { createFileRoute } from "@tanstack/react-router";
import { RequisicoesPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/requisicoes")({
  head: () => ({
    meta: [{ title: "Compras — Requisições" }, { name: "robots", content: "noindex" }],
  }),
  component: RequisicoesPage,
});
