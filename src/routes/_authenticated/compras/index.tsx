import { createFileRoute } from "@tanstack/react-router";
import { PurchasingDashboardPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/")({
  head: () => ({
    meta: [{ title: "Compras — Estratégia" }, { name: "robots", content: "noindex" }],
  }),
  component: PurchasingDashboardPage,
});
