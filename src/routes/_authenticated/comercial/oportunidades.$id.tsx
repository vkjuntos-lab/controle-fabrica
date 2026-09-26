import { createFileRoute } from "@tanstack/react-router";

import { OpportunityDetailPage } from "@/components/crm/opportunities";

export const Route = createFileRoute("/_authenticated/comercial/oportunidades/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Oportunidade — Estratégia" }],
  }),
  component: OpportunityRoute,
});

function OpportunityRoute() {
  const { id } = Route.useParams();
  return <OpportunityDetailPage id={id} />;
}
