import { createFileRoute } from "@tanstack/react-router";
import { ReconciliationListPage } from "@/components/reconciliation/pages";
export const Route = createFileRoute("/_authenticated/reconciliacao/periodos")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: ReconciliationListPage,
});
