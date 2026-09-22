import { createFileRoute } from "@tanstack/react-router";
import { PartnerListPage } from "@/components/partners/pages";
export const Route = createFileRoute("/_authenticated/parceiros/remessas")({
  head: () => ({
    meta: [{ title: "Parceiros — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <PartnerListPage kind="shipments" />;
}
