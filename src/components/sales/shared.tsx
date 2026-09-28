import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { readSales, mutateSales, type SalesOperation } from "@/lib/sales/sales.functions";
import { MONEY_COLUMNS } from "@/lib/sales/constants";
import type { Json } from "@/integrations/supabase/types";

/**
 * Infraestrutura de leitura e escrita das telas de Vendas.
 *
 * Toda leitura vai para `readSales` e toda escrita para `mutateSales`, que por
 * sua vez chamam as RPCs do banco. A invalidate é sempre do prefixo
 * `["sales", org]`: nenhuma tela deste módulo lê de outra fonte.
 */

export type Row = Record<string, Json | undefined>;

export const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
export const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
export const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);
export const numeric = (value: unknown): number => Number(value ?? 0);
export const truthy = (value: unknown): boolean => value === true || value === "true";

export const asJson = (value: Row): Record<string, Json> => value as Record<string, Json>;

/** Monta a query de leitura de uma área do módulo. */
export function useSalesRead(
  organizationId: string,
  kind: string,
  id?: string,
  filters: Row = {},
) {
  const api = useServerFn(readSales);
  const stable = useMemo(() => filters, [JSON.stringify(filters)]);
  return useQuery({
    queryKey: ["sales", organizationId, kind, id, stable],
    queryFn: () =>
      api({
        data: {
          organizationId,
          kind: kind as never,
          id,
          filters: asJson(stable),
        },
      }),
    enabled: Boolean(organizationId),
  });
}

/**
 * Chave de idempotência por tentativa.
 *
 * O gateway recusa a mesma chave com conteúdo diferente, então a chave só pode
 * ser renovada quando a tentativa anterior terminou (sucesso ou erro) ou quando
 * o diálogo é fechado e recomeça. Uma falha do servidor não pode deixar a tela
 * presa com uma chave que o servidor já recusou.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return { key, renew };
}

export type MutationOptions = {
  organizationId: string;
  operation: SalesOperation;
  id?: string;
  action?: string;
  /** Invalida também o CRM: proposta e cliente 360 compartilham os mesmos fatos. */
  alsoCrm?: boolean;
  onDone?: () => void;
};

/**
 * Escrita padronizada: envia, trata erro e renova a chave de idempotência.
 * Nenhuma tela monta a chamada de `mutateSales` por conta própria.
 */
export function useSalesWrite({
  organizationId,
  operation,
  id,
  action = "",
  alsoCrm = false,
  onDone,
}: MutationOptions) {
  const api = useServerFn(mutateSales);
  const client = useQueryClient();
  const { key, renew } = useIdempotencyKey();
  return useMutation(api, { operation, id, action, key, organizationId, renew, invalidate: client, alsoCrm, onDone });
}

/** Chamada direta, para formulários que controlam o próprio envio. */
export function useSalesSubmit(organizationId: string, alsoCrm = false) {
  const api = useServerFn(mutateSales);
  const client = useQueryClient();
  return useSubmitApi(api, organizationId, client, alsoCrm);
}

function useSubmitApi(
  api: ReturnType<typeof useServerFn<typeof mutateSales>>,
  organizationId: string,
  client: ReturnType<typeof useQueryClient>,
  alsoCrm: boolean,
) {
  return useCallback(
    async (input: {
      operation: SalesOperation;
      id?: string;
      action?: string;
      values?: Record<string, Json>;
      key: string;
    }) => {
      const response = await api({
        data: {
          organizationId,
          operation: input.operation,
          id: input.id,
          action: input.action ?? "",
          values: input.values ?? {},
          key: input.key,
        },
      });
      void client.invalidateQueries({ queryKey: ["sales", organizationId] });
      if (alsoCrm) void client.invalidateQueries({ queryKey: ["crm", organizationId] });
      return response;
    },
    [api, client, organizationId, alsoCrm],
  );
}

/** Colunas que devem ser formatadas como dinheiro, independente da área. */
export const isMoneyColumn = (column: string): boolean =>
  (MONEY_COLUMNS as readonly string[]).includes(column);

/** Linhas e total de uma listagem, com os filtros que o servidor entende. */
export function useSalesList(
  organizationId: string,
  kind: string,
  filters: Record<string, Json>,
) {
  const query = useSalesRead(organizationId, kind, undefined, filters);
  const data = object(query.data);
  return {
    query,
    rows: rows(data.rows),
    total: numeric(data.total),
    data,
  };
}
