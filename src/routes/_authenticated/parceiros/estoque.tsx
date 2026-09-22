import { createFileRoute } from "@tanstack/react-router";
import { PartnerInventoryPage } from "@/components/partners/pages";
export const Route = createFileRoute("/_authenticated/parceiros/estoque")({
  head: () => ({
    meta: [{ title: "Parceiros — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});
function Page() {
  return <PartnerInventoryPage />;
}
