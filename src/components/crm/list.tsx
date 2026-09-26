import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { useOrganization } from "@/lib/org/org-context";
import { useCrmQuery } from "./data";
import {
  Fields,
  Pager,
  ResultState,
  Shell,
  StatusBadge,
  columnLabel,
  money,
  optionLabels,
  str,
  useRefLabels,
} from "./shared";
import { configurationOrder, configurations, type Area, type Field } from "./config";

type FormState = Record<string, string>;

const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

/**
 * Listagem genérica de uma área do CRM.
 *
 * A área decide colunas, campos, permissões e filtros; a tela não conhece
 * nenhuma regra de negócio. A gravação vai sempre por `crm_save`, que valida
 * permissão e escopo de carteira no servidor — a interface apenas esconde o que
 * o usuário não pode fazer, nunca é a única barreira.
 */
export function CrmListPage({
  area,
  title,
  extraActions,
  rowHref,
  rowKey,
  rowActions,
  toolbar,
  intro,
}: {
  area: Area;
  title: string;
  extraActions?: ReactNode;
  rowHref?: (row: CrmRow) => string;
  rowKey?: (row: CrmRow) => string;
  rowActions?: (row: CrmRow) => ReactNode;
  toolbar?: ReactNode;
  intro?: string;
}) {
  return (
    <Shell title={title} permission={area.permission}>
      {(org) => (
        <ListBody
          org={org}
          area={area}
          extraActions={extraActions}
          rowHref={rowHref}
          rowKey={rowKey}
          rowActions={rowActions}
          toolbar={toolbar}
          intro={intro}
        />
      )}
    </Shell>
  );
}

function ListBody({
  org,
  area,
  extraActions,
  rowHref,
  rowKey,
  rowActions,
  toolbar,
  intro,
}: {
  org: string;
  area: Area;
  extraActions?: ReactNode;
  rowHref?: (row: CrmRow) => string;
  rowKey?: (row: CrmRow) => string;
  rowActions?: (row: CrmRow) => ReactNode;
  toolbar?: ReactNode;
  intro?: string;
}) {
  const { hasPermission } = useOrganization();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CrmRow | null | undefined>(undefined);

  useEffect(() => setPage(1), [org, term, filters]);

  const query = useCrmQuery(org, area.query, { ...filters, ...(term ? { q: term } : {}) }, page);
  const rows = (query.data?.rows ?? []) as CrmRow[];
  const refs = useRefLabels(org, area.refColumns);
  const canWrite = Boolean(area.write && saveSteps(area).length && hasPermission(area.write));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{area.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {extraActions}
          {canWrite ? <Button onClick={() => setEditing(null)}>Novo registro</Button> : null}
        </div>
      </div>

      {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1">
          <label className="text-sm" htmlFor={`${area.query}-search`}>
            Buscar
          </label>
          <Input
            id={`${area.query}-search`}
            value={term}
            placeholder="Nome, título, código ou e-mail"
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        {(area.filters ?? []).map((filter) =>
          filter.kind ? (
            <ReferenceFilter
              key={filter.key}
              org={org}
              filter={filter}
              value={filters[filter.key] ?? ""}
              onChange={(value) => setFilters({ ...filters, [filter.key]: value })}
            />
          ) : (
            <div className="space-y-1" key={filter.key}>
              <label className="text-sm" htmlFor={`${area.query}-${filter.key}`}>
                {filter.label}
              </label>
              <select
                id={`${area.query}-${filter.key}`}
                className={selectClass}
                value={filters[filter.key] ?? ""}
                onChange={(event) => setFilters({ ...filters, [filter.key]: event.target.value })}
              >
                <option value="">Todos</option>
                {STATUS_OPTIONS[area.query]?.map((option) => (
                  <option key={option} value={option}>
                    {optionLabels.status[option] ?? option}
                  </option>
                ))}
              </select>
            </div>
          ),
        )}
      </div>

      <ResultState loading={query.isLoading} error={query.error} empty={!rows.length}>
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {area.columns.map((column) => (
                      <th key={column} className="pb-2 pr-4">
                        {columnLabel(column)}
                      </th>
                    ))}
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={rowKey ? rowKey(row) : row.id} className="border-b hover:bg-muted/40">
                      {area.columns.map((column) => (
                        <td key={column} className="py-2 pr-4">
                          {renderCell(row, column, area.refColumns?.[column], refs.data)}
                        </td>
                      ))}
                      <td className="py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {rowHref ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={rowHref(row)}>Abrir</a>
                            </Button>
                          ) : null}
                          {rowActions?.(row)}
                          {canWrite ? (
                            <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                              Editar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{query.data?.total ?? 0} registros</p>
              <Pager page={page} total={Number(query.data?.total ?? 0)} setPage={setPage} />
            </div>
          </CardContent>
        </Card>
      </ResultState>

      {editing !== undefined && canWrite ? (
        <RecordDialog
          org={org}
          area={area}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void client.invalidateQueries({ queryKey: ["crm"] });
          }}
        />
      ) : null}
    </>
  );
}

