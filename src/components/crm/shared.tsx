import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "@/components/states";
import { useOrganization } from "@/lib/org/org-context";
import { queryCrm, type CrmRow } from "@/lib/crm/crm.functions";
import {
  ACTIVITY_STATUS,
  ACTIVITY_TYPE,
  COMMERCIAL_STATUS,
  COMMISSION_RATE_TYPE,
  COMMISSION_TRIGGER,
  LEAD_STATUS,
  OPPORTUNITY_STATUS,
  QUOTE_STATUS,
  REASON_KIND,
  REPRESENTATIVE_TYPE,
  activityTypeLabel,
  leadStatusLabel,
  opportunityStatusLabel,
  quoteStatusLabel,
} from "@/lib/crm/constants";
import { areaOrder, areas, configurationOrder, configurations, labels, type Field } from "./config";

/** Rótulos pt-BR das opções fixas de formulário e de coluna. */
export const optionLabels: Record<string, Record<string, string>> = {
  status: {
    ...LEAD_STATUS,
    ...OPPORTUNITY_STATUS,
    ...QUOTE_STATUS,
    ...ACTIVITY_STATUS,
    ...COMMERCIAL_STATUS,
    ACTIVE: "Ativo",
    INACTIVE: "Inativo",
  },
  activity_type: ACTIVITY_TYPE,
  representative_type: REPRESENTATIVE_TYPE,
  kind: REASON_KIND,
  trigger_event: COMMISSION_TRIGGER,
  rate_type: COMMISSION_RATE_TYPE,
  // Campos com opções próprias, fora do conjunto de status. Sem esta entrada o
  // seletor mostraria "ACTIVE" e "BLOCKED" crus no cadastro de clientes.
  commercial_status: COMMERCIAL_STATUS,
};

export const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** Exibe qualquer valor vindo de `crm_query` sem quebrar a tabela. */
export const str = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export const money = (value: unknown): string =>
  Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

export const number = (value: unknown, digits = 2): string =>
  Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export const percent = (value: unknown): string => `${number(value, 0)}%`;

