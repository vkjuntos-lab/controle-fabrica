import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganization } from "@/lib/org/org-context";
import {
  queryPlanning,
  executePlanning,
  savePlanning,
  type PlanningRow,
} from "@/lib/planning/planning.functions";
import { PlanningShell, State, Pagination } from "./shared";
import { inputClass, rows, record, number, today, labels } from "./format";
export function PlanningDashboard() {
  return (
    <PlanningShell title="Planejamento · Dashboard">
      {(org) => <Dashboard org={org} />}
    </PlanningShell>
  );
}
function Dashboard({ org }: { org: string }) {
  const api = useServerFn(queryPlanning);
  const q = useQuery({
    queryKey: ["planning", org, "dashboard"],
    queryFn: () => api({ data: { organizationId: org, kind: "dashboard" } }),
  });
  const summary = record(q.data?.summary);
  return (
    <>
      <p>
        Planejamento não é execução. Forecast não é pedido confirmado. Nenhuma sugestão movimenta
        estoque ou gera obrigação financeira.
      </p>
      <State loading={q.isLoading} error={q.error} empty={!q.data?.id}>
        <p>
          Último planejamento base: {String(q.data?.name)} · {String(q.data?.planning_date)}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["shortage_items", "Itens com risco/necessidade"],
            ["material_items", "Materiais com necessidade"],
            ["production_orders", "Sugestões de produção"],
            ["purchase_orders", "Sugestões de compra"],
            ["late_orders", "Inícios sugeridos atrasados"],
            ["average_days_cover", "Cobertura média (dias)"],
            ["below_safety", "Itens abaixo da segurança"],
          ].map(([k, label]) => (
            <article key={k} className="rounded border p-4">
              <p className="text-sm">{label}</p>
              <strong className="text-2xl">
                {summary[k] == null ? "Sem consumo suficiente" : number(summary[k])}
              </strong>
            </article>
          ))}
        </div>
        {q.data?.id && (
          <Button asChild>
            <a href={`/planejamento/execucoes/${q.data.id}`}>Detalhar planejamento</a>
          </Button>
        )}
      </State>
    </>
  );
}
export function PlanningRunsPage({ simulation = false }: { simulation?: boolean }) {
  return (
    <PlanningShell
      title={simulation ? "Planejamento · Simulação e comparação" : "Planejamentos"}
      permission={simulation ? "planning.simulate" : "planning.read"}
    >
      {(org) => <Runs org={org} simulation={simulation} />}
    </PlanningShell>
  );
}
function Runs({ org, simulation }: { org: string; simulation: boolean }) {
  const api = useServerFn(queryPlanning),
    execute = useServerFn(executePlanning),
    save = useServerFn(savePlanning);
  const cache = useQueryClient();
  const { hasPermission } = useOrganization();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["planning", org, "runs", page, search],
    queryFn: () =>
      api({ data: { organizationId: org, kind: "runs", page, filters: { query: search } } }),
  });
  const options = useQuery({
    queryKey: ["planning", org, "options"],
    queryFn: () => api({ data: { organizationId: org, kind: "options" } }),
  });
  const [key, setKey] = useState(() => crypto.randomUUID()),
    [name, setName] = useState(""),
    [start, setStart] = useState(today()),
    [end, setEnd] = useState(() => new Date(Date.now() + 29 * 86400000).toISOString().slice(0, 10)),
    [scenario, setScenario] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      execute({
        data: {
          organizationId: org,
          values: {
            name,
            idempotency_key: key,
            horizon_start: start,
            horizon_end: end,
            simulated: simulation,
            scenario_id: scenario || undefined,
          },
        },
      }),
    onSuccess: (r) => {
      void cache.invalidateQueries({ queryKey: ["planning", org] });
      setKey(crypto.randomUUID());
      if (r.status === "FAILED") toast.error(String(r.error));
      else toast.success("Planejamento concluído. Revise avisos e sugestões.");
    },
    onError: (e) => toast.error(e.message),
  });
  const scenarioSave = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return save({
        data: {
          organizationId: org,
          kind: "scenario",
          values: {
            name: String(f.name),
            scenario_type: String(f.scenario_type),
            demand_multiplier: Number(f.demand_multiplier),
            lead_time_adjustment_days: Number(f.lead_time_adjustment_days),
            safety_stock_multiplier: Number(f.safety_stock_multiplier),
            target_stock_multiplier: Number(f.target_stock_multiplier),
          },
        },
      });
    },
    onSuccess: (r) => {
      setScenario(String(r.id));
      void cache.invalidateQueries({ queryKey: ["planning", org] });
      toast.success("Cenário salvo sem alterar parâmetros oficiais");
    },
    onError: (e) => toast.error(e.message),
  });
  const [baseRun, setBaseRun] = useState(""),
    [otherRun, setOtherRun] = useState("");
  const comparison = useQuery({
    queryKey: ["planning", org, "compare", baseRun, otherRun],
    queryFn: () =>
      api({
        data: {
          organizationId: org,
          kind: "compare",
          filters: { run_id: baseRun, other_run_id: otherRun },
        },
      }),
    enabled: !!baseRun && !!otherRun,
  });
  return (
    <div className="space-y-5">
      {simulation && (
        <>
          <p>
            Cenários são hipóteses matemáticas, não previsões garantidas. Sugestões de simulação não
            podem ser convertidas.
          </p>
          <details className="rounded border p-4">
            <summary>Criar cenário</summary>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                scenarioSave.mutate(e.currentTarget);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Label>
                  Nome
                  <Input name="name" required />
                </Label>
                <Label>
                  Tipo
                  <select name="scenario_type" className={inputClass}>
                    <option value="CUSTOM">Personalizado</option>
                    <option value="OPTIMISTIC">Otimista (configurado)</option>
                    <option value="CONSERVATIVE">Conservador (configurado)</option>
                  </select>
                </Label>
                <Label>
                  Multiplicador de demanda (1,2 = +20%)
                  <Input
                    name="demand_multiplier"
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue="1.2"
                  />
                </Label>
                <Label>
                  Ajuste do lead time / atraso de compras (dias)
                  <Input
                    name="lead_time_adjustment_days"
                    required
                    type="number"
                    min="-365"
                    max="365"
                    defaultValue="0"
                  />
                </Label>
                <Label>
                  Multiplicador de segurança
                  <Input
                    name="safety_stock_multiplier"
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue="1"
                  />
                </Label>
                <Label>
                  Multiplicador do estoque alvo
                  <Input
                    name="target_stock_multiplier"
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue="1"
                  />
                </Label>
              </div>
              <Button disabled={scenarioSave.isPending}>Salvar cenário</Button>
            </form>
          </details>
        </>
      )}
      {(hasPermission("planning.run") || simulation) && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <h2 className="font-semibold">
            {simulation ? "Executar simulação" : "Novo planejamento"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Label>
              Nome
              <Input
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              />
            </Label>
            <Label>
              Início
              <Input
                required
                type="date"
                min={today()}
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              />
            </Label>
            <Label>
              Horizonte
              <select
                className={inputClass}
                defaultValue="30"
                onChange={(e) => {
                  if (e.target.value !== "custom")
                    setEnd(
                      new Date(
                        new Date(start + "T00:00:00Z").getTime() +
                          (Number(e.target.value) - 1) * 86400000,
                      )
                        .toISOString()
                        .slice(0, 10),
                    );
                  setKey(crypto.randomUUID());
                }}
              >
                {[7, 15, 30, 60, 90, 180].map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
                <option value="custom">Personalizado</option>
              </select>
            </Label>
            <Label>
              Fim
              <Input
                required
                type="date"
                min={start}
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              />
            </Label>
            {simulation && (
              <Label>
                Cenário
                <select
                  className={inputClass}
                  value={scenario}
                  onChange={(e) => {
                    setScenario(e.target.value);
                    setKey(crypto.randomUUID());
                  }}
                >
                  <option value="">Base em modo simulação</option>
                  {rows(options.data?.scenarios)
                    .filter((s) => !s.is_base)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {String(s.name)}
                      </option>
                    ))}
                </select>
              </Label>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Cálculo no servidor, até 20.000 posições diárias. Use horizonte menor para catálogos
            grandes. O resultado preserva as fontes e parâmetros utilizados.
          </p>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? "Calculando no servidor…" : "Executar cálculo"}
          </Button>
          {mutation.error && (
            <p role="alert" className="text-destructive">
              {mutation.error.message}
            </p>
          )}
          {mutation.data?.id && (
            <p>
              <a className="underline" href={`/planejamento/execucoes/${mutation.data.id}`}>
                {labels[String(mutation.data.status)]} — abrir resultado
              </a>
            </p>
          )}
        </form>
      )}
      <Input
        aria-label="Buscar planejamento"
        placeholder="Buscar planejamento"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <State loading={q.isLoading} error={q.error} empty={!rows(q.data?.rows).length}>
        <div className="grid gap-3 sm:grid-cols-2">
          {rows(q.data?.rows).map((r) => (
            <article key={r.id} className="space-y-2 rounded border p-4">
              <h2 className="font-semibold">{String(r.name)}</h2>
              <p>
                {labels[String(r.status)]} · {r.simulated ? "Simulação" : "Base"}
              </p>
              <p>
                {String(r.horizon_start)} → {String(r.horizon_end)}
              </p>
              <Button variant="outline" asChild>
                <a href={`/planejamento/execucoes/${r.id}`}>Abrir resultado e fontes</a>
              </Button>
            </article>
          ))}
        </div>
        <Pagination page={page} total={q.data?.total ?? 0} setPage={setPage} />
      </State>
      <details className="rounded border p-4">
        <summary>Comparar dois planejamentos</summary>
        <div className="my-3 grid gap-3 sm:grid-cols-2">
          {[
            [baseRun, setBaseRun, "Referência"],
            [otherRun, setOtherRun, "Comparação"],
          ].map(([value, setter, label]) => (
            <Label key={String(label)}>
              {String(label)}
              <select
                className={inputClass}
                value={String(value)}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              >
                <option value="">Selecione na página de execuções atual</option>
                {rows(q.data?.rows)
                  .filter((r) =>
                    ["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(String(r.status)),
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {String(r.name)}
                    </option>
                  ))}
              </select>
            </Label>
          ))}
        </div>
        {baseRun && otherRun && (
          <State
            loading={comparison.isLoading}
            error={comparison.error}
            empty={!rows(comparison.data?.rows).length}
          >
            {rows(comparison.data?.rows).map((r) => (
              <article className="border-b py-3" key={r.id}>
                <strong>{String(r.sku)}</strong>
                <p>
                  Demanda: {number(r.base_demand)} → {number(r.comparison_demand)} · Sugestões:{" "}
                  {number(r.base_planned)} → {number(r.comparison_planned)}
                </p>
                <p>
                  Menor saldo sem sugestões: {number(r.base_min_balance)} →{" "}
                  {number(r.comparison_min_balance)}
                  {r.new_shortage ? " · Nova necessidade/ruptura" : ""}
                </p>
              </article>
            ))}
          </State>
        )}
      </details>
    </div>
  );
}
export function PlanningForecastPage() {
  return (
    <PlanningShell title="Planejamento · Forecast manual" permission="planning.adjust_forecast">
      {(org) => <Forecast org={org} />}
    </PlanningShell>
  );
}
function Forecast({ org }: { org: string }) {
  const api = useServerFn(queryPlanning),
    save = useServerFn(savePlanning),
    cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PlanningRow | null>(null);
  const options = useQuery({
    queryKey: ["planning", org, "options", search],
    queryFn: () =>
      api({ data: { organizationId: org, kind: "options", filters: { query: search } } }),
  });
  const q = useQuery({
    queryKey: ["planning", org, "forecasts", page],
    queryFn: () => api({ data: { organizationId: org, kind: "forecasts", page } }),
  });
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return save({
        data: {
          organizationId: org,
          kind: "forecast",
          values: {
            ...(editing ? { id: String(editing.id) } : {}),
            variant_id: String(f.variant_id),
            adjustment_date: String(f.adjustment_date),
            quantity: Number(f.quantity),
            reason: String(f.reason),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(
        editing
          ? "Ajuste atualizado; execute novo planejamento para utilizá-lo"
          : "Ajuste registrado; execute novo planejamento para utilizá-lo",
      );
      setEditing(null);
      void cache.invalidateQueries({ queryKey: ["planning", org] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <p>
        O ajuste acrescenta unidades à demanda na data necessária. Forecast base e ajuste ficam
        separados no resultado; histórico concluído não é reescrito.
      </p>
      <State loading={options.isLoading} error={options.error} empty={!options.data}>
        <form
          key={editing ? String(editing.id) : "novo"}
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <Input
            placeholder="Buscar produto / SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Label>
              Variante
              <select
                required
                name="variant_id"
                className={inputClass}
                defaultValue={editing ? String(editing.variant_id) : ""}
              >
                <option value="">Selecione</option>
                {rows(options.data?.variants).map((v) => (
                  <option key={v.id} value={v.id}>
                    {String(v.sku)} · {String(v.name)}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Data necessária
              <Input
                required
                name="adjustment_date"
                type="date"
                min={today()}
                defaultValue={editing ? String(editing.adjustment_date) : ""}
              />
            </Label>
            <Label>
              Quantidade adicional
              <Input
                required
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                defaultValue={editing ? number(editing.quantity) : undefined}
              />
            </Label>
            <Label>
              Motivo
              <Input required name="reason" defaultValue={editing ? String(editing.reason) : ""} />
            </Label>
          </div>
          <div className="flex gap-2">
            <Button disabled={mutation.isPending}>
              {editing ? "Salvar ajuste" : "Registrar ajuste"}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancelar edição
              </Button>
            ) : null}
          </div>
        </form>
      </State>
      <State loading={q.isLoading} error={q.error} empty={!rows(q.data?.rows).length}>
        {rows(q.data?.rows).map((r) => (
          <article key={r.id} className="flex flex-wrap items-center gap-3 rounded border p-3">
            <strong>{String(r.sku)}</strong>
            <p>
              {String(r.adjustment_date)} · +{number(r.quantity)} · {String(r.reason)}
            </p>
            <Button type="button" variant="outline" onClick={() => setEditing(r)}>
              Editar
            </Button>
          </article>
        ))}
        <Pagination page={page} total={q.data?.total ?? 0} setPage={setPage} />
      </State>
    </>
  );
}
export function PlanningSettingsPage() {
  return (
    <PlanningShell title="Planejamento · Parâmetros" permission="planning.run">
      {(org) => <Settings org={org} />}
    </PlanningShell>
  );
}
function Settings({ org }: { org: string }) {
  const api = useServerFn(queryPlanning),
    save = useServerFn(savePlanning),
    cache = useQueryClient();
  const [search, setSearch] = useState("");
  const options = useQuery({
    queryKey: ["planning", org, "options", search],
    queryFn: () =>
      api({ data: { organizationId: org, kind: "options", filters: { query: search } } }),
  });
  const cfg = record(options.data?.settings);
  const mutation = useMutation({
    mutationFn: ({
      kind,
      values,
    }: {
      kind: "settings" | "availability" | "variant" | "supplier_product";
      values: Record<string, string | number | boolean | null | unknown[]>;
    }) => save({ data: { organizationId: org, kind, values: values as never } }),
    onSuccess: () => {
      toast.success("Parâmetro salvo; planejamentos históricos permanecem intactos");
      void cache.invalidateQueries({ queryKey: ["planning", org] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <State loading={options.isLoading} error={options.error} empty={!options.data}>
      <form
        className="space-y-3 rounded border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          mutation.mutate({
            kind: "settings",
            values: {
              forecast_method: String(f.forecast_method),
              history_days: Number(f.history_days),
              min_history_days: Number(f.min_history_days),
              time_bucket: String(f.time_bucket),
              weighted_weights: String(f.weights).split(",").map(Number),
              lead_time_policy: String(f.lead_time_policy),
              ...(f.purchase_lead_time_default !== ""
                ? { purchase_lead_time_default: Number(f.purchase_lead_time_default) }
                : {}),
              ...(f.production_lead_time_default !== ""
                ? { production_lead_time_default: Number(f.production_lead_time_default) }
                : {}),
              demand_sources: [
                ...(f.historical ? ["HISTORICAL_SALES"] : []),
                ...(f.confirmed ? ["CONFIRMED_ORDER"] : []),
                "MANUAL_FORECAST",
                ...(f.minimum ? ["MINIMUM_STOCK"] : []),
              ],
              minimum_stock_demand: Boolean(f.minimum),
            },
          });
        }}
      >
        <h2 className="font-semibold">Método e fontes</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>
            Método
            <select
              name="forecast_method"
              className={inputClass}
              defaultValue={String(cfg.forecast_method ?? "SIMPLE_MOVING_AVERAGE")}
            >
              <option value="SIMPLE_MOVING_AVERAGE">Média móvel simples</option>
              <option value="WEIGHTED_MOVING_AVERAGE">Média móvel ponderada</option>
            </select>
          </Label>
          <Label>
            Histórico (dias)
            <select
              name="history_days"
              className={inputClass}
              defaultValue={String(cfg.history_days ?? 90)}
            >
              {[7, 30, 60, 90, 180, 365].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Label>
          <Label>
            Histórico mínimo (dias)
            <Input
              required
              name="min_history_days"
              type="number"
              min="1"
              max="365"
              defaultValue={Number(cfg.min_history_days ?? 30)}
            />
          </Label>
          <Label>
            Pesos por faixa, da mais recente para a mais antiga
            <Input
              required
              name="weights"
              defaultValue={
                Array.isArray(cfg.weighted_weights) ? cfg.weighted_weights.join(",") : "5,4,3,2,1"
              }
            />
          </Label>
          <Label>
            Exibição temporal
            <select
              name="time_bucket"
              className={inputClass}
              defaultValue={String(cfg.time_bucket ?? "WEEKLY")}
            >
              <option value="DAILY">Diária</option>
              <option value="WEEKLY">Semanal</option>
            </select>
          </Label>
          <Label>
            Lead time compra
            <select
              name="lead_time_policy"
              className={inputClass}
              defaultValue={String(cfg.lead_time_policy ?? "USE_CONFIGURED")}
            >
              <option value="USE_CONFIGURED">Configurado no fornecedor</option>
              <option value="USE_OBSERVED">Observado nos recebimentos postados</option>
              <option value="USE_MANUAL">Manual por variante</option>
            </select>
          </Label>
          <Label>
            Prazo padrão de compra (opcional, dias)
            <Input
              name="purchase_lead_time_default"
              type="number"
              min="0"
              max="365"
              defaultValue={
                cfg.purchase_lead_time_default == null ? "" : Number(cfg.purchase_lead_time_default)
              }
            />
          </Label>
          <Label>
            Prazo padrão de produção (opcional, dias)
            <Input
              name="production_lead_time_default"
              type="number"
              min="0"
              max="365"
              defaultValue={
                cfg.production_lead_time_default == null
                  ? ""
                  : Number(cfg.production_lead_time_default)
              }
            />
          </Label>
        </div>
        <Label className="flex min-h-11 items-center gap-2">
          <input
            name="historical"
            type="checkbox"
            defaultChecked={
              cfg.demand_sources == null ||
              (Array.isArray(cfg.demand_sources) && cfg.demand_sources.includes("HISTORICAL_SALES"))
            }
          />
          Vendas históricas válidas
        </Label>
        <Label className="flex min-h-11 items-center gap-2">
          <input
            name="minimum"
            type="checkbox"
            defaultChecked={cfg.minimum_stock_demand !== false}
          />
          Reposição por mínimos/alvo já cadastrados
        </Label>
        <Label className="flex min-h-11 items-center gap-2"><input name="confirmed" type="checkbox" defaultChecked={Array.isArray(cfg.demand_sources) && cfg.demand_sources.includes("CONFIRMED_ORDER")}/>Pedidos de venda aprovados (consomem forecast; reservas são descontadas uma vez)</Label>
        <Button disabled={mutation.isPending}>Salvar parâmetros</Button>
      </form>
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Localizações disponíveis para planejamento</h2>
        <p className="text-sm">
          Parceiros, trânsito, quarentena e inspeção ficam separados. Marcar uma localização não
          transfere mercadoria.
        </p>
        {rows(options.data?.locations).map((l) => (
          <label key={l.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={
                Boolean(l.included) &&
                !["PARTNER", "TRANSIT"].includes(String(l.type)) &&
                l.purpose === "NORMAL"
              }
              disabled={
                mutation.isPending ||
                ["PARTNER", "TRANSIT"].includes(String(l.type)) ||
                l.purpose !== "NORMAL"
              }
              onChange={(e) =>
                mutation.mutate({
                  kind: "availability",
                  values: { items: [{ location_id: l.id, include_in_planning: e.target.checked }] },
                })
              }
            />
            {String(l.name)} · {String(l.type)}
          </label>
        ))}
      </section>
      <Input
        placeholder="Buscar variante para configurar segurança / prazo"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <section className="space-y-3">
        <h2 className="font-semibold">Segurança e prazo de produção por variante</h2>
        {rows(options.data?.variants).map((v) => (
          <form
            key={v.id}
            className="flex flex-wrap items-end gap-3 rounded border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              mutation.mutate({
                kind: "variant",
                values: {
                  variant_id: v.id,
                  safety_stock: Number(f.safety_stock),
                  purchase_lead_time_days: String(f.purchase_lead_time_days ?? ""),
                  ...(f.production_lead_time_days !== ""
                    ? { production_lead_time_days: Number(f.production_lead_time_days) }
                    : {}),
                },
              });
            }}
          >
            <strong>{String(v.sku)}</strong>
            <Label>
              Segurança
              <Input
                name="safety_stock"
                type="number"
                min="0"
                step="0.001"
                required
                defaultValue={Number(v.safety_stock ?? 0)}
              />
            </Label>
            <Label>
              Lead time da BOM ativa (dias)
              <Input
                name="production_lead_time_days"
                type="number"
                min="0"
                max="365"
                defaultValue={
                  v.production_lead_time_days == null ? "" : Number(v.production_lead_time_days)
                }
              />
            </Label>
            <Label>
              Prazo manual de compra (dias)
              <Input
                name="purchase_lead_time_days"
                type="number"
                min="0"
                max="365"
                defaultValue={String(record(cfg.lead_time_overrides)[String(v.id)] ?? "")}
              />
            </Label>
            <Button disabled={mutation.isPending}>Salvar variante</Button>
          </form>
        ))}
      </section>
      <details className="rounded border p-4">
        <summary>Múltiplos de compra por fornecedor</summary>
        {rows(options.data?.supplier_products).map((v) => (
          <form
            key={v.id}
            className="my-3 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              mutation.mutate({
                kind: "supplier_product",
                values: { id: v.id, order_multiple: Number(f.order_multiple) },
              });
            }}
          >
            <p>
              {String(v.sku)} · {String(v.legal_name)} · MOQ {number(v.minimum_order_quantity)}
            </p>
            <Label>
              Múltiplo na unidade de compra
              <Input
                name="order_multiple"
                required
                type="number"
                min="0.001"
                step="0.001"
                defaultValue={v.order_multiple == null ? "" : Number(v.order_multiple)}
              />
            </Label>
            <Button disabled={mutation.isPending}>Salvar múltiplo</Button>
          </form>
        ))}
      </details>
    </State>
  );
}
