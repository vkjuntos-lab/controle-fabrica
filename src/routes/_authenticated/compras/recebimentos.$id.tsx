import { createFileRoute } from "@tanstack/react-router";
import { RecebimentoDetailPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/recebimentos/$id")({
  head: () => ({
    meta: [{ title: "Compras — Recebimento" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <RecebimentoDetailPage id={Route.useParams().id} />;
}
