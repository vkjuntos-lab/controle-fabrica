import { createFileRoute } from "@tanstack/react-router";

import { CommercialDashboard } from "@/components/crm/dashboard";

export const Route = createFileRoute("/_authenticated/comercial/")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Comercial — Estratégia" }],
  }),
  component: CommercialDashboard,
});
