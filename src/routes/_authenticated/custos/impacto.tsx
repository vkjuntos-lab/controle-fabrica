import { createFileRoute } from "@tanstack/react-router";
import { CostImpactPage } from "@/components/costs/pages";
export const Route = createFileRoute("/_authenticated/custos/impacto")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CostImpactPage,
});
