import { createFileRoute } from "@tanstack/react-router";
import { PedidoDetailPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/pedidos/$id")({
  head: () => ({
    meta: [{ title: "Compras — Pedido" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <PedidoDetailPage id={Route.useParams().id} />;
}
