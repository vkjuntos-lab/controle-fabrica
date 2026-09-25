import { createFileRoute } from "@tanstack/react-router";
import { PlanningRunsPage } from "@/components/planning/pages";
export const Route = createFileRoute("/_authenticated/planejamento/simulacao")({
  head: () => ({
    meta: [{ title: "Planejamento — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <PlanningRunsPage simulation />,
});
