import { createFileRoute } from "@tanstack/react-router";
import { SalesPage } from "@/components/sales/workspace";
export const Route = createFileRoute("/_authenticated/vendas/")({validateSearch:(s:Record<string,unknown>)=>({view:typeof s.view==="string"?s.view:"orders"}),component:Page});
function Page(){const {view}=Route.useSearch();return <SalesPage view={view}/>;}
