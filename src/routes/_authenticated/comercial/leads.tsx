import { createFileRoute } from "@tanstack/react-router";

import { LeadsPage } from "@/components/crm/leads";

export const Route = createFileRoute("/_authenticated/comercial/leads")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Leads — Estratégia" }],
  }),
  component: LeadsPage,
});
