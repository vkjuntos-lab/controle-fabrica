import { createFileRoute } from "@tanstack/react-router";
import { FinanceRecurrencesPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/recorrencias")({
  head: () => ({
    meta: [{ title: "Financeiro — Recorrências" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceRecurrencesPage,
});