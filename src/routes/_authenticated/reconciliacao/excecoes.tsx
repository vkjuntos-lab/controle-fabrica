import { createFileRoute } from "@tanstack/react-router";
import { ExceptionsPage } from "@/components/reconciliation/pages";
export const Route = createFileRoute("/_authenticated/reconciliacao/excecoes")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: ExceptionsPage,
});
