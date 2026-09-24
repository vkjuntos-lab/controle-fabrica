import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { CotacoesPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/cotacoes")({
  head: () => ({
    meta: [{ title: "Compras — Cotações" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
const DETAIL = "/_authenticated/compras/cotacoes/$id";
function Page() {
  const detail = useRouterState({ select: (s) => s.matches.some((m) => m.routeId === DETAIL) });
  return detail ? <Outlet /> : <CotacoesPage />;
}