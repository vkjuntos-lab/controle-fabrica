// Server functions do módulo Pós-venda (Onda 3).
// Consulta de status de pedidos WA, reemissão fiscal, marcação de envio e devolução.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type PostSaleFilter = "all" | "pending_shipment" | "shipped" | "returns" | "unpaid";

/** Deriva um label de status legível a partir das colunas do payment_link. */
function deriveStatus(r: any) {
  if (r.return_requested_at) return "return_requested";
  if (r.shipped_at) return "shipped";
  if (r.fulfilled_at && r.sale_id) return "stock_baixa";
  if (r.status === "paid" || r.paid_at) return "paid";
  if (r.confirmation_sent_at) return "link_sent";
  return "link_created";
}

export const listPostSaleOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { store_id: string; filter?: PostSaleFilter; search?: string }) =>
    z.object({
      store_id: z.string().uuid(),
      filter: z.enum(["all", "pending_shipment", "shipped", "returns", "unpaid"]).optional(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    let q = supabase
      .from("payment_links")
      .select(
        "id,code,amount,paid_amount,status,description,items,fulfillment,wa_conversation_id,sale_id,paid_at,fulfilled_at,shipped_at,tracking_code,carrier,return_requested_at,return_reason,confirmation_sent_at,customer_id,created_at",
      )
      .eq("store_id", data.store_id)
      .not("wa_conversation_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(150);

    if (data.filter === "pending_shipment") {
      q = q.eq("status", "paid").is("shipped_at", null).is("return_requested_at", null);
    } else if (data.filter === "shipped") {
      q = q.not("shipped_at", "is", null);
    } else if (data.filter === "returns") {
      q = q.not("return_requested_at", "is", null);
    } else if (data.filter === "unpaid") {
      q = q.neq("status", "paid");
    }
    if (data.search) {
      q = q.ilike("code", `%${data.search.trim()}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const orders = (rows ?? []).map((r: any) => ({ ...r, derived_status: deriveStatus(r) }));
    return { orders };
  });

export const getPostSaleOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { link_id: string }) =>
    z.object({ link_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: row, error } = await supabase
      .from("payment_links")
      .select("*")
      .eq("id", data.link_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pedido não encontrado");
    return { order: { ...row, derived_status: deriveStatus(row) } };
  });

/** Marca o pedido como enviado, salva rastreio e notifica no WhatsApp. */
export const markOrderShipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { link_id: string; tracking_code?: string; carrier?: string }) =>
    z.object({
      link_id: z.string().uuid(),
      tracking_code: z.string().max(80).optional(),
      carrier: z.string().max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { markShipped } = await import("@/lib/posvenda.server");
    return await markShipped(data.link_id, data.tracking_code ?? null, data.carrier ?? null);
  });

/** Solicita reemissão do documento fiscal do pedido (inclui na fila de contingência). */
export const reissueFiscalForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { link_id: string }) =>
    z.object({ link_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { reissueFiscal } = await import("@/lib/posvenda.server");
    return await reissueFiscal(data.link_id);
  });

/** Abre um pedido de devolução/troca — grava motivo e transfere para atendente humano. */
export const openReturnRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { link_id: string; reason: string }) =>
    z.object({ link_id: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { openReturn } = await import("@/lib/posvenda.server");
    return await openReturn(data.link_id, data.reason);
  });
