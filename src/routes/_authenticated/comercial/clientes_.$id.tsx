import { createFileRoute } from "@tanstack/react-router";

import { Customer360Page } from "@/components/crm/customers";

export const Route = createFileRoute("/_authenticated/comercial/clientes_/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Cliente — Estratégia" }],
  }),
  component: Customer360Route,
});

/** O id da rota é o da empresa, não o do perfil comercial. */
function Customer360Route() {
  const { id } = Route.useParams();
  return <Customer360Page id={id} />;
}