const STATUS_CSS: Record<string, string> = {
  NEW: "border-sky-200 bg-sky-50 text-sky-700",
  CONTACT_ATTEMPTED: "border-sky-200 bg-sky-50 text-sky-700",
  CONTACTED: "border-sky-200 bg-sky-50 text-sky-700",
  QUALIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  UNQUALIFIED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  CONVERTED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ARCHIVED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  OPEN: "border-sky-200 bg-sky-50 text-sky-700",
  WON: "border-emerald-200 bg-emerald-50 text-emerald-700",
  LOST: "border-red-200 bg-red-50 text-red-700",
  CANCELED: "border-zinc-200 bg-zinc-100 text-zinc-600",
  DRAFT: "border-zinc-200 bg-zinc-100 text-zinc-600",
  PENDING_APPROVAL: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SENT: "border-sky-200 bg-sky-50 text-sky-700",
  ACCEPTED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  EXPIRED: "border-orange-200 bg-orange-50 text-orange-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  BLOCKED: "border-red-200 bg-red-50 text-red-700",
  INTERNAL: "border-sky-200 bg-sky-50 text-sky-700",
  EXTERNAL: "border-violet-200 bg-violet-50 text-violet-700",
  COMPANY: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

/** Badge de status com rótulo em português. */
export function StatusBadge({ value, kind }: { value: unknown; kind?: string }) {
  const raw = str(value);
  if (raw === "—") return <span className="text-muted-foreground">—</span>;
  const label = optionLabels[kind ?? "status"]?.[raw] ?? raw.replace(/_/g, " ").toLowerCase();
  return (
    <Badge className={`border ${STATUS_CSS[raw] ?? "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
      {label}
    </Badge>
  );
}

/** Cartão de indicador, no mesmo formato dos demais módulos. */
export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Casca comum do módulo: menu com as áreas visíveis para o usuário, estados de
 * organização e permissão. A troca de organização remonta a árvore porque a
 * chave força o remount e descarta seleções do tenant anterior.
 */
export function Shell({
  title,
  permission = "crm.read",
  children,
}: {
  title: string;
  permission?: string;
  children: (org: string) => ReactNode;
}) {
  const { currentOrganization, hasPermission, isLoading } = useOrganization();
  const items: [string, string, string][] = [
    ["", "Dashboard", "crm.dashboard"],
    ...areaOrder.map(
      (key) => [key, areas[key].title, areas[key].permission] as [string, string, string],
    ),
    ["relatorios", "Relatórios", "crm.read"],
    ["configuracoes", "Configurações", "crm.configure"],
  ];
  return (
    <AppShell title={title}>
      <nav className="mb-5 flex flex-wrap gap-2 print:hidden">
        {items
          .filter(([, , perm]) => hasPermission(perm))
          .map(([key, label]) => (
            <Button key={key || "dashboard"} asChild variant="outline">
              <a href={`/comercial${key ? `/${key}` : ""}`}>{label}</a>
            </Button>
          ))}
      </nav>
      {isLoading ? (
        <LoadingState />
      ) : !currentOrganization ? (
        <EmptyState title="Selecione uma organização" />
      ) : !hasPermission(permission) ? (
        <PermissionDenied permission={permission} />
      ) : (
        <div key={currentOrganization.organization_id} className="space-y-5">
          {children(currentOrganization.organization_id)}
        </div>
      )}
    </AppShell>
  );
}

export function ResultState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: Error | null;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState description={error.message} />;
  if (empty)
    return (
      <EmptyState
        title="Nenhum resultado"
        description="Cadastre informações reais ou ajuste os filtros aplicados."
      />
    );
  return <>{children}</>;
}

/** Lista paginada usada pelo seletor de referências. */
export function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  if (total <= 50) return null;
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {Math.ceil(total / 50)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page * 50 >= total}
        onClick={() => setPage(page + 1)}
      >
        Próxima
      </Button>
    </div>
  );
}

/**
 * Seletor de referência. Busca no servidor com `crm_query` e sempre na
 * organização ativa — a organização nunca é adivinhada. Membros também são um
 * `kind` do CRM (`members`), então seguem a mesma permissão e o mesmo isolamento,
 * em vez de depender de `users.read`, que é permissão de administração de
 * usuários e esconderia o responsável de um lead de quem pode ver o lead.
 */
export function Picker({
  org,
  kind,
  value,
  onChange,
  label,
  id,
}: {
  org: string;
  kind: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
}) {
  const api = useServerFn(queryCrm);
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [term]);

  const options = useQuery({
    queryKey: ["crm", org, "picker", kind, term, page],
    queryFn: async () => {
      const response = await api({
        data: { organizationId: org, kind, filters: term ? { q: term } : {}, page },
      });
      return {
        rows: (response.rows ?? []) as CrmRow[],
        total: Number(response.total ?? 0),
      };
    },
    enabled: Boolean(org),
  });

  const rows = options.data?.rows ?? [];
  const known = rows.some((row) => row.id === value);
  return (
    <div className="space-y-1">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Input
        id={id ? `${id}-busca` : undefined}
        placeholder="Buscar opções"
        value={term}
        aria-label={`${label ?? "Opção"}: buscar`}
        onChange={(event) => setTerm(event.target.value)}
      />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label ?? "Selecione uma opção"}>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {value && !known ? <SelectItem value={value}>Registro selecionado</SelectItem> : null}
          {rows.map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {str(row.name ?? row.legal_name ?? row.title ?? row.sku ?? row.email ?? row.code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.error ? (
        <p role="alert" className="text-sm text-destructive">
          {options.error.message}
        </p>
      ) : null}
      {options.isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando opções…</p>
      ) : null}
      <Pager page={page} total={options.data?.total ?? 0} setPage={setPage} />
    </div>
  );
}

/**
 * Mapa id → nome das referências usadas nas colunas de uma área, para que a
 * listagem mostre "Ana Souza" em vez do UUID. Uma consulta por `kind`, e apenas
 * para as chaves realmente exibidas.
 *
 * O servidor decide a visibilidade: empresas fora da carteira do usuário não
 * entram no mapa e a célula cai para um identificador curto, sem inventar nome.
 */
export function useRefLabels(org: string, refColumns?: Record<string, string>) {
  const api = useServerFn(queryCrm);
  const kinds = useMemo(() => [...new Set(Object.values(refColumns ?? {}))].sort(), [refColumns]);
  return useQuery({
    queryKey: ["crm", org, "ref-labels", kinds],
    queryFn: async () => {
      const maps: Record<string, Record<string, string>> = {};
      for (const kind of kinds) {
        const response = await api({ data: { organizationId: org, kind, filters: {}, page: 1 } });
        maps[kind] = Object.fromEntries(
          (response.rows ?? []).map((row) => [
            row.id,
            str(row.name ?? row.legal_name ?? row.title ?? row.email ?? row.code),
          ]),
        );
      }
      return maps;
    },
    enabled: Boolean(org) && kinds.length > 0,
  });
}

/** Formulário gerado a partir da área. Estado simples, como nos demais módulos. */
export function Fields({
  org,
  fields,
  values,
  setValues,
  idPrefix,
}: {
  org: string;
  fields: Field[];
  values: Record<string, string>;
  setValues: (values: Record<string, string>) => void;
  idPrefix: string;
}) {
  const set = (key: string, next: string) => setValues({ ...values, [key]: next });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((item) => {
        const inputId = `${idPrefix}-${item.key}`;
        const common = { id: inputId, required: item.required };
        return (
          <div
            key={item.key}
            className={item.type === "longtext" ? "space-y-1 sm:col-span-2" : "space-y-1"}
          >
            {item.lookup ? (
              <Picker
                org={org}
                kind={item.lookup}
                value={values[item.key] ?? ""}
                onChange={(next) => set(item.key, next)}
                label={item.label}
                id={inputId}
              />
            ) : item.options ? (
              <>
                <Label htmlFor={inputId}>{item.label}</Label>
                <select
                  {...common}
                  className={selectClass}
                  value={values[item.key] ?? ""}
                  onChange={(event) => set(item.key, event.target.value)}
                >
                  <option value="">Selecione</option>
                  {item.options.map((option) => (
                    <option key={option} value={option}>
                      {optionLabels[item.key]?.[option] ?? option}
                    </option>
                  ))}
                </select>
              </>
            ) : item.type === "longtext" ? (
              <>
                <Label htmlFor={inputId}>{item.label}</Label>
                <Textarea
                  {...common}
                  rows={3}
                  value={values[item.key] ?? ""}
                  onChange={(event) => set(item.key, event.target.value)}
                />
              </>
            ) : (
              <>
                <Label htmlFor={inputId}>{item.label}</Label>
                <Input
                  {...common}
                  type={item.type ?? "text"}
                  min={item.type === "number" ? 0 : undefined}
                  step={item.type === "number" ? "0.01" : undefined}
                  value={values[item.key] ?? ""}
                  onChange={(event) => set(item.key, event.target.value)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Achata a linha para CSV e para as colunas da tabela. */
export function rowValues(row: CrmRow): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value !== null && typeof value !== "object")
      .map(([key, value]) => [key, String(value)]),
  );
}

/** Traduz o nome de uma coluna, seja campo do formulário ou coluna da listagem. */
export const columnLabel = (key: string) =>
  labels[key] ?? key.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());

/** Ids das configurações, usado pela tela de configurações comerciais. */
export const configurationSections = configurationOrder.map((key) => ({
  key,
  ...configurations[key],
}));
