import { createFileRoute } from "@tanstack/react-router";

import { MySchedulePage } from "@/components/crm/activities";

export const Route = createFileRoute("/_authenticated/comercial/agenda")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Minha agenda — Estratégia" }],
  }),
  component: MySchedulePage,
});
