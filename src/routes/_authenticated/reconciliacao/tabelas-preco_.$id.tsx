import { createFileRoute } from "@tanstack/react-router";
import { PriceTableDetailPage } from "@/components/reconciliation/pricing";
export const Route = createFileRoute("/_authenticated/reconciliacao/tabelas-preco_/$id")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <PriceTableDetailPage id={Route.useParams().id} />;
}