/** Status aceitos pelo filtro, derivados do mesmo conjunto gravado pelo servidor. */
const STATUS_OPTIONS: Record<string, string[]> = {
  leads: [
    "NEW",
    "CONTACT_ATTEMPTED",
    "CONTACTED",
    "QUALIFIED",
    "UNQUALIFIED",
    "CONVERTED",
    "ARCHIVED",
  ],
  opportunities: ["OPEN", "WON", "LOST", "CANCELED"],
  quotes: [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT",
    "ACCEPTED",
    "REJECTED",
    "EXPIRED",
    "CANCELED",
  ],
  activities: ["PENDING", "COMPLETED", "CANCELED"],
  customers: ["ACTIVE", "INACTIVE", "BLOCKED"],
  representatives: ["ACTIVE", "INACTIVE"],
};

function ReferenceFilter({
  org,
  filter,
  value,
  onChange,
}: {
  org: string;
  filter: NonNullable<Area["filters"]>[number];
  value: string;
  onChange: (value: string) => void;
}) {
  const query = useCrmQuery(org, filter.kind, {}, 1);
  const rows = (query.data?.rows ?? []) as CrmRow[];
  const id = `crm-filter-${filter.key.replace(/_/g, "-")}`;
  return (
    <div className="space-y-1">
      <label className="text-sm" htmlFor={id}>
        {filter.label}
      </label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {str(row.name ?? row.legal_name ?? row.code ?? row.id)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Formulário de criação/edição de um registro da área. */
export function RecordDialog({
  org,
  area,
  record,
  fields,
  onClose,
  onSaved,
  extra,
  initialValues,
  title,
  description,
}: {
  org: string;
  area: Area;
  record: CrmRow | null;
  fields?: Field[];
  onClose: () => void;
  onSaved: () => void;
  extra?: ReactNode;
  initialValues?: FormState;
  title?: string;
  description?: string;
}) {
  const api = useServerFn(saveCrm);
  const usable = (fields ?? area.fields).filter(
    // Campos imutáveis somem na edição: o servidor criaria um registro paralelo
    // em vez de recusar, e a tela deve dizer que a troca não existe.
    (item) => !(record && (area.immutableOnEdit ?? []).includes(item.key)),
  );
  const [values, setValues] = useState<FormState>(() => ({
    ...(initialValues ?? {}),
    ...(record ? seedValues(usable, record) : {}),
  }));

  const save = useMutation({
    mutationFn: async () => {
      const steps = saveSteps(area);
      if (!steps.length) throw new Error("Área sem gravação configurada.");
      let previous: { id?: string } = {};
      for (const step of steps) {
        if (step.onlyExisting && !record) continue;
        const payload: Record<string, unknown> = {};
        for (const key of step.fields) {
          const raw = values[key];
          if (raw === undefined) continue;
          // Campo vazio é removido, nunca enviado como string vazia: em patch
          // isso zeraria um número e em insert quebraria um NOT NULL.
          if (raw === "") continue;
          const field = area.fields.find((item) => item.key === key);
          payload[key] = field?.type === "number" ? numeric(raw) : raw;
        }
        const stepId = step.usePreviousId ? (previous.id ?? record?.id) : record?.id;
        if (stepId) payload.id = stepId;
        if (!Object.keys(payload).some((key) => key !== "id")) continue;
        const result = await api({
          data: { organizationId: org, kind: step.kind, values: payload },
        });
        if (typeof result?.id === "string") previous = { id: result.id };
      }
    },
    onSuccess: () => {
      toast.success(record ? "Registro atualizado." : "Registro criado.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {title ?? (record ? `Editar ${area.title}` : `Novo registro em ${area.title}`)}
          </DialogTitle>
          <DialogDescription>
            {description ??
              "O servidor valida a permissão e o escopo de carteira; campos omitidos mantêm o valor gravado."}
          </DialogDescription>
        </DialogHeader>
        {extra}
        <Fields org={org} fields={usable} values={values} setValues={setValues} idPrefix="crm" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Campos aceitos pelo `crm_save` carregados do registro existente. */
function seedValues(fields: Field[], record: CrmRow): FormState {
  const seed: FormState = {};
  fields.forEach((item) => {
    const value = record[item.key];
    if (value === null || value === undefined) return;
    seed[item.key] =
      item.type === "date" && typeof value === "string" ? value.slice(0, 10) : String(value);
  });
  return seed;
}

/** Etapas de gravação da área, normalizando a forma antiga de um único `save`. */
export function saveSteps(area: Area) {
  if (area.saves?.length) return area.saves;
  if (!area.save) return [];
  return [{ kind: area.save, fields: area.fields.map((item) => item.key) }];
}

/** Número gravado como numeric: `NaN` é removido em vez de virar null. */
function numeric(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tela de configuração comercial. As abas são cadastros da própria
 * organização — segmento, origem, motivo, pipeline, alçada de desconto — e
 * nunca dados de uma empresa.
 */
export function ConfigurationPage({ section }: { section: string }) {
  const key = (configurationOrder as readonly string[]).includes(section)
    ? section
    : configurationOrder[0];
  const area = configurations[key];
  return (
    <Shell title="Comercial · Configurações" permission={area.permission}>
      {(org) => <ConfigurationBody org={org} area={area} section={key} />}
    </Shell>
  );
}

function ConfigurationBody({ org, area, section }: { org: string; area: Area; section: string }) {
  const { hasPermission } = useOrganization();
  const client = useQueryClient();
  const [editing, setEditing] = useState<CrmRow | null | undefined>(undefined);
  const query = useCrmQuery(org, area.query, {}, 1);
  const rows = (query.data?.rows ?? []) as CrmRow[];
  const refs = useRefLabels(org, area.refColumns);
  const canWrite = Boolean(area.write && saveSteps(area).length && hasPermission(area.write));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{area.title}</h2>
        {canWrite ? <Button onClick={() => setEditing(null)}>Novo registro</Button> : null}
      </div>

      <nav className="flex flex-wrap gap-2">
        {configurationOrder.map((item) => (
          <Button key={item} asChild variant={item === section ? "default" : "outline"}>
            <a href={`/comercial/configuracoes/${item}`}>{configurations[item].title}</a>
          </Button>
        ))}
      </nav>

      <p className="text-sm text-muted-foreground">
        Cadastros desta organização. Não há valor fixo no código: o que existe aqui é o que a
        operação configurou.
      </p>

      <ResultState loading={query.isLoading} error={query.error} empty={!rows.length}>
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {area.columns.map((column) => (
                      <th key={column} className="pb-2 pr-4">
                        {columnLabel(column)}
                      </th>
                    ))}
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/40">
                      {area.columns.map((column) => (
                        <td key={column} className="py-2 pr-4">
                          {renderCell(row, column)}
                        </td>
                      ))}
                      <td className="py-2 text-right">
                        {canWrite ? (
                          <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                            Editar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </ResultState>

      {editing !== undefined && canWrite ? (
        <RecordDialog
          org={org}
          area={area}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void client.invalidateQueries({ queryKey: ["crm"] });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Célula de tabela: status vira badge, dinheiro vira moeda, e chave estrangeira
 * vira o nome resolvido pelo servidor. Quando o nome não está no mapa — a empresa
 * está fora da carteira do usuário, por exemplo — a célula mostra um fragmento do
 * identificador em vez de mentir com um nome inventado.
 */
export function renderCell(
  row: CrmRow,
  column: string,
  refKind?: string,
  refs?: Record<string, Record<string, string>>,
) {
  const value = row[column];
  if (column === "status" || column === "commercial_status") {
    return <StatusBadge value={value} kind="status" />;
  }
  if (column === "kind") {
    return <StatusBadge value={value} kind="kind" />;
  }
  if (refKind) {
    const label = refs?.[refKind]?.[String(value ?? "")];
    return <span title={label ? undefined : String(value ?? "")}>{label ?? shortId(value)}</span>;
  }
  if (column.endsWith("_id")) return <span className="font-mono text-xs">{shortId(value)}</span>;
  if (["estimated_value", "total", "subtotal", "credit_limit"].includes(column)) {
    return <span className="tabular-nums">{money(value)}</span>;
  }
  if (column === "probability") return <span className="tabular-nums">{str(value)}%</span>;
  if (["created_at", "scheduled_at", "started_at", "effective_from"].includes(column)) {
    return <span className="text-xs text-muted-foreground">{str(value)}</span>;
  }
  return <span>{str(value)}</span>;
}

/** UUID abreviado para caber na célula sem poluir a leitura. */
function shortId(value: unknown): string {
  const raw = str(value);
  return raw.length > 12 ? `${raw.slice(0, 8)}…` : raw;
}
