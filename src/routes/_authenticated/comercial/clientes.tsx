import { createFileRoute } from "@tanstack/react-router";

import { CustomersPage } from "@/components/crm/customers";

export const Route = createFileRoute("/_authenticated/comercial/clientes")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Clientes — Estratégia" }],
  }),
  component: CustomersPage,
});
