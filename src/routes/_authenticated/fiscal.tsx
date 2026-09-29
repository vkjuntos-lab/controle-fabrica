import { createFileRoute } from "@tanstack/react-router";
import { FiscalPage } from "@/components/fiscal/workspace";
export const Route = createFileRoute("/_authenticated/fiscal")({
  validateSearch: (s: Record<string, unknown>) => ({
    view: typeof s.view === "string" ? s.view : "dashboard",
  }),
  component: Page,
});
function Page() {
  const { view } = Route.useSearch();
  return <FiscalPage view={view} />;
}
