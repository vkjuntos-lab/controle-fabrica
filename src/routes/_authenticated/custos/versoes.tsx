import { createFileRoute } from "@tanstack/react-router";
import { CostVersionsPage } from "@/components/costs/pages";
export const Route = createFileRoute("/_authenticated/custos/versoes")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CostVersionsPage,
});
