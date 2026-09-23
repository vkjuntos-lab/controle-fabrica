import { createFileRoute } from "@tanstack/react-router";
import { PriceTablesPage } from "@/components/reconciliation/pricing";
export const Route = createFileRoute("/_authenticated/reconciliacao/tabelas-preco")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: PriceTablesPage,
});
