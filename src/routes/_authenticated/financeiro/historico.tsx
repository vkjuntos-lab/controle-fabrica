import { createFileRoute } from "@tanstack/react-router";
import { FinanceHistoryPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/historico")({
  head: () => ({
    meta: [{ title: "Financeiro — Histórico" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceHistoryPage,
});
