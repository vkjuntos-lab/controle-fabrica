import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PedidosPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/pedidos")({
  head: () => ({
    meta: [{ title: "Compras — Pedidos" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
const DETAIL = "/_authenticated/compras/pedidos/$id";
function Page() {
  const detail = useRouterState({ select: (s) => s.matches.some((m) => m.routeId === DETAIL) });
  return detail ? <Outlet /> : <PedidosPage />;
}