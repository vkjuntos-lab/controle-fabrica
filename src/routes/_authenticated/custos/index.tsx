import { createFileRoute } from "@tanstack/react-router";
import { CostDashboard } from "@/components/costs/pages";
export const Route = createFileRoute("/_authenticated/custos/")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CostDashboard,
});
