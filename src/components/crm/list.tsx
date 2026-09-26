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
import { asRecord, useCrmQuery } from "./data";
import {
  Fields,
  Pager,
  ResultState,
  Shell,
  StatusBadge,
  columnLabel,
  str,
} from "./shared";
import type { Area, Field } from "./config";

type FormState = Record<string, string>;

const emptyForm: FormState = {};

/**
 * Listagem genérica de uma área do CRM.
 *
 * A área decide colunas, campos, permissões e filtros; a tela não conhece
 * nenhuma regra de negócio. A gravação vai sempre por `crm_save`, que valida a
 * permissão e a carteira no servidor — a interface apenas esconde o que o
 * usuário não pode fazer, nunca é a única barreira.
 */
export function CrmListPage({
  area,
  title,
  extraActions,
  rowHref,
  rowKey,
  toolbar,
}: {
  area: Area;
  title: string;
  extraActions?: ReactNode;
  rowHref?: (row: CrmRow) => string;
  rowKey?: (row: CrmRow) => string;
  toolbar?: ReactNode;
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
          toolbar={toolbar}
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
  toolbar,
}: {
  org: string;
  area: Area;
  extraActions?: ReactNode;
  rowHref?: (row: CrmRow) => string;
  rowKey?: (row: CrmRow) => string;
  toolbar?: ReactNode;
}) {
  const { hasPermission } = useOrganization();
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CrmRow | null | undefined>(undefined);

  useEffect(() => setPage(1), [org, term, filters]);

  const query = useCrmQuery(org, area.query, { ...filters, ...(term ? { q: term } : {}) }, page);
  const rows = (query.data?.rows ?? []) as CrmRow[];
  const canWrite = Boolean(area.write && hasPermission(area.write) && area.save);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{area.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {extraActions}
          {canWrite ? (
            <Button onClick={() => setEditing(null)}>Novo registro</Button>
          ) : null}
        </div>
      </div>

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
            <FilterSelect
              key={filter.key}
              org={org}
              filter={filter}
              value={filters[filter.key] ?? ""}
              onChange={(value) => setFilters({ ...filters, [filter.key]: value })}
            />
          ) : (
            <StatusFilter
              key={filter.key}
              area={area}
              options={filter.key === "status" ? statusOptions(area.query) : []}
              value={filters[filter.key] ?? ""}
              onChange={(value) => setFilters({ ...filters, [filter.key]: value })}
            />
          ),
        )}
      </div>

      <ResultState
        loading={query.isLoading}
        error={query.error}
        empty={!rows.length}
      >
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
                          {renderCell(row, column)}
                        </td>
                      ))}
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          {rowHref ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={rowHref(row)}>Abrir</a>
                            </Button>
                          ) : null}
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
            <div className="mt-4 flex justify-between">
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
            void useQueryClientSafe();
          }}
        />
      ) : null}
    </>
  );
}

function useQueryClientSafe() {
  const client = useQueryClient();
  void client.invalidateQueries({ queryKey: ["crm"] });
}

