import { createFileRoute } from "@tanstack/react-router";

import { OpportunitiesPage } from "@/components/crm/opportunities";

export const Route = createFileRoute("/_authenticated/comercial/oportunidades")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Pipeline — Estratégia" }],
  }),
  component: OpportunitiesPage,
});
