import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { FornecedoresPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [{ title: "Fornecedores — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
const DETAIL = "/_authenticated/fornecedores/$id";
function Page() {
  const detail = useRouterState({ select: (s) => s.matches.some((m) => m.routeId === DETAIL) });
  return detail ? <Outlet /> : <FornecedoresPage />;
}
