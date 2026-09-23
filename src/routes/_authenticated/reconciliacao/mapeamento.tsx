import { createFileRoute } from "@tanstack/react-router";
import { SkuMappingsPage } from "@/components/reconciliation/marketplace";
export const Route = createFileRoute("/_authenticated/reconciliacao/mapeamento")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: SkuMappingsPage,
});