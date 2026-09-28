import { createFileRoute } from "@tanstack/react-router";
import { SalesOrderPage } from "@/components/sales/workspace";
export const Route = createFileRoute("/_authenticated/vendas/pedidos/$id")({component:Page});
function Page(){const {id}=Route.useParams();return <SalesOrderPage id={id}/>;}
