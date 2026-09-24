import { createFileRoute } from "@tanstack/react-router";
import { CotacaoDetailPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/cotacoes/$id")({
  head: () => ({
    meta: [{ title: "Compras — Cotação" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <CotacaoDetailPage id={Route.useParams().id} />;
}
