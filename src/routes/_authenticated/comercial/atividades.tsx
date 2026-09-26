import { createFileRoute } from "@tanstack/react-router";

import { ActivitiesPage } from "@/components/crm/activities";

export const Route = createFileRoute("/_authenticated/comercial/atividades")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Atividades — Estratégia" }],
  }),
  component: ActivitiesPage,
});
