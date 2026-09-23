import { createFileRoute } from "@tanstack/react-router";
import { FinancePayablesPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/pagar")({
  head: () => ({
    meta: [{ title: "Financeiro — Contas a pagar" }, { name: "robots", content: "noindex" }],
  }),
  component: FinancePayablesPage,
});