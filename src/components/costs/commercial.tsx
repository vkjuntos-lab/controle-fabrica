import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganization } from "@/lib/org/org-context";
import {
  queryCosts,
  simulatePricing,
  publishPrice,
  saveCostInput,
  captureProfitability,
} from "@/lib/costs/costs.functions";
import { money, type CostRow } from "@/lib/costs/types";
import { exportPartnerCsv } from "@/lib/partners/export";
import { CostShell, QueryState, Pages, Issues, asRows, inputClass } from "./shared";
const today = () => new Date().toISOString().slice(0, 10);
export function PricingPage() {
  return (
    <CostShell title="Precificação" permission="pricing.read">
      {(org) => <Pricing org={org} />}
    </CostShell>
  );
}
function Pricing({ org }: { org: string }) {
  const { hasPermission } = useOrganization();
  const api = useServerFn(queryCosts),
    simulate = useServerFn(simulatePricing),
    publish = useServerFn(publishPrice),
    save = useServerFn(saveCostInput);
  const cache = useQueryClient();
  const [f, set] = useState<Record<string, string>>({
    mode: "MARKUP",
    cost: "",
    markup: "",
    price: "",
    target_margin_percent: "",
    commission_percent: "0",
    fee_percent: "0",
    tax_percent: "0",
    discount_percent: "0",
    freight: "0",
    other: "0",
  });
  const [p, setP] = useState({
    price_table_id: "",
    variant_id: "",
    unit_price: "",
    valid_from: today(),
    minimum_price: "",
  });
  const [search, setSearch] = useState("");
  const options = useQuery({
    queryKey: ["costs", org, "pricing_options", search],
    queryFn: () =>
      api({ data: { organizationId: org, kind: "pricing_options", filters: { query: search } } }),
  });
  const tables = useQuery({
    queryKey: ["costs", org, "price_tables"],
    queryFn: () => api({ data: { organizationId: org, kind: "price_tables" } }),
  });
  const simulation = useMutation({
    mutationFn: () =>
      simulate({
        data: {
          organizationId: org,
          values: Object.fromEntries(
            Object.entries(f)
              .filter(([, v]) => v !== "")
              .map(([k, v]) => [k, k === "mode" ? v : Number(v)]),
          ),
        },
      }),
    onError: (e) => toast.error(e.message),
  });
  const publication = useMutation({
    mutationFn: () =>
      publish({
        data: {
          organizationId: org,
          values: {
            price_table_id: p.price_table_id,
            variant_id: p.variant_id,
            unit_price: Number(p.unit_price),
            valid_from: p.valid_from,
            ...(p.minimum_price !== "" ? { minimum_price: Number(p.minimum_price) } : {}),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Nova vigência de preço publicada");
      void cache.invalidateQueries({ queryKey: ["costs", org] });
      void cache.invalidateQueries({ queryKey: ["price-tables"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const [rule, setRule] = useState<Record<string, string>>({
    channel: "MARKETPLACE",
    effective_from: today(),
    commission_percent: "0",
    tax_percent: "0",
    fee_percent: "0",
    freight_per_unit: "0",
    other_per_unit: "0",
    reason: "",
    store_id: "",
    variant_id: "",
  });
  const [threshold, setThreshold] = useState("");
  const config = useMutation({
    mutationFn: (kind: "variable_rule" | "settings") =>
      save({
        data: {
          organizationId: org,
          kind,
          values:
            kind === "settings"
              ? { low_margin_percent: threshold === "" ? null : Number(threshold) }
              : Object.fromEntries(Object.entries(rule).filter(([, v]) => v !== "")),
        },
      }),
    onSuccess: () => {
      toast.success("Configuração registrada");
      void cache.invalidateQueries({ queryKey: ["costs", org] });
    },
    onError: (e) => toast.error(e.message),
  });
  const rules = useQuery({
    queryKey: ["costs", org, "variable_rules"],
    queryFn: () => api({ data: { organizationId: org, kind: "variable_rules" } }),
  });
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Custo não é preço. Markup é preço ÷ custo; margem bruta é (receita − COGS) ÷ receita.
        Simulações não alteram preços oficiais nem marketplaces.
      </p>
      {hasPermission("pricing.simulate") && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            simulation.mutate();
          }}
        >
          <h2 className="font-semibold">Simulador</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Label>
              Método
              <select
                className={inputClass}
                value={f.mode}
                onChange={(e) => set({ ...f, mode: e.target.value })}
              >
                <option value="MARKUP">Markup multiplicador</option>
                <option value="PRICE">Preço informado</option>
                <option value="TARGET_MARGIN">Margem de contribuição desejada</option>
              </select>
            </Label>
            {[
              ["cost", "Custo unitário R$"],
              ...(f.mode === "MARKUP"
                ? [["markup", "Markup (ex.: 2,5)"]]
                : f.mode === "PRICE"
                  ? [["price", "Preço R$"]]
                  : [["target_margin_percent", "Contribuição desejada %"]]),
              ["commission_percent", "Comissão %"],
              ["fee_percent", "Taxas %"],
              ["tax_percent", "Imposto estimado %"],
              ["discount_percent", "Desconto %"],
              ["freight", "Frete subsidiado R$/un"],
              ["other", "Outras despesas R$/un"],
            ].map(([key, label]) => (
              <Label key={key}>
                {label}
                <Input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={f[key]}
                  onChange={(e) => set({ ...f, [key]: e.target.value })}
                />
              </Label>
            ))}
          </div>
          <Button disabled={simulation.isPending}>Simular</Button>
          {simulation.error && (
            <p role="alert" className="text-destructive">
              {simulation.error.message}
            </p>
          )}
          {simulation.data && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["suggested_price", "Preço sugerido"],
                ["gross_margin", "Margem bruta R$"],
                ["contribution", "Contribuição R$"],
                ["gross_margin_percent", "Margem bruta %"],
                ["contribution_margin_percent", "Contribuição %"],
                ["markup", "Markup multiplicador"],
              ].map(([key, label]) => (
                <div key={key}>
                  <p>{label}</p>
                  <strong>
                    {key.endsWith("percent") || key === "markup"
                      ? Number(simulation.data[key]).toFixed(2)
                      : money(simulation.data[key])}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
      {hasPermission("pricing.manage") && hasPermission("pricing.approve") && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            publication.mutate();
          }}
        >
          <h2 className="font-semibold">Publicar nova vigência</h2>
          <p className="text-sm">
            Reutiliza as tabelas existentes. A publicação encerra a vigência anterior, preservando
            seu valor.{" "}
            <a className="underline" href="/reconciliacao/tabelas-preco">
              Gerenciar tabelas de preço
            </a>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label>
              Tabela
              <select
                required
                className={inputClass}
                value={p.price_table_id}
                onChange={(e) => setP({ ...p, price_table_id: e.target.value })}
              >
                <option value="">Selecione</option>
                {asRows(tables.data?.rows).map((r) => (
                  <option key={r.id} value={r.id}>
                    {String(r.name)} · {String(r.channel)}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Buscar SKU
              <Input value={search} onChange={(e) => setSearch(e.target.value)} />
            </Label>
            <Label>
              Variante
              <select
                required
                className={inputClass}
                value={p.variant_id}
                onChange={(e) => setP({ ...p, variant_id: e.target.value })}
              >
                <option value="">Selecione</option>
                {asRows(options.data?.variants).map((r) => (
                  <option key={r.id} value={r.id}>
                    {String(r.sku)} · {String(r.product_name)}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Preço R$
              <Input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={p.unit_price}
                onChange={(e) => setP({ ...p, unit_price: e.target.value })}
              />
            </Label>
            <Label>
              Vigência inicial
              <Input
                required
                type="date"
                value={p.valid_from}
                onChange={(e) => setP({ ...p, valid_from: e.target.value })}
              />
            </Label>
            <Label>
              Preço mínimo informativo (opcional)
              <Input
                type="number"
                min="0"
                step="0.01"
                value={p.minimum_price}
                onChange={(e) => setP({ ...p, minimum_price: e.target.value })}
              />
            </Label>
          </div>
          {(options.error || tables.error) && (
            <p role="alert" className="text-destructive">
              {(options.error || tables.error)?.message}
            </p>
          )}
          <Button disabled={publication.isPending}>Aprovar e publicar preço</Button>
        </form>
      )}
      {hasPermission("pricing.manage") && (
        <details className="rounded border p-4">
          <summary className="cursor-pointer font-semibold">
            Despesas variáveis estimadas e alerta de margem
          </summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              config.mutate("variable_rule");
            }}
          >
            <p className="text-sm">
              Valores configurados são estimativas explícitas. Valores efetivamente informados da
              venda têm prioridade. Frete e outras despesas são por unidade; percentuais incidem
              sobre a receita.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label>
                Canal
                <select
                  className={inputClass}
                  value={rule.channel}
                  onChange={(e) => setRule({ ...rule, channel: e.target.value })}
                >
                  {["MARKETPLACE", "PARTNER", "RETAIL", "WHOLESALE", "OWN_STORE"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Label>
              {[
                ["effective_from", "Vigência", "date"],
                ["store_id", "ID da loja (opcional)", "text"],
                ["variant_id", "ID da variante (opcional)", "text"],
                ["commission_percent", "Comissão %", "number"],
                ["fee_percent", "Taxas %", "number"],
                ["tax_percent", "Impostos %", "number"],
                ["freight_per_unit", "Frete R$/un", "number"],
                ["other_per_unit", "Outras despesas R$/un", "number"],
                ["reason", "Motivo / origem", "text"],
              ].map(([key, label, type]) => (
                <Label key={key}>
                  {label}
                  <Input
                    type={type}
                    step="any"
                    required={!key.endsWith("_id")}
                    value={rule[key]}
                    onChange={(e) => setRule({ ...rule, [key]: e.target.value })}
                  />
                </Label>
              ))}
            </div>
            <Button disabled={config.isPending}>Registrar regra</Button>
          </form>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              config.mutate("settings");
            }}
          >
            <Label>
              Alertar contribuição abaixo de % (vazio desativa)
              <Input
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </Label>
            <Button disabled={config.isPending}>Salvar limite</Button>
          </form>
          <QueryState
            loading={rules.isLoading}
            error={rules.error}
            empty={!asRows(rules.data?.rows).length}
          >
            {asRows(rules.data?.rows).map((r) => (
              <details key={r.id} className="mt-3">
                <summary>
                  {String(r.channel)} · {String(r.effective_from)}
                </summary>
                <pre className="overflow-auto text-xs">{JSON.stringify(r, null, 2)}</pre>
              </details>
            ))}
          </QueryState>
        </details>
      )}
    </div>
  );
}
export function ProfitabilityPage() {
  return (
    <CostShell title="Rentabilidade" permission="profitability.read">
      {(org) => <Profitability org={org} />}
    </CostShell>
  );
}
function Profitability({ org }: { org: string }) {
  const { hasPermission } = useOrganization();
  const api = useServerFn(queryCosts),
    capture = useServerFn(captureProfitability),
    save = useServerFn(saveCostInput),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [mode, setMode] = useState<"profitability" | "sales">("profitability");
  const [filters, setFilters] = useState<Record<string, string>>({
    group: "product",
    from: today().slice(0, 7) + "-01",
    to: today(),
    sort: "contribution",
  });
  const [period, setPeriod] = useState("1"),
    [selected, setSelected] = useState("");
  const [exporting, setExporting] = useState(false);
  const query = useQuery({
    queryKey: ["costs", org, mode, filters, page],
    queryFn: () => api({ data: { organizationId: org, kind: mode, filters, page } }),
  });
  const detail = useQuery({
    queryKey: ["costs", org, "snapshot", selected],
    queryFn: () =>
      api({ data: { organizationId: org, kind: "snapshot", filters: { id: selected } } }),
    enabled: !!selected,
  });
  const refresh = useMutation({
    mutationFn: (sales: string[]) => capture({ data: { organizationId: org, sales } }),
    onSuccess: () => {
      toast.success("Snapshots processados; consulte as pendências por venda");
      void cache.invalidateQueries({ queryKey: ["costs", org] });
    },
    onError: (e) => toast.error(e.message),
  });
  const [economics, setEconomics] = useState<Record<string, string>>({
    sale_id: "",
    commission_amount: "",
    company_shipping_amount: "",
    company_discount_amount: "",
    marketplace_discount_amount: "",
    tax_amount: "",
    other_amount: "",
    source_reference: "",
  });
  const record = useMutation({
    mutationFn: () => save({ data: { organizationId: org, kind: "economics", values: economics } }),
    onSuccess: () => {
      toast.success("Valores efetivos registrados. Processe o snapshot da venda.");
      void cache.invalidateQueries({ queryKey: ["costs", org] });
    },
    onError: (e) => toast.error(e.message),
  });
  function filter(k: string, v: string) {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  }
  async function exportCsv() {
    setExporting(true);
    try {
      let all: CostRow[] = [];
      let current = 1,
        total = 1;
      while (all.length < total) {
        const res = await api({
          data: {
            organizationId: org,
            kind: "profitability",
            filters,
            page: current,
            export: true,
          },
        });
        const rows = asRows(res.rows);
        all = all.concat(rows);
        total = Number(res.total ?? 0);
        if (!rows.length) break;
        current++;
      }
      exportPartnerCsv("rentabilidade.csv", all);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na exportação");
    } finally {
      setExporting(false);
    }
  }
  function drill(r: CostRow) {
    const group = filters.group;
    if (group === "sale") {
      setSelected(r.id);
      return;
    }
    const keys: Record<string, string> = {
      product: "product_id",
      variant: "variant_id",
      store: "store_id",
      partner: "partner_id",
      marketplace: "marketplace",
    };
    setFilters({
      ...filters,
      [keys[group]]: String(r.id ?? ""),
      group: group === "product" ? "variant" : "sale",
    });
    setPage(1);
  }
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">
        Rentabilidade é independente de recebimento e saldo bancário. Nas operações de parceiros, a
        receita é o valor cobrável da fábrica. Valores ausentes permanecem pendentes; moedas
        diferentes não são somadas.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={mode === "profitability" ? "default" : "outline"}
          onClick={() => {
            setMode("profitability");
            setPage(1);
          }}
        >
          Relatório
        </Button>
        <Button
          variant={mode === "sales" ? "default" : "outline"}
          onClick={() => {
            setMode("sales");
            setPage(1);
          }}
        >
          Vendas e snapshots
        </Button>
        {mode === "profitability" && hasPermission("profitability.export") && (
          <Button
            variant="outline"
            disabled={exporting || query.isLoading}
            onClick={() => void exportCsv()}
          >
            {exporting ? "Exportando…" : "Exportar CSV filtrado"}
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label>
          Busca produto / SKU / loja / parceiro
          <Input value={filters.query ?? ""} onChange={(e) => filter("query", e.target.value)} />
        </Label>
        {mode === "profitability" && (
          <>
            <Label>
              Período
              <select
                className={inputClass}
                value={period}
                onChange={(e) => {
                  const p = e.target.value;
                  setPeriod(p);
                  if (p !== "custom") {
                    const start = new Date();
                    start.setDate(1);
                    start.setMonth(start.getMonth() - Number(p) + 1);
                    setFilters({ ...filters, from: start.toISOString().slice(0, 10), to: today() });
                    setPage(1);
                  }
                }}
              >
                {[1, 3, 6, 9, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} mês(es)
                  </option>
                ))}
                <option value="custom">Personalizado</option>
              </select>
            </Label>
            {["from", "to"].map((k) => (
              <Label key={k}>
                {k === "from" ? "De" : "Até"}
                <Input
                  type="date"
                  value={filters[k]}
                  onChange={(e) => {
                    setPeriod("custom");
                    filter(k, e.target.value);
                  }}
                />
              </Label>
            ))}
            <Label>
              Agrupar
              <select
                className={inputClass}
                value={filters.group}
                onChange={(e) => filter("group", e.target.value)}
              >
                {[
                  ["product", "Produto"],
                  ["variant", "Variante"],
                  ["marketplace", "Marketplace"],
                  ["store", "Loja"],
                  ["partner", "Parceiro"],
                  ["sale", "Venda"],
                ].map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Ordenar
              <select
                className={inputClass}
                value={filters.sort}
                onChange={(e) => filter("sort", e.target.value)}
              >
                {[
                  ["contribution", "Contribuição total"],
                  ["unit_contribution", "Contribuição unitária"],
                  ["margin", "Margem %"],
                  ["units", "Unidades"],
                ].map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Label>
          </>
        )}
      </div>
      {mode === "profitability" && (
        <details>
          <summary className="cursor-pointer">Filtros específicos</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["product_id", "ID Produto"],
              ["category_id", "ID Categoria"],
              ["variant_id", "ID Variante"],
              ["store_id", "ID Loja"],
              ["partner_id", "ID Parceiro"],
              ["marketplace", "Marketplace"],
            ].map(([k, l]) => (
              <Label key={k}>
                {l}
                <Input value={filters[k] ?? ""} onChange={(e) => filter(k, e.target.value)} />
              </Label>
            ))}
            <Label>
              Canal
              <select
                className={inputClass}
                value={filters.channel ?? ""}
                onChange={(e) => filter("channel", e.target.value)}
              >
                <option value="">Todos</option>
                <option value="PARTNER">Parceiro</option>
                <option value="MARKETPLACE">Marketplace próprio</option>
              </select>
            </Label>
          </div>
        </details>
      )}
      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={!asRows(query.data?.rows).length}
      >
        <p className="text-sm">
          {Number(query.data?.total ?? 0)} resultado(s)
          {mode === "profitability"
            ? ` · ${Number(query.data?.incomplete_sales ?? 0)} venda(s) com dados incompletos`
            : ""}
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {asRows(query.data?.rows).map((r) => (
            <article key={`${r.id}-${r.currency}`} className="space-y-3 rounded border p-4">
              <h2 className="font-semibold">
                {String(r.label ?? r.external_order_id)} · {String(r.currency)}
              </h2>
              {mode === "sales" ? (
                <>
                  <p>
                    {String(r.sku)} · {String(r.store_name)} · {String(r.sale_date)} ·{" "}
                    {String(r.quantity)} un
                  </p>
                  <p className="break-all text-xs">Venda: {r.id}</p>
                  <div className="flex flex-wrap gap-2">
                    {hasPermission("costs.calculate") && (
                      <Button disabled={refresh.isPending} onClick={() => refresh.mutate([r.id])}>
                        Processar snapshot
                      </Button>
                    )}
                    {r.snapshot_id && (
                      <Button variant="outline" onClick={() => setSelected(String(r.snapshot_id))}>
                        Rastrear snapshot
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p>
                    {String(r.units)} unidades · {String(r.incomplete_count)} pendente(s)
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      ["revenue", "Receita"],
                      ["cogs", "COGS"],
                      ["commission", "Comissão"],
                      ["fees", "Taxas"],
                      ["freight", "Frete empresa"],
                      ["discount", "Desconto empresa"],
                      ["tax", "Impostos"],
                      ["other_cost", "Outras despesas"],
                      ["gross_margin", "Margem bruta"],
                      ["contribution", "Contribuição"],
                      ["contribution_per_unit", "Contribuição/un"],
                    ].map(([k, l]) => (
                      <p key={k}>
                        {l}:{" "}
                        <strong>
                          {r[k] == null
                            ? "Pendente"
                            : new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: String(r.currency),
                              }).format(Number(r[k]))}
                        </strong>
                      </p>
                    ))}
                    <p>
                      Margem contribuição:{" "}
                      <strong>
                        {r.margin_percent == null
                          ? "Pendente"
                          : `${Number(r.margin_percent).toFixed(2)}%`}
                      </strong>
                    </p>
                  </div>
                  {r.below_cost && <p className="text-destructive">Venda abaixo do custo</p>}
                  {r.low_margin && (
                    <p className="text-destructive">Margem abaixo do limite configurado</p>
                  )}
                  <Button variant="outline" onClick={() => drill(r)}>
                    Detalhar origem
                  </Button>
                </>
              )}
            </article>
          ))}
        </div>
        <Pages page={page} total={Number(query.data?.total ?? 0)} onPage={setPage} />
      </QueryState>
      {selected && (
        <section className="space-y-3 rounded border p-4">
          <div className="flex justify-between">
            <h2 className="font-semibold">Snapshot histórico</h2>
            <Button variant="outline" onClick={() => setSelected("")}>
              Fechar
            </Button>
          </div>
          <QueryState loading={detail.isLoading} error={detail.error} empty={!detail.data}>
            <Issues value={detail.data?.issues} />
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(detail.data, null, 2)}
            </pre>
          </QueryState>
        </section>
      )}
      {hasPermission("pricing.manage") && (
        <details className="rounded border p-4">
          <summary className="cursor-pointer">
            Registrar despesas efetivamente informadas da venda
          </summary>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              record.mutate();
            }}
          >
            <p className="text-sm">
              Registro imutável. Informe zero somente se confirmado na origem. Não preenche
              automaticamente despesas desconhecidas.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["sale_id", "ID da venda"],
                ["commission_amount", "Comissão R$"],
                ["company_shipping_amount", "Frete suportado pela empresa R$"],
                ["company_discount_amount", "Desconto da empresa R$"],
                ["marketplace_discount_amount", "Desconto do marketplace R$"],
                ["tax_amount", "Imposto R$"],
                ["other_amount", "Outras despesas R$"],
                ["source_reference", "Documento / referência"],
              ].map(([k, l]) => (
                <Label key={k}>
                  {l}
                  <Input
                    required
                    type={k.endsWith("_amount") ? "number" : "text"}
                    min="0"
                    step="any"
                    value={economics[k]}
                    onChange={(e) => setEconomics({ ...economics, [k]: e.target.value })}
                  />
                </Label>
              ))}
            </div>
            <Button disabled={record.isPending}>Registrar valores reais</Button>
          </form>
        </details>
      )}
    </div>
  );
}
