import { createFileRoute } from "@tanstack/react-router";
import { FinanceSettingsPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/configuracoes")({
  head: () => ({
    meta: [{ title: "Financeiro — Configurações" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceSettingsPage,
});
