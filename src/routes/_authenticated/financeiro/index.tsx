import { createFileRoute } from "@tanstack/react-router";
import { FinanceDashboardPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/")({
  head: () => ({
    meta: [{ title: "Financeiro — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceDashboardPage,
});
