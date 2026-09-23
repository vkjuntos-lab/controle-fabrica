import { createFileRoute } from "@tanstack/react-router";
import { FinanceCashflowPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/fluxo")({
  head: () => ({
    meta: [{ title: "Financeiro — Fluxo de caixa" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceCashflowPage,
});