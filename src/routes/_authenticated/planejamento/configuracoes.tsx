import { createFileRoute } from "@tanstack/react-router";
import { PlanningSettingsPage } from "@/components/planning/pages";
export const Route = createFileRoute("/_authenticated/planejamento/configuracoes")({
  head: () => ({
    meta: [{ title: "Planejamento — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanningSettingsPage,
});
