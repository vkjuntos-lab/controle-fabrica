import { createFileRoute } from "@tanstack/react-router";
import { FinanceReceivablesPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  head: () => ({
    meta: [{ title: "Financeiro — Contas a receber" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceReceivablesPage,
});
