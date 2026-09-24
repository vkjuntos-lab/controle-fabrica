import { createFileRoute } from "@tanstack/react-router";
import { PurchasingSettingsPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/configuracoes")({
  head: () => ({
    meta: [{ title: "Compras — Configurações" }, { name: "robots", content: "noindex" }],
  }),
  component: PurchasingSettingsPage,
});