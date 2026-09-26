import { createFileRoute } from "@tanstack/react-router";

import { RepresentativePortfolioPage } from "@/components/crm/team";

export const Route = createFileRoute("/_authenticated/comercial/representantes/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Carteira do representante — Estratégia" }],
  }),
  component: RepresentativeRoute,
});

function RepresentativeRoute() {
  const { id } = Route.useParams();
  return <RepresentativePortfolioPage id={id} />;
}