/** `status` é filtro só quando a área tem opções declaradas para ele. */
function statusOptions(query: string): string[] {
  if (query === "leads")
    return ["NEW", "CONTACT_ATTEMPTED", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED", "ARCHIVED"];
  if (query === "opportunities") return ["OPEN", "WON", "LOST", "CANCELED"];
  if (query === "quotes")
    return [
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "SENT",
      "ACCEPTED",
      "REJECTED",
      "EXPIRED",
      "CANCELED",
    ];
  if (query === "activities") return ["PENDING", "COMPLETED", "CANCELED"];
  if (query === "customers") return ["ACTIVE", "INACTIVE", "BLOCKED"];
  return ["ACTIVE", "INACTIVE"];
}

function StatusFilter({
  area,
  options,
  value,
  onChange,
}: {
  area: Area;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm" htmlFor={`${area.query}-status`}>
        Status
      </label>
      <select
        id={`${area.query}-status`}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterSelect({
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
  return (
    <div className="space-y-1">
      <label className="text-sm" htmlFor={`${areaKey(filter.key)}`}>
        {filter.label}
      </label>
      <select
        id={areaKey(filter.key)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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

const areaKey = (key: string) => `crm-filter-${key.replace(/_/g, "-")}`;

/** Formulário de criação/edição de um registro da área. */
export function RecordDialog({
  org,
  area,
  record,
  fields,
  onClose,
  onSaved,
  extra,
  values: initialValues,
}: {
  org: string;
  area: Area;
  record: CrmRow | null;
  fields?: Field[];
  onClose: () => void;
  onSaved: () => void;
  extra?: ReactNode;
  values?: FormState;
}) {
  const api = useServerFn(saveCrm);
  const [values, setValues] = useState<FormState>(() => ({
    ...(initialValues ?? {}),
    ...(record ? seedValues(area, record) : emptyForm),
  }));
  const usable = (fields ?? area.fields).filter(
    (item) => !(record && item.key === "company_id" && area.query === "customers"),
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...values };
      if (record) payload.id = record.id;
      usable.forEach((item) => {
        if (item.type === "number" && payload[item.key] !== undefined) {
          const parsed = Number(payload[item.key]);
          payload[item.key] = Number.isFinite(parsed) ? parsed : null;
        }
        if (payload[item.key] === "") delete payload[item.key];
      });
      await api({
        data: { organizationId: org, kind: area.save!, values: payload },
      });
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
          <DialogTitle>{record ? `Editar ${area.title}` : `Novo registro em ${area.title}`}</DialogTitle>
          <DialogDescription>
            O servidor valida a permissão e o escopo de carteira; campos omitidos mantêm o valor
            gravado.
          </DialogDescription>
        </DialogHeader>
        {extra}
        <Fields
          org={org}
          fields={usable}
          values={values}
          setValues={setValues}
          idPrefix="crm"
        />
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
function seedValues(area: Area, record: CrmRow): FormState {
  const seed: FormState = {};
  area.fields.forEach((item) => {
    const value = record[item.key];
    if (value === null || value === undefined) return;
    seed[item.key] = item.type === "date" && typeof value === "string"
      ? value.slice(0, 10)
      : String(value);
  });
  return seed;
}

/** Formulário genérico dos cadastros de configuração da organização. */
export function ConfigurationPage({ title }: { title: string }) {
  return (
    <Shell title="Comercial · Configurações" permission="crm.configure">
      {(org) => <ConfigurationBody org={org} title={title} />}
    </Shell>
  );
}

function ConfigurationBody({ org, title }: { org: string; title: string }) {
  const { hasPermission } = useOrganization();
  const [selected, setSelected] = useState(title);
  const [editing, setEditing] = useState<CrmRow | null | undefined>(undefined);
  const [search, setSearch] = useState("");

  const config = useCrmQuery(org, "segments", {}, 1);
  const area = useConfigurationArea(title);
  const query = useCrmQuery(org, area?.query ?? "segments", search ? { q: search } : {}, 1);
  const rows = ((query.data?.rows ?? []) as CrmRow[]).filter((row) => {
    const record = asRecord(row);
    return Object.values(record).some((value) =>
      String(value ?? "").toLowerCase().includes(search.toLowerCase()),
    );
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{area?.title ?? "Configurações"}</h2>
        {area?.write && hasPermission(area.write) ? (
          <Button onClick={() => setEditing(null)}>Novo registro</Button>
        ) : null}
      </div>

      <nav className="flex flex-wrap gap-2">
        {configurationTabs.map((tab) => (
          <Button
            key={tab.key}
            variant={tab.title === title ? "default" : "outline"}
            asChild
          >
            <a href={`/comercial/configuracoes/${tab.key}`}>{tab.title}</a>
          </Button>
        ))}
      </nav>

      <Input
        value={search}
        placeholder="Filtrar cadastros"
        aria-label="Filtrar cadastros"
        onChange={(event) => setSearch(event.target.value)}
      />

      {config.isError ? null : null}

      <ResultState loading={query.isLoading} error={query.error} empty={!rows.length}>
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {(area?.columns ?? ["name"]).map((column) => (
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
                      {(area?.columns ?? ["name"]).map((column) => (
                        <td key={column} className="py-2 pr-4">
                          {renderCell(row, column)}
                        </td>
                      ))}
                      <td className="py-2 text-right">
                        {area?.write && hasPermission(area.write) ? (
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

      {editing !== undefined && area ? (
        <RecordDialog
          org={org}
          area={area}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      ) : null}
      <p className="hidden">{selected}</p>
    </>
  );
}

const configurationTabs = CONFIGURATION_TABS;

function useConfigurationArea(title: string): Area | undefined {
  return configurationTabs.find((tab) => tab.title === title) ?? configurationTabs[0];
}

const CONFIGURATION_TABS: Area[] = [];

/** Célula de tabela: status vira badge, demais valores seguem o tipo da coluna. */
function renderCell(row: CrmRow, column: string) {
  const value = row[column];
  if (column === "status" || column === "commercial_status") {
    return <StatusBadge value={value} kind={column === "status" ? undefined : "status"} />;
  }
  if (column.endsWith("_id")) {
    return <span className="font-mono text-xs">{str(value)}</span>;
  }
  if (column.includes("value") || column === "total" || column === "subtotal") {
    return <span className="tabular-nums">{money(value)}</span>;
  }
  if (column === "probability") return <span className="tabular-nums">{str(value)}%</span>;
  if (column === "rate") return <span className="tabular-nums">{str(value)}</span>;
  if (column === "created_at" || column === "scheduled_at" || column === "started_at") {
    return <span className="text-xs text-muted-foreground">{str(value)}</span>;
  }
  return <span>{str(value)}</span>;
}
