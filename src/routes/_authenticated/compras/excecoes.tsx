import { createFileRoute } from "@tanstack/react-router";
import { ExcecoesPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/excecoes")({
  head: () => ({
    meta: [{ title: "Compras — Exceções" }, { name: "robots", content: "noindex" }],
  }),
  component: ExcecoesPage,
});
