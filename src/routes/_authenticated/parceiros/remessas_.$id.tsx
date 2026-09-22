import { createFileRoute } from "@tanstack/react-router";
import { PartnerOperationPage } from "@/components/partners/pages";
export const Route = createFileRoute("/_authenticated/parceiros/remessas_/$id")({
  head: () => ({
    meta: [{ title: "Parceiros — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <PartnerOperationPage id={Route.useParams().id} kind="shipment" />;
}
