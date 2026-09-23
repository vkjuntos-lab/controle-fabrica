import { createFileRoute } from "@tanstack/react-router";
import { FinanceTransactionsPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/lancamentos")({
  head: () => ({
    meta: [{ title: "Financeiro — Lançamentos" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceTransactionsPage,
});