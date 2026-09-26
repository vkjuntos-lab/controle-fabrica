import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { queryCrm, type CrmResult, type CrmRow } from "@/lib/crm/crm.functions";
import { sanitizeFilters } from "@/lib/crm/export";

export type CrmFilters = Record<string, string>;

/** `crm_query` devolve `{ rows, total }` nas listagens e objetos nos demais kinds. */
export const asRows = (value: unknown): CrmRow[] =>
  Array.isArray(value) ? (value as CrmRow[]) : [];

export const asRowsFrom = (response: CrmResult | undefined): CrmRow[] => asRows(response?.rows);

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Número de `crm_query` chega como string do Postgres (numeric). */
export const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Consulta tabular do CRM na organização ativa.
 *
 * A chave inclui a organização, o kind, os filtros e a página; a troca de
 * qualquer um deles invalida a página anterior. Filtros fora da lista branca
 * são removidos aqui para que a tela nunca finte um recorte que o servidor
 * não aplicou.
 */
export function useCrmQuery(
  org: string | undefined,
  kind: string,
  filters: CrmFilters = {},
  page = 1,
  enabled = true,
): UseQueryResult<CrmResult, Error> {
  const api = useServerFn(queryCrm);
  const clean = sanitizeFilters(filters);
  return useQuery<CrmResult, Error>({
    queryKey: ["crm", org, kind, clean, page],
    queryFn: async () => {
      const response = (await api({
        data: { organizationId: org!, kind, filters: clean, page },
      })) as CrmResult;
      return response ?? {};
    },
    enabled: Boolean(org && enabled),
  }) as UseQueryResult<CrmResult, Error>;
}

/** Opções de um seletor (segmentos, origens, pipelines, …) já paginadas. */
export function useCrmOptions(org: string | undefined, kind: string, enabled = true) {
  return useCrmQuery(org, kind, {}, 1, enabled);
}

/**
 * Consulta não tabular (dashboard, finance, margin, stock, commission).
 * Esses kinds devolvem um objeto e nunca linhas paginadas.
 */
export function useCrmDetail(
  org: string | undefined,
  kind: string,
  filters: CrmFilters = {},
  enabled = true,
): UseQueryResult<CrmResult, Error> {
  const api = useServerFn(queryCrm);
  const clean = sanitizeFilters(filters);
  return useQuery<CrmResult, Error>({
    queryKey: ["crm", org, kind, clean],
    queryFn: async () => {
      const response = (await api({
        data: { organizationId: org!, kind, filters: clean, page: 1 },
      })) as CrmResult;
      return response ?? {};
    },
    enabled: Boolean(org && enabled),
  }) as UseQueryResult<CrmResult, Error>;
}
