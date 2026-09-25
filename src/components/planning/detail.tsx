import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useOrganization } from "@/lib/org/org-context";
import {
  queryPlanning,
  actPlanningOrder,
  actPlanningException,
  type PlanningRow,
} from "@/lib/planning/planning.functions";
import { exportPartnerCsv } from "@/lib/partners/export";
import { PlanningShell, State, Pagination } from "./shared";
import { inputClass, rows, record, number, labels } from "./format";
type Kind =
  | "orders"
  | "requirements"
  | "shortages"
  | "exceptions"
  | "projections"
  | "items"
  | "facts"
  | "channels"
  | "conversions";
const tabs: [Kind, string][] = [
  ["orders", "Sugestões"],
  ["requirements", "Necessidades"],
  ["items", "Produtos / materiais"],
  ["projections", "Projeção temporal"],
  ["shortages", "Rupturas / segurança"],
  ["exceptions", "Exceções"],
  ["channels", "Demanda por canal"],
  ["facts", "Fontes"],
  ["conversions", "Conversões"],
];
const fields: Record<Kind, [string, string][]> = {
  orders: [
    ["quantity", "Quantidade sugerida"],
    ["required_date", "Data necessária"],
    ["suggested_start_date", "Início de produção"],
    ["suggested_order_date", "Data de compra"],
    ["converted_qty", "Já convertida"],
  ],
  requirements: [
    ["required_date", "Data"],
    ["required_quantity", "Necessidade bruta"],
    ["available_quantity", "Saldo inicial do dia"],
    ["scheduled_receipt_quantity", "Recebimento no dia"],
    ["net_requirement", "Necessidade líquida"],
    ["planning_quantity", "Sugestão"],
    ["lead_time_days", "Lead time (dias)"],
    ["suggested_order_date", "Data sugerida"],
  ],
  items: [
    ["opening_quantity", "On hand incluído"],
    ["partner_quantity", "Em parceiros (separado)"],
    ["transit_quantity", "Em trânsito (separado)"],
    ["daily_demand", "Média diária"],
    ["days_of_cover", "Cobertura em dias"],
    ["last_sale_date", "Última venda válida na janela"],
    ["last_movement_at", "Última movimentação"],
  ],
  projections: [
    ["bucket_date", "Data"],
    ["opening_quantity", "Abertura"],
    ["base_forecast", "Forecast base"],
    ["manual_adjustment", "Ajuste manual"],
    ["dependent_demand", "Demanda da produção"],
    ["demand", "Demanda total"],
    ["scheduled_receipts", "Recebimentos programados"],
    ["planned_receipts", "Recebimentos sugeridos"],
    ["projected_without_plans", "Saldo sem novas sugestões"],
    ["projected_quantity", "Saldo se sugestões forem executadas"],
    ["safety_stock", "Segurança"],
    ["excess_quantity", "Acima do alvo configurado"],
  ],
  shortages: [
    ["shortage_date", "Data da necessidade"],
    ["shortage_quantity", "Quantidade faltante ao objetivo"],
    ["severity", "Severidade"],
    ["source", "Origem"],
  ],
  exceptions: [
    ["severity", "Severidade"],
    ["message", "Descrição"],
    ["status", "Tratamento"],
  ],
  facts: [
    ["source_type", "Tipo de fonte"],
    ["required_date", "Data"],
    ["quantity", "Unidades na unidade de estoque"],
    ["source_id", "Documento de origem"],
  ],
  channels: [
    ["channel", "Canal"],
    ["marketplace", "Marketplace"],
    ["store_id", "Loja (referência)"],
    ["units", "Unidades vendidas"],
  ],
  conversions: [
    ["source_type", "Documento criado"],
    ["source_id", "Referência"],
    ["quantity", "Quantidade"],
    ["created_at", "Data"],
  ],
};
const whyFields: [string, string][] = [
  ["opening", "Saldo inicial"],
  ["base_forecast", "Forecast base"],
  ["manual_adjustment", "Ajuste manual"],
  ["dependent_demand", "Demanda da BOM / produção"],
  ["gross_requirement", "Demanda bruta"],
  ["scheduled_receipts", "Recebimentos programados"],
  ["safety_stock", "Segurança"],
  ["target_stock", "Alvo"],
  ["net_requirement", "Necessidade líquida"],
  ["suggested_quantity", "Quantidade sugerida"],
  ["lead_time_days", "Lead time (dias)"],
  ["bom_version", "Versão da BOM"],
];
function value(v: unknown) {
  if (v == null) return "Não informado";
  return typeof v === "number" ? number(v) : (labels[String(v)] ?? String(v));
}
export function PlanningDetailPage({ id }: { id: string }) {
  return (
    <PlanningShell title="Planejamento · Resultado">
      {(org) => <Detail org={org} id={id} />}
    </PlanningShell>
  );
}
function Detail({ org, id }: { org: string; id: string }) {
  const api = useServerFn(queryPlanning),
    act = useServerFn(actPlanningOrder),
    exception = useServerFn(actPlanningException),
    cache = useQueryClient();
  const { hasPermission } = useOrganization();
  const [kind, setKind] = useState<Kind>("orders"),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [orderType, setOrderType] = useState(""),
    [bucket, setBucket] = useState("DAILY");
  const [exporting, setExporting] = useState(false);
  const header = useQuery({
    queryKey: ["planning", org, "run", id],
    queryFn: () => api({ data: { organizationId: org, kind: "run", filters: { run_id: id } } }),
  });
  const filters = {
    run_id: id,
    query: search,
    order_type: kind === "orders" ? orderType : "",
    bucket,
  };
  const query = useQuery({
    queryKey: ["planning", org, kind, filters, page],
    queryFn: () => api({ data: { organizationId: org, kind, filters, page } }),
  });
  const options = useQuery({
    queryKey: ["planning", org, "options"],
    queryFn: () => api({ data: { organizationId: org, kind: "options" } }),
  });
  const [decision, setDecision] = useState<{
    row: PlanningRow;
    action: "review" | "approve" | "dismiss" | "convert" | "resolve" | "ignore" | "reopen";
    key: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      if (!decision) throw new Error("Selecione uma ação");
      if (["resolve", "ignore", "reopen"].includes(decision.action))
        return exception({
          data: {
            organizationId: org,
            id: decision.row.id,
            action: decision.action as "resolve" | "ignore" | "reopen",
            reason: String(f.reason),
          },
        });
      return act({
        data: {
          organizationId: org,
          id: decision.row.id,
          action: decision.action as "review" | "approve" | "dismiss" | "convert",
          values: {
            reason: String(f.reason ?? ""),
            ...(decision.action === "convert"
              ? {
                  quantity: Number(f.quantity),
                  idempotency_key: decision.key,
                  ...(f.source_location_id
                    ? {
                        source_location_id: String(f.source_location_id),
                        destination_location_id: String(f.destination_location_id),
                      }
                    : {}),
                }
              : {}),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Decisão registrada com auditoria");
      setDecision(null);
      void cache.invalidateQueries({ queryKey: ["planning", org] });
    },
    onError: (e) => toast.error(e.message),
  });
  const open = (row: PlanningRow, action: NonNullable<typeof decision>["action"]) =>
    setDecision({ row, action, key: crypto.randomUUID() });
  async function exportCsv() {
    setExporting(true);
    try {
      let all: PlanningRow[] = [];
      let p = 1,
        total = 1;
      while (all.length < total) {
        const response = await api({
          data: { organizationId: org, kind, filters, page: p++, export: true },
        });
        const got = rows(response.rows);
        all = all.concat(got);
        total = Number(response.total ?? got.length);
        if (!got.length) break;
      }
      exportPartnerCsv(
        `planejamento-${kind}.csv`,
        all.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k,
              v && typeof v === "object" ? JSON.stringify(v) : v,
            ]),
          ),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="space-y-4">
      <State loading={header.isLoading} error={header.error} empty={!header.data}>
        <h2 className="text-xl font-semibold">{String(header.data?.name)}</h2>
        <p>
          {labels[String(header.data?.status)]} ·{" "}
          {header.data?.simulated ? "Simulação sem conversão" : "Planejamento base"} ·{" "}
          {String(header.data?.horizon_start)} → {String(header.data?.horizon_end)}
        </p>
        {header.data?.error && (
          <p className="text-destructive" role="alert">
            {String(header.data.error)}. Corrija os dados e execute novo planejamento.
          </p>
        )}
        <p className="text-sm">
          Saldo projetado com sugestões é condicional. Aprovar uma sugestão não compra, não produz e
          não movimenta o ledger.
        </p>
        <details>
          <summary>Parâmetros e fontes congelados</summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
            {JSON.stringify(header.data?.parameters_snapshot, null, 2)}
          </pre>
        </details>
      </State>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            variant={kind === key ? "default" : "outline"}
            onClick={() => {
              setKind(key);
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          className="sm:max-w-sm"
          placeholder="Buscar produto / SKU"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {kind === "orders" && (
          <Label>
            Tipo
            <select
              className={inputClass}
              value={orderType}
              onChange={(e) => {
                setOrderType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              <option value="PRODUCTION">Produção</option>
              <option value="PURCHASE">Compra</option>
            </select>
          </Label>
        )}
        {kind === "projections" && (
          <Label>
            Intervalo
            <select
              className={inputClass}
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value);
                setPage(1);
              }}
            >
              <option value="DAILY">Diário</option>
              <option value="WEEKLY">Semanal</option>
            </select>
          </Label>
        )}
        {hasPermission("planning.export") && (
          <Button
            variant="outline"
            disabled={exporting || query.isLoading}
            onClick={() => void exportCsv()}
          >
            {exporting ? "Exportando…" : "Exportar CSV filtrado"}
          </Button>
        )}
      </div>
      <State loading={query.isLoading} error={query.error} empty={!rows(query.data?.rows).length}>
        <div className="grid gap-3 lg:grid-cols-2">
          {rows(query.data?.rows).map((r, i) => (
            <article key={r.id ?? i} className="space-y-3 rounded border p-4">
              <h3 className="font-semibold">
                {String(r.sku ?? r.marketplace ?? "")} {r.product_name ? `· ${r.product_name}` : ""}
              </h3>
              {kind === "orders" && (
                <p>
                  {labels[String(r.order_type)]} · {labels[String(r.status)]}
                </p>
              )}
              {kind === "exceptions" && (
                <strong>{labels[String(r.exception_type)] ?? String(r.exception_type)}</strong>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {fields[kind].map(([key, label]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-words font-medium">
                      {key === "days_of_cover" && r[key] == null
                        ? "Sem consumo suficiente para cálculo"
                        : value(r[key])}
                    </dd>
                  </div>
                ))}
              </dl>
              {kind === "orders" && (
                <>
                  <details open>
                    <summary className="cursor-pointer font-medium">Por que esta sugestão?</summary>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      {whyFields.map(([key, label]) => (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd className="font-medium">{value(record(r.why)[key])}</dd>
                        </div>
                      ))}
                    </dl>
                    {record(r.why).rounding === "MOQ_OR_ORDER_MULTIPLE" && (
                      <p className="mt-2 text-sm">
                        Quantidade arredondada pelo MOQ e/ou múltiplo de compra configurado.
                      </p>
                    )}
                    <p className="mt-2 text-sm">
                      Prazo de compra:{" "}
                      {String(
                        record(record(r.why).supplier).lead_time_source ??
                          "Não aplicável/configurado",
                      )}
                    </p>
                  </details>
                  {!header.data?.simulated && (
                    <div className="flex flex-wrap gap-2">
                      {hasPermission("planning.approve_suggestion") &&
                        ["SUGGESTED", "REVIEWED"].includes(String(r.status)) && (
                          <>
                            <Button onClick={() => open(r, "approve")}>Aprovar</Button>
                            {r.status === "SUGGESTED" && (
                              <Button variant="outline" onClick={() => open(r, "review")}>
                                Marcar revisada
                              </Button>
                            )}
                          </>
                        )}
                      {hasPermission("planning.approve_suggestion") &&
                        !["CONVERTED", "DISMISSED"].includes(String(r.status)) &&
                        Number(r.converted_qty) === 0 && (
                          <Button variant="outline" onClick={() => open(r, "dismiss")}>
                            Descartar
                          </Button>
                        )}
                      {r.status === "APPROVED" &&
                        hasPermission(
                          r.order_type === "PURCHASE"
                            ? "planning.convert_purchase"
                            : "planning.convert_production",
                        ) && (
                          <Button onClick={() => open(r, "convert")}>
                            Converter em{" "}
                            {r.order_type === "PURCHASE" ? "requisição" : "ordem de produção"}
                          </Button>
                        )}
                    </div>
                  )}
                </>
              )}
              {kind === "exceptions" && hasPermission("planning.approve_suggestion") && (
                <div className="flex flex-wrap gap-2">
                  {r.status === "OPEN" ? (
                    <>
                      <Button onClick={() => open(r, "resolve")}>Registrar resolução</Button>
                      <Button variant="outline" onClick={() => open(r, "ignore")}>
                        Registrar ressalva
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => open(r, "reopen")}>
                      Reabrir
                    </Button>
                  )}
                </div>
              )}
              {kind === "conversions" && (
                <a
                  className="text-sm underline"
                  href={
                    r.source_type === "PURCHASE_REQUEST"
                      ? "/compras/requisicoes"
                      : "/planejamento/execucoes"
                  }
                >
                  {r.source_type === "PURCHASE_REQUEST"
                    ? "Consultar requisições de compra"
                    : "Consultar rastreabilidade de produção"}
                </a>
              )}
              {r.context && (
                <details>
                  <summary>Rastreabilidade da fonte</summary>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(r.context, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))}
        </div>
        <Pagination page={page} total={query.data?.total ?? 0} setPage={setPage} />
      </State>
      <Dialog
        open={!!decision}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setDecision(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "convert" ? "Confirmar conversão humana" : "Registrar decisão"}
            </DialogTitle>
            <DialogDescription>
              {decision?.action === "convert"
                ? "Cria um documento real em rascunho. A aprovação e a execução seguem o fluxo do módulo de origem. Não movimenta estoque agora."
                : "A decisão será auditada. Resolver uma exceção não recalcula o snapshot; execute novo planejamento após corrigir a fonte."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(e.currentTarget);
            }}
          >
            {decision?.action === "convert" && (
              <>
                <Label>
                  Quantidade (restante{" "}
                  {number(Number(decision.row.quantity) - Number(decision.row.converted_qty))})
                  <Input
                    name="quantity"
                    type="number"
                    required
                    min="0.001"
                    step="0.001"
                    max={Number(decision.row.quantity) - Number(decision.row.converted_qty)}
                    defaultValue={
                      Number(decision.row.quantity) - Number(decision.row.converted_qty)
                    }
                  />
                </Label>
                {decision.row.order_type === "PRODUCTION" && (
                  <>
                    {[
                      ["source_location_id", "Origem dos materiais"],
                      ["destination_location_id", "Destino da produção"],
                    ].map(([key, label]) => (
                      <Label key={key}>
                        {label}
                        <select required name={key} className={inputClass}>
                          <option value="">Selecione</option>
                          {rows(options.data?.locations)
                            .filter(
                              (l) =>
                                !["PARTNER", "TRANSIT"].includes(String(l.type)) &&
                                l.purpose === "NORMAL",
                            )
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {String(l.name)}
                              </option>
                            ))}
                        </select>
                      </Label>
                    ))}
                  </>
                )}
              </>
            )}
            <Label>
              Motivo
              <Input name="reason" required />
            </Label>
            {mutation.error && (
              <p role="alert" className="text-destructive">
                {mutation.error.message}
              </p>
            )}
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando…" : "Confirmar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
