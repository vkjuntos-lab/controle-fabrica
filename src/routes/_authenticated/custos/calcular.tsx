import { createFileRoute } from "@tanstack/react-router";
import { CostCalculatePage } from "@/components/costs/pages";
export const Route = createFileRoute("/_authenticated/custos/calcular")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CostCalculatePage,
});
