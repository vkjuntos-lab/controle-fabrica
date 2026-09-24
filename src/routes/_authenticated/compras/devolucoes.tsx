import { createFileRoute } from "@tanstack/react-router";
import { DevolucoesPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/devolucoes")({
  head: () => ({
    meta: [{ title: "Compras — Devoluções" }, { name: "robots", content: "noindex" }],
  }),
  component: DevolucoesPage,
});
