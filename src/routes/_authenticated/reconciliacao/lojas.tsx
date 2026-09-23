import { createFileRoute } from "@tanstack/react-router";
import { StoresPage } from "@/components/reconciliation/marketplace";
export const Route = createFileRoute("/_authenticated/reconciliacao/lojas")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: StoresPage,
});