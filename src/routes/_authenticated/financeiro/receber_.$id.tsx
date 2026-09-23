import { createFileRoute } from "@tanstack/react-router";
import { FinanceReceivableDetailPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/receber_/$id")({
  head: () => ({
    meta: [{ title: "Financeiro — Título a receber" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <FinanceReceivableDetailPage id={Route.useParams().id} />;
}