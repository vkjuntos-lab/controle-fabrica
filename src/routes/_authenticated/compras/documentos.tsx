import { createFileRoute } from "@tanstack/react-router";
import { DocumentosPage } from "@/components/purchasing/pages";
export const Route = createFileRoute("/_authenticated/compras/documentos")({
  head: () => ({
    meta: [{ title: "Compras — Documentos" }, { name: "robots", content: "noindex" }],
  }),
  component: DocumentosPage,
});