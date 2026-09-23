import { createFileRoute } from "@tanstack/react-router";
import { FinancePayableDetailPage } from "@/components/finance/pages";
export const Route = createFileRoute("/_authenticated/financeiro/pagar_/$id")({
  head: () => ({
    meta: [{ title: "Financeiro — Título a pagar" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <FinancePayableDetailPage id={Route.useParams().id} />;
}
