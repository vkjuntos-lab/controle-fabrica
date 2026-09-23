import { createFileRoute } from "@tanstack/react-router";
import { FinanceAccountsPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/contas")({
  head: () => ({
    meta: [{ title: "Financeiro — Contas" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceAccountsPage,
});
