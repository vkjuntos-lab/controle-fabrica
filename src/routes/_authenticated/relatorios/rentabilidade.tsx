import { createFileRoute } from "@tanstack/react-router";
import { ProfitabilityPage } from "@/components/costs/commercial";
export const Route = createFileRoute("/_authenticated/relatorios/rentabilidade")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfitabilityPage,
});
