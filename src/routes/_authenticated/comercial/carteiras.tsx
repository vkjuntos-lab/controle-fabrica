import { createFileRoute } from "@tanstack/react-router";

import { PortfoliosPage } from "@/components/crm/team";

export const Route = createFileRoute("/_authenticated/comercial/carteiras")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Carteiras — Estratégia" }],
  }),
  component: PortfoliosPage,
});
