import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { RecebimentosPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/recebimentos")({
  head: () => ({
    meta: [{ title: "Compras — Recebimentos" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
const DETAIL = "/_authenticated/compras/recebimentos/$id";
function Page() {
  const detail = useRouterState({ select: (s) => s.matches.some((m) => m.routeId === DETAIL) });
  return detail ? <Outlet /> : <RecebimentosPage />;
}
