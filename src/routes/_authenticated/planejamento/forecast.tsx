import { createFileRoute } from "@tanstack/react-router";
import { PlanningForecastPage } from "@/components/planning/pages";
export const Route = createFileRoute("/_authenticated/planejamento/forecast")({
  head: () => ({
    meta: [{ title: "Planejamento — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanningForecastPage,
});
