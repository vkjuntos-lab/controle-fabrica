import { createFileRoute } from "@tanstack/react-router";

import { ConfigurationPage } from "@/components/crm/list";

export const Route = createFileRoute("/_authenticated/comercial/configuracoes/$section")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { title: "Configurações comerciais — Estratégia" }],
  }),
  component: ConfigurationRoute,
});

/** A seção vem da rota; um valor desconhecido cai na primeira configuração. */
function ConfigurationRoute() {
  const { section } = Route.useParams();
  return <ConfigurationPage section={section} />;
}
