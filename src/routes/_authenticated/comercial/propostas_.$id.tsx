import { createFileRoute } from "@tanstack/react-router";

import { QuoteDetailPage } from "@/components/crm/quotes";

export const Route = createFileRoute("/_authenticated/comercial/propostas_/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Proposta — Estratégia" }],
  }),
  component: QuoteRoute,
});

function QuoteRoute() {
  const { id } = Route.useParams();
  return <QuoteDetailPage id={id} />;
}
