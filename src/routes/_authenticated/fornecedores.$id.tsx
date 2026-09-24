import { createFileRoute } from "@tanstack/react-router";
import { FornecedorDetailPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/fornecedores/$id")({
  head: () => ({
    meta: [{ title: "Fornecedor — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <FornecedorDetailPage id={Route.useParams().id} />;
}
