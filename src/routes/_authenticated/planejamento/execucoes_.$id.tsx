import { createFileRoute } from "@tanstack/react-router";
import { PlanningDetailPage } from "@/components/planning/detail";
export const Route = createFileRoute("/_authenticated/planejamento/execucoes_/$id")({
  component: Page,
});
function Page() {
  const { id } = Route.useParams();
  return <PlanningDetailPage id={id} />;
}
