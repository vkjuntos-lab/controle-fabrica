import { createFileRoute } from "@tanstack/react-router";

import { RepresentativesPage } from "@/components/crm/team";

export const Route = createFileRoute("/_authenticated/comercial/representantes")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Representantes — Estratégia" }],
  }),
  component: RepresentativesPage,
});
