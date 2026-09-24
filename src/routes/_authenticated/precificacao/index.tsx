import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/components/costs/commercial";
export const Route = createFileRoute("/_authenticated/precificacao/")({
  head: () => ({
    meta: [
      { title: "Custos e rentabilidade — Estratégia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PricingPage,
});
