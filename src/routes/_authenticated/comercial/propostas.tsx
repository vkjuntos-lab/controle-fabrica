import { createFileRoute } from "@tanstack/react-router";

import { QuotesPage } from "@/components/crm/quotes";

export const Route = createFileRoute("/_authenticated/comercial/propostas")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Propostas — Estratégia" }],
  }),
  component: QuotesPage,
});
