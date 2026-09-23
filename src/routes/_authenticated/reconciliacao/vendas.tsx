import { createFileRoute } from "@tanstack/react-router";
import { SalesPage } from "@/components/reconciliation/marketplace";
export const Route = createFileRoute("/_authenticated/reconciliacao/vendas")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: SalesPage,
});
