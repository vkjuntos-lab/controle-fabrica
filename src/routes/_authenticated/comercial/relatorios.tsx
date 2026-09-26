import { createFileRoute } from "@tanstack/react-router";

import { ReportsPage } from "@/components/crm/reports";

export const Route = createFileRoute("/_authenticated/comercial/relatorios")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Relatórios comerciais — Estratégia" }],
  }),
  component: ReportsPage,
});
