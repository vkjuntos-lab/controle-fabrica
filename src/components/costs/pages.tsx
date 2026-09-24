import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  queryCosts,
  calculateCost,
  actCostVersion,
  saveCostInput,
} from "@/lib/costs/costs.functions";
import { useOrganization } from "@/lib/org/org-context";
import { labels, money, type CostRow, type CostCalculation } from "@/lib/costs/types";
import type { Json } from "@/integrations/supabase/types";
import { CostShell, QueryState, Pages, Breakdown, asRows, asRecord, inputClass } from "./shared";
const today = () => new Date().toISOString().slice(0, 10);
export function CostDashboard() {
  return (
    <CostShell title="Custos · Dashboard" permission="costs.read">
      {(org) => <Dashboard organizationId={org} />}
    </CostShell>
  );
}
function Dashboard({ organizationId }: { organizationId: string }) {
  const fetch = useServerFn(queryCosts);
  const q = useQuery({
    queryKey: ["costs", "dashboard", organizationId],
    queryFn: () => fetch({ data: { organizationId, kind: "dashboard" } }),
  });
  return (
    <QueryState loading={q.isPending} error={q.error} empty={!q.data}>
      {q.data ? (
        <>
          <p className="text-muted-foreground">
            Custo industrial em BRL. Média simples das variantes com custo vigente; não é valor do
            estoque nem lucro de caixa.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Custo unitário médio", money(q.data.average_unit_cost)],
              ["Produtos sem custo", q.data.products_without_cost],
              ["Materiais sem custo", q.data.materials_without_cost],
              ["Cálculos incompletos", q.data.incomplete_calculations],
              ["Ordens acima do padrão", q.data.actual_above_standard],
              [
                "Custos indiretos",
                q.data.overhead_configured ? "Configurados" : "Não configurados",
              ],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardContent className="pt-6">
                  <p className="text-sm">{String(label)}</p>
                  <strong className="text-2xl">{String(value ?? "—")}</strong>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button asChild variant="outline">
            <a href="/custos/versoes">Ver pendências e memória dos cálculos</a>
          </Button>
        </>
      ) : null}
    </QueryState>
  );
}
export function CostVersionsPage() {
  return (
    <CostShell title="Custos · Versões e pendências" permission="costs.read">
      {(org) => <Versions organizationId={org} />}
    </CostShell>
  );
}
function Versions({ organizationId }: { organizationId: string }) {
  const fetch = useServerFn(queryCosts);
  const act = useServerFn(actCostVersion);
  const cache = useQueryClient();
  const { hasPermission } = useOrganization();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{
    id: string;
    action: "approve" | "publish" | "archive";
  } | null>(null);
  useEffect(() => setPage(1), [organizationId, search]);
  const q = useQuery({
    queryKey: ["costs", "versions", organizationId, search, page],
    queryFn: () =>
      fetch({ data: { organizationId, kind: "versions", filters: { query: search }, page } }),
  });
  const mutation = useMutation({
    mutationFn: () => act({ data: { organizationId, ...confirm! } }),
    onSuccess: () => {
      toast.success("Versão atualizada");
      setConfirm(null);
      void cache.invalidateQueries({ queryKey: ["costs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <Input
        placeholder="Produto ou SKU"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <QueryState loading={q.isPending} error={q.error} empty={!q.data?.rows?.length}>
        {q.data?.rows?.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                {String(r.product_name)} · {String(r.sku)} · v{String(r.version)}
              </CardTitle>
              <p>
                {labels[String(r.costing_method)]} · Vigência {String(r.effective_from)}
                {r.effective_to ? ` até ${r.effective_to} (exclusivo)` : ""} ·{" "}
                <Badge>{labels[String(r.status)]}</Badge>{" "}
                <Badge>{labels[String(r.completeness)]}</Badge>
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.recalculation_available ? (
                <p className="text-amber-700">
                  Custo de material alterado: novo cálculo disponível. Esta versão permanece
                  preservada.
                </p>
              ) : null}
              {r.previous_cost != null && r.total_unit_cost != null ? (
                <p>
                  Anterior: {money(r.previous_cost)} · Variação:{" "}
                  {money(Number(r.total_unit_cost) - Number(r.previous_cost))} (
                  {Number(r.previous_cost) > 0
                    ? `${((Number(r.total_unit_cost) / Number(r.previous_cost) - 1) * 100).toFixed(2)}%`
                    : "base zero"}
                  )
                </p>
              ) : null}
              <Breakdown row={r} />
              {r.status === "DRAFT" ? (
                <div className="flex flex-wrap gap-2">
                  {hasPermission("costs.approve") && r.completeness === "COMPLETE" ? (
                    <Button onClick={() => setConfirm({ id: r.id, action: "approve" })}>
                      {r.approved_at ? "Reaprovar" : "Aprovar"}
                    </Button>
                  ) : null}
                  {hasPermission("costs.publish") &&
                  r.approved_at &&
                  r.costing_method === "STANDARD" ? (
                    <Button onClick={() => setConfirm({ id: r.id, action: "publish" })}>
                      Publicar vigência
                    </Button>
                  ) : null}
                  {hasPermission("costs.publish") ? (
                    <Button
                      variant="outline"
                      onClick={() => setConfirm({ id: r.id, action: "archive" })}
                    >
                      Arquivar rascunho
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </QueryState>
      <Pages page={page} total={q.data?.total ?? 0} onPage={setPage} />
      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar{" "}
              {confirm?.action === "publish"
                ? "publicação"
                : confirm?.action === "approve"
                  ? "aprovação"
                  : "arquivamento"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A ação será auditada. Publicar substitui a versão vigente a partir da data informada,
              preservando snapshots históricos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export function CostCalculatePage({ simulation = false }: { simulation?: boolean }) {
  return (
    <CostShell
      title={simulation ? "Custos · Simulador" : "Custos · Calcular"}
      permission={simulation ? "costs.simulate" : "costs.calculate"}
    >
      {(org) => <Calculation organizationId={org} simulation={simulation} />}
    </CostShell>
  );
}
function Calculation({
  organizationId,
  simulation,
}: {
  organizationId: string;
  simulation: boolean;
}) {
  const fetch = useServerFn(queryCosts);
  const calculate = useServerFn(calculateCost);
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState(today());
  const [order, setOrder] = useState("");
  const [result, setResult] = useState<CostCalculation | null>(null);
  const options = useQuery({
    queryKey: ["costs", "options", organizationId, search],
    queryFn: () => fetch({ data: { organizationId, kind: "options", filters: { query: search } } }),
  });
  const mutation = useMutation({
    mutationFn: (values: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(values));
      const overrides: Record<string, Json> = {};
      for (const key of [
        "other_cost",
        "other_reason",
        ...(simulation ? ["labor_multiplier", "overhead_rate", "scrap_percentage"] : []),
      ])
        if (f[key] !== "")
          overrides[key] = key === "other_reason" ? String(f[key]) : Number(f[key]);
      if (simulation && f.material_id && f.unit_cost !== "")
        overrides.materials = { [String(f.material_id)]: Number(f.unit_cost) };
      return calculate({
        data: {
          organizationId,
          simulation,
          values: {
            variants: selected,
            effective_from: date,
            production_order_id: order || undefined,
            overrides,
          },
        },
      });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(
        simulation
          ? "Simulação concluída sem alterar custos oficiais"
          : "Cálculo registrado para revisão",
      );
      if (!simulation) void cache.invalidateQueries({ queryKey: ["costs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {simulation
          ? "Alterações temporárias não publicam versões nem mudam preços."
          : "Calcule, revise, aprove e publique. Custos incompletos não podem ser publicados."}{" "}
        Custo real usa produção boa e apontamentos válidos da ordem concluída.
      </p>
      <QueryState loading={options.isPending} error={options.error} empty={!options.data}>
        <form
          className="space-y-4 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <Input
            placeholder="Buscar produto ou SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-60 space-y-2 overflow-auto">
            {asRows(options.data?.variants).map((v) => (
              <label key={v.id} className="flex min-h-11 items-center gap-3 rounded border p-2">
                <input
                  type="checkbox"
                  checked={selected.includes(v.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked ? [...ids, v.id] : ids.filter((id) => id !== v.id),
                    )
                  }
                />
                {String(v.sku)} · {String(v.name)}
              </label>
            ))}
          </div>
          <p>{selected.length} variantes selecionadas (máximo 100)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Vigência/data de custeio
              <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Método
              <select
                className={inputClass}
                value={order}
                onChange={(e) => {
                  setOrder(e.target.value);
                  const o = asRows(options.data?.orders).find((x) => x.id === e.target.value);
                  if (o) setSelected([String(o.product_variant_id)]);
                }}
              >
                <option value="">Padrão — BOM</option>
                {asRows(options.data?.orders)
                  .filter((o) => o.status === "COMPLETED")
                  .map((o) => (
                    <option value={o.id} key={o.id}>
                      Real — {String(o.code)}
                    </option>
                  ))}
              </select>
            </label>
            {simulation ? (
              <>
                <label>
                  Material a simular
                  <select name="material_id" className={inputClass}>
                    <option value="">Sem alteração</option>
                    {asRows(options.data?.variants).map((v) => (
                      <option key={v.id} value={v.id}>
                        {String(v.sku)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Novo custo na unidade cadastrada
                  <Input name="unit_cost" type="number" min="0" step="0.000001" />
                </label>
                <label>
                  Multiplicador de mão de obra
                  <Input name="labor_multiplier" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Nova taxa de overhead
                  <Input name="overhead_rate" type="number" min="0" step="0.000001" />
                </label>
                <label>
                  Perda prevista (%)
                  <Input name="scrap_percentage" type="number" min="0" max="99.999" step="0.001" />
                </label>
              </>
            ) : null}
            <label>
              Outros custos {order ? "totais da ordem" : "por unidade"}
              <Input name="other_cost" type="number" min="0" step="0.000001" defaultValue="0" />
            </label>
            <label>
              Origem/descrição dos outros custos
              <Input name="other_reason" />
            </label>
          </div>
          <Button disabled={mutation.isPending || selected.length === 0 || selected.length > 100}>
            {mutation.isPending ? "Calculando..." : simulation ? "Simular" : "Calcular rascunhos"}
          </Button>
        </form>
      </QueryState>
      {result?.results.map((r, i) => (
        <Card key={r.id ?? i}>
          <CardHeader>
            <CardTitle>
              {String(r.variant_id)} · {labels[String(r.completeness)]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Breakdown row={r} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  source?: string;
  optional?: boolean;
};
const configs: Record<
  string,
  {
    title: string;
    kind: "material" | "labor" | "routing" | "labor_entry" | "overhead" | "conversion";
    query: "materials" | "labor" | "routing" | "labor_entries" | "overhead";
    permission: string;
    fields: Field[];
  }
> = {
  materials: {
    title: "Custo-base de material",
    kind: "material",
    query: "materials",
    permission: "costs.manage_material_cost",
    fields: [
      { key: "variant_id", label: "Material / variante", source: "variants" },
      { key: "unit_of_measure_id", label: "Unidade do custo", source: "units" },
      { key: "unit_cost", label: "Custo por unidade (BRL)", type: "number" },
    ],
  },
  labor: {
    title: "Taxa de mão de obra",
    kind: "labor",
    query: "labor",
    permission: "costs.manage_labor_rate",
    fields: [
      { key: "activity", label: "Atividade" },
      { key: "hourly_cost", label: "Custo-hora (BRL)", type: "number" },
    ],
  },
  routing: {
    title: "Tempo padrão da BOM",
    kind: "routing",
    query: "routing",
    permission: "costs.manage_labor_rate",
    fields: [
      { key: "bom_id", label: "BOM", source: "boms" },
      { key: "activity", label: "Atividade (mesmo nome da taxa)" },
      { key: "standard_minutes", label: "Minutos por unidade", type: "number" },
    ],
  },
  labor_entries: {
    title: "Apontamento de mão de obra",
    kind: "labor_entry",
    query: "labor_entries",
    permission: "costs.manage_labor_rate",
    fields: [
      { key: "production_order_id", label: "Ordem", source: "orders" },
      { key: "activity", label: "Atividade" },
      { key: "minutes", label: "Minutos reais totais", type: "number" },
      { key: "occurred_at", label: "Data e hora", type: "datetime-local" },
    ],
  },
  overhead: {
    title: "Regra de custo indireto",
    kind: "overhead",
    query: "overhead",
    permission: "costs.manage_overhead",
    fields: [
      { key: "name", label: "Nome" },
      {
        key: "method",
        label: "Método",
        options: ["PER_UNIT", "PERCENTAGE_OF_DIRECT_COST", "LABOR_HOUR"],
      },
      { key: "rate", label: "Taxa (R$/un, % ou R$/hora, conforme método)", type: "number" },
      {
        key: "financial_category_id",
        label: "Categoria financeira",
        source: "categories",
        optional: true,
      },
      { key: "cost_center_id", label: "Centro de custo", source: "centers", optional: true },
    ],
  },
  conversion: {
    title: "Conversão oficial de unidade",
    kind: "conversion",
    query: "materials",
    permission: "costs.manage_material_cost",
    fields: [
      { key: "from_unit_id", label: "De unidade", source: "units" },
      { key: "to_unit_id", label: "Para unidade", source: "units" },
      {
        key: "factor",
        label: "Fator: 1 unidade de origem equivale a quantas de destino?",
        type: "number",
      },
    ],
  },
};
export function CostInputsPage() {
  return (
    <CostShell title="Custos · Configurações" permission="costs.read">
      {(org) => <Inputs organizationId={org} />}
    </CostShell>
  );
}
function Inputs({ organizationId }: { organizationId: string }) {
  const [kind, setKind] = useState("materials");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { hasPermission } = useOrganization();
  const fetch = useServerFn(queryCosts);
  const save = useServerFn(saveCostInput);
  const cache = useQueryClient();
  const config = configs[kind];
  const options = useQuery({
    queryKey: ["costs", "options", organizationId, search],
    queryFn: () => fetch({ data: { organizationId, kind: "options", filters: { query: search } } }),
  });
  const q = useQuery({
    queryKey: ["costs", config.query, organizationId, page],
    queryFn: () => fetch({ data: { organizationId, kind: config.query, page } }),
  });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const raw = Object.fromEntries(new FormData(form));
      const values: Record<string, Json> = {};
      for (const [k, v] of Object.entries(raw))
        if (v !== "")
          values[k] = config.fields.some((f) => f.key === k && f.type === "number")
            ? Number(v)
            : k === "occurred_at"
              ? new Date(String(v)).toISOString()
              : String(v);
      if (config.kind === "labor_entry") values.idempotency_key = key;
      return save({ data: { organizationId, kind: config.kind, values } });
    },
    onSuccess: () => {
      toast.success("Configuração registrada");
      setKey(crypto.randomUUID());
      void cache.invalidateQueries({ queryKey: ["costs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <select
        className={inputClass}
        value={kind}
        onChange={(e) => {
          setKind(e.target.value);
          setPage(1);
        }}
      >
        {Object.entries(configs).map(([k, v]) => (
          <option key={k} value={k}>
            {v.title}
          </option>
        ))}
      </select>
      <Input
        placeholder="Buscar variante nas opções"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {hasPermission(config.permission) ? (
        <form
          key={kind}
          className="space-y-4 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <h2 className="font-semibold">{config.title}</h2>
          <p className="text-sm text-muted-foreground">
            Nova configuração preserva versões anteriores. Informe valores reais e sua referência.
            Não altera custos publicados automaticamente.
          </p>
          <QueryState loading={options.isPending} error={options.error} empty={!options.data}>
            <div className="grid gap-3 sm:grid-cols-2">
              {config.fields.map((f) => (
                <label key={f.key}>
                  {f.label}
                  {f.source || f.options ? (
                    <select required={!f.optional} className={inputClass} name={f.key}>
                      <option value="">Selecione</option>
                      {f.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                      {f.source
                        ? asRows(options.data?.[f.source]).map((o) => (
                            <option key={o.id} value={o.id}>
                              {String(o.sku ?? o.code ?? o.name)} {o.sku ? String(o.name) : ""}
                            </option>
                          ))
                        : null}
                    </select>
                  ) : (
                    <Input
                      required={!f.optional}
                      name={f.key}
                      type={f.type ?? "text"}
                      min="0"
                      step="0.000001"
                    />
                  )}
                </label>
              ))}
              {!["labor_entry", "conversion"].includes(kind) ? (
                <label>
                  Vigência inicial
                  <Input name="effective_from" type="date" required defaultValue={today()} />
                </label>
              ) : null}
              <label>
                Motivo / referência
                <Input name="reason" required minLength={1} />
              </label>
            </div>
            <Button disabled={mutation.isPending}>Registrar</Button>
          </QueryState>
        </form>
      ) : (
        <p>Sem permissão para alterar esta configuração.</p>
      )}
      {kind !== "conversion" ? (
        <QueryState loading={q.isPending} error={q.error} empty={!q.data?.rows?.length}>
          <div className="space-y-2">
            {q.data?.rows?.map((r) => (
              <details className="rounded border p-3" key={r.id}>
                <summary className="cursor-pointer">
                  {String(r.activity ?? r.name ?? r.variant_id ?? r.production_order_id ?? r.id)} ·{" "}
                  {String(r.effective_from ?? r.occurred_at ?? "")} ·{" "}
                  {r.unit_cost != null
                    ? money(r.unit_cost)
                    : r.hourly_cost != null
                      ? money(r.hourly_cost)
                      : r.rate != null
                        ? String(r.rate)
                        : String(r.standard_minutes ?? r.minutes ?? "")}
                </summary>
                <pre className="overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(r, null, 2)}
                </pre>
              </details>
            ))}
          </div>
          <Pages page={page} total={q.data?.total ?? 0} onPage={setPage} />
        </QueryState>
      ) : null}
    </div>
  );
}
export function CostImpactPage({ comparison = false }: { comparison?: boolean }) {
  return (
    <CostShell
      title={comparison ? "Custos · Padrão × real" : "Custos · Impacto de material"}
      permission={comparison ? "costs.read" : "costs.simulate"}
    >
      {(org) => <Impact organizationId={org} comparison={comparison} />}
    </CostShell>
  );
}
function Impact({ organizationId, comparison }: { organizationId: string; comparison: boolean }) {
  const fetch = useServerFn(queryCosts);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const options = useQuery({
    queryKey: ["costs", "options", organizationId, search],
    queryFn: () => fetch({ data: { organizationId, kind: "options", filters: { query: search } } }),
    enabled: !comparison,
  });
  const q = useQuery({
    queryKey: ["costs", comparison ? "comparison" : "impact", organizationId, filters, page],
    queryFn: () =>
      fetch({
        data: { organizationId, kind: comparison ? "comparison" : "impact", filters, page },
      }),
    enabled: comparison || Boolean(filters.material_id),
  });
  return (
    <div className="space-y-4">
      {!comparison ? (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
            setPage(1);
          }}
        >
          <Input
            placeholder="Buscar material"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select required name="material_id" className={inputClass}>
            <option value="">Material</option>
            {asRows(options.data?.variants).map((v) => (
              <option key={v.id} value={v.id}>
                {String(v.sku)} · {String(v.name)}
              </option>
            ))}
          </select>
          <Label>Novo custo na unidade da versão do material</Label>
          <Input required name="unit_cost" type="number" min="0" step="0.000001" />
          <Button>Simular impacto nos produtos</Button>
        </form>
      ) : (
        <p>
          Custo real é dividido pela produção boa. Ausência de padrão não é exibida como custo zero.
        </p>
      )}
      {comparison || filters.material_id ? (
        <QueryState loading={q.isPending} error={q.error} empty={!q.data?.rows?.length}>
          {q.data?.rows?.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle>
                  {String(r.sku)} · {String(r.product_name ?? r.production_order)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {comparison ? (
                  <div className="space-y-2">
                    <p>
                      Padrão: {money(r.standard_cost)} · Real: {money(r.actual_cost)} · Diferença:{" "}
                      {money(r.difference)} (
                      {r.difference_percent == null
                        ? "—"
                        : `${Number(r.difference_percent).toFixed(2)}%`}
                      )
                    </p>
                    {["material", "loss", "labor", "overhead"].map((k) => (
                      <p key={k}>
                        {
                          labels[
                            k === "material"
                              ? "material_cost"
                              : k === "loss"
                                ? "loss_cost"
                                : `${k}_cost`
                          ]
                        }
                        : {money(r[`standard_${k}`])} → {money(r[`actual_${k}`])}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p>
                      Publicado: {money(r.current_cost)} · Simulado:{" "}
                      {money(asRecord(r.simulation).total_unit_cost)} · Variação:{" "}
                      {r.current_cost != null && asRecord(r.simulation).total_unit_cost != null
                        ? money(
                            Number(asRecord(r.simulation).total_unit_cost) - Number(r.current_cost),
                          )
                        : "Não disponível"}
                    </p>
                    <Breakdown row={asRecord(r.simulation) as CostRow} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Pages page={page} total={q.data?.total ?? 0} onPage={setPage} />
        </QueryState>
      ) : null}
    </div>
  );
}
