import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Porta de entrada do módulo de Vendas e logística (MASTER 013).
 *
 * Leitura e escrita passam por RPCs `SECURITY DEFINER` do banco, que validam
 * tenant, permissão, estado e idempotência. O cliente nunca decide regra de
 * negócio: `kind` e `operation` apenas escolhem qual RPC chamar.
 */

const uuid = z.string().uuid();
const values = z.record(z.string(), z.json());

/** `detail` e `dashboard` têm RPC própria; os demais kinds usam `sales_query`. */
const readKinds = [
  "detail",
  "dashboard",
  "orders",
  "reservations",
  "fulfillment",
  "shipments",
  "returns",
  "exceptions",
  "carriers",
  "credits",
  "settings",
  "locations",
  "addresses",
] as const;

/**
 * Operações do gateway `sales_execute`. A lista espelha o `CASE` da RPC: uma
 * operação fora daqui é recusada pelo servidor, e a tela não deve oferecer
 * botão para operação inexistente.
 */
const operations = [
  "save",
  "convert",
  "order",
  "reserve",
  "reservation",
  "fulfillment_create",
  "fulfillment",
  "scan",
  "confirm",
  "pack",
  "shipment_create",
  "dispatch",
  "shipment",
  "return_create",
  "return",
  "exception",
  "carrier",
  "settings",
  "expire",
] as const;

export type SalesOperation = (typeof operations)[number];
export type SalesKind = (typeof readKinds)[number];

export const readSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: uuid,
        kind: z.enum(readKinds),
        id: uuid.optional(),
        filters: values.default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result =
      data.kind === "detail"
        ? await context.supabase.rpc("sales_order_detail", {
            _org: data.organizationId,
            _order: uuid.parse(data.id),
          })
        : data.kind === "dashboard"
          ? await context.supabase.rpc("sales_dashboard", {
              _org: data.organizationId,
              _filters: data.filters,
            })
          : await context.supabase.rpc("sales_query", {
              _org: data.organizationId,
              _kind: data.kind,
              _filters: data.filters,
            });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

/**
 * Escrita sempre pelo gateway `sales_execute`, que exige `key` de idempotência:
 * a mesma chave com o mesmo conteúdo devolve o mesmo resultado, e com conteúdo
 * diferente é recusada. É o que impede pedido duplicado por duplo clique.
 */
export const mutateSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: uuid,
        operation: z.enum(operations),
        id: uuid.optional(),
        action: z.string().max(40).default(""),
        values: values.default({}),
        key: uuid,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("sales_execute", {
      _org: data.organizationId,
      _operation: data.operation,
      _id: (data.id ?? null) as string,
      _action: data.action,
      _data: data.values,
      _key: data.key,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
