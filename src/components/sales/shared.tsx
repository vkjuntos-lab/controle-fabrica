import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { readSales, mutateSales, type SalesOperation } from "@/lib/sales/sales.functions";
import { MONEY_COLUMNS } from "@/lib/sales/constants";
import type { Json } from "@/integrations/supabase/types";

/**
 * Infraestrutura de leitura e escrita das telas de Vendas.
 *
 * Toda leitura vai para `readSales` e toda escrita para `mutateSales`, que por
 * sua vez chamam as RPCs do banco. A invalidação é sempre do prefixo
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

/** Colunas formatadas como dinheiro, independentemente da área. */
export const isMoneyColumn = (column: string): boolean =>
  (MONEY_COLUMNS as readonly string[]).includes(column);

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
          kind,
          id,
          filters: stable as Record<string, Json>,
        } as never,
      }),
    enabled: Boolean(organizationId),
  });
}

/**
 * Chave de idempotência por tentativa.
 *
 * O gateway recusa a mesma chave com conteúdo diferente. A chave vale por
 * tentativa: nasce nova quando o diálogo abre e é renovada quando a tentativa
 * termina. Uma tentativa que falhou antes de gravar não consumou a chave, e
 * outra que gravou precisa de uma chave nova para não ser tratada como repetição.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setKey(crypto.randomUUID()), []);
  return { key, renew };
}

export type SalesWriteInput = {
  operation: SalesOperation;
  id?: string;
  action?: string;
  values: Record<string, Json>;
};

/**
 * Escrita padronizada do módulo: envia pelo gateway, renova a chave ao terminar
 * e invalida as leituras de vendas — e do CRM, quando o fato também aparece lá.
 */
export function useSalesWrite(
  organizationId: string,
  options: { alsoCrm?: boolean; onSuccess?: () => void; onError?: () => void } = {},
): UseMutationResult<unknown, Error, SalesWriteInput> {
  const api = useServerFn(mutateSales);
  const client = useQueryClient();
  const { key, renew } = useIdempotencyKey();
  const { alsoCrm = false, onSuccess, onError } = options;
  return useMutation({
    mutationFn: async (input: SalesWriteInput) =>
      api({
        data: {
          organizationId,
          operation: input.operation,
          id: input.id,
          action: input.action ?? "",
          values: input.values,
          key,
        },
      }),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ["sales", organizationId] });
      if (alsoCrm) void client.invalidateQueries({ queryKey: ["crm", organizationId] });
      renew();
      onSuccess?.(data);
    },
    onError: () => {
      renew();
      onError?.();
    },
  });
}

/** Linhas e total de uma listagem, com os filtros que o servidor entende. */
export function useSalesList(
  organizationId: string,
  kind: string,
  filters: Record<string, Json>,
) {
  const query = useSalesRead(organizationId, kind, undefined, filters);
  const data = object(query.data);
  return { query, rows: rows(data.rows), total: numeric(data.total), data };
}

/**
 * Seletor de referência com o rótulo correto de cada tipo.
 *
 * O `Picker` do CRM mostra `name`/`legal_name`/`sku`; uma proposta e uma
 * transportadora não têm nenhum desses campos e apareceriam como "—" para o
 * usuário, sem forma de distinguir uma opção da outra. Aqui cada `kind` declara
 * de onde vem o texto.
 */
export type PickerKind = "quotes" | "companies" | "variants" | "price_tables";

export const PICKER_LABEL: Record<PickerKind, (row: Row) => string> = {
  quotes: (row) => `Proposta ${text(row.quote_number)} · versão ${text(row.version)}`,
  companies: (row) => text(row.trade_name) || text(row.legal_name) || text(row.id),
  variants: (row) =>
    [text(row.sku) || text(row.id), text(row.name)].filter(Boolean).join(" · ") || text(row.id),
  price_tables: (row) => text(row.name) || text(row.code) || text(row.id),
};
