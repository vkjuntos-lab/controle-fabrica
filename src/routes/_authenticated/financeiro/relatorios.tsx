import { createFileRoute } from "@tanstack/react-router";
import { FinanceReportsPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/relatorios")({
  head: () => ({
    meta: [{ title: "Financeiro — Relatórios" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceReportsPage,
});
