import { createFileRoute } from "@tanstack/react-router";
import { PartnerDetailPage } from "@/components/partners/pages";
export const Route = createFileRoute("/_authenticated/parceiros/empresas/$id")({
  head: () => ({
    meta: [{ title: "Parceiros — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <PartnerDetailPage id={Route.useParams().id} />;
}
