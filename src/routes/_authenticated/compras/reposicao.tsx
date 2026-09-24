import { createFileRoute } from "@tanstack/react-router";
import { ReposicaoPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/reposicao")({
  head: () => ({
    meta: [{ title: "Compras — Reposição" }, { name: "robots", content: "noindex" }],
  }),
  component: ReposicaoPage,
});