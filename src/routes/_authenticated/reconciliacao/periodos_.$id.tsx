import { createFileRoute } from "@tanstack/react-router";
import { ReconciliationDetailPage } from "@/components/reconciliation/pages";
export const Route = createFileRoute("/_authenticated/reconciliacao/periodos_/$id")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <ReconciliationDetailPage id={Route.useParams().id} />;
}