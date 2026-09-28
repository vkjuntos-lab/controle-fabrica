import { useCallback, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
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
export function useSalesRead(organizationId: string, kind: string, id?: string, filters: Row = {}) {
  const api = useServerFn(readSales);
  // O filtro entra na chave já serializado: um objeto novo a cada render não
  // provoca nova consulta, e um filtro de verdade diferente provoca.
  const serialized = JSON.stringify(filters);
  return useQuery({
    queryKey: ["sales", organizationId, kind, id, serialized],
    queryFn: () =>
      api({
        data: {
          organizationId,
          kind,
          id,
          filters: JSON.parse(serialized) as Record<string, Json>,
        } as never,
      }),
    enabled: Boolean(organizationId),
  });
}

/**
 * Chave de idempotência derivada do conteúdo.
 *
 * O gateway recusa a mesma chave com conteúdo diferente e devolve o mesmo
 * resultado para a mesma chave com conteúdo igual. A chave enviada é, portanto,
 * a combinação de um identificador de tentativa (renovado quando a tentativa é
 * concluída com sucesso) com o resumo do payload:
 *
 * - reenviar exatamente o mesmo conteúdo deduplica — protege contra duplo
 *   clique e contra resposta perdida depois da gravação;
 * - alterar o conteúdo gera outra chave — o usuário corrige o formulário e a
 *   tentativa nova executa de fato, sem ser barrada pela chave antiga.
 *
 * Renovar a chave no erro seria o caminho perigoso: se o servidor gravou e a
 * resposta não chegou, uma chave nova executaria a operação uma segunda vez.
 */
function payloadDigest(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function useIdempotencyKey() {
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setAttempt(crypto.randomUUID()), []);
  const keyFor = useCallback(
    (payload: unknown) => `${attempt}:${payloadDigest(JSON.stringify(payload ?? null))}`,
    [attempt],
  );
  return { keyFor, renew };
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
  options: { alsoCrm?: boolean; onSuccess?: (data: unknown) => void; onError?: () => void } = {},
): UseMutationResult<unknown, Error, SalesWriteInput> {
  const api = useServerFn(mutateSales);
  const client = useQueryClient();
  const { keyFor, renew } = useIdempotencyKey();
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
          key: keyFor(input),
        },
      }),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ["sales", organizationId] });
      if (alsoCrm) void client.invalidateQueries({ queryKey: ["crm", organizationId] });
      renew();
      onSuccess?.(data);
    },
    onError: () => {
      // A tentativa não vira tentativa nova aqui: a chave continua a mesma para
      // que o reenvio do mesmo conteúdo seja deduplicado pelo gateway.
      onError?.();
    },
  });
}

/** Linhas e total de uma listagem, com os filtros que o servidor entende. */
export function useSalesList(organizationId: string, kind: string, filters: Record<string, Json>) {
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
