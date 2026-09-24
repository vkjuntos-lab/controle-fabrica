import { createFileRoute } from "@tanstack/react-router";
import { CostInputsPage } from "@/components/costs/pages";
export const Route = createFileRoute("/_authenticated/custos/insumos")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CostInputsPage,
});
