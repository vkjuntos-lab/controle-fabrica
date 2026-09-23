import { createFileRoute } from "@tanstack/react-router";
import { ReconciliationDashboard } from "@/components/reconciliation/pages";
export const Route = createFileRoute("/_authenticated/reconciliacao/")({
  head: () => ({
    meta: [{ title: "Reconciliação — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: ReconciliationDashboard,
});
