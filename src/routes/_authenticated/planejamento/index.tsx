import { createFileRoute } from "@tanstack/react-router";
import { PlanningDashboard } from "@/components/planning/pages";
export const Route = createFileRoute("/_authenticated/planejamento/")({
  head: () => ({
    meta: [{ title: "Planejamento — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanningDashboard,
});
