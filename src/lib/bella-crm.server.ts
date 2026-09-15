// Server-only: helpers de CRM da Bella IA.
// - classifyCustomer: classifica cliente por comportamento (new / returning / vip / inactive).
// - upsertLead: cria/atualiza um registro em bella_leads a partir de uma conversa.

export type CustomerClass = "new" | "returning" | "vip" | "inactive";

export type ClassifyResult = {
  class: CustomerClass;
  reason: string;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  cashback: number;
  tier: string | null;
};

/**
 * Classifica um cliente com base nas vendas (sales) da loja.
 * Regras (padrão):
 *  - vip: 5+ pedidos OU total gasto >= R$ 1.000 nos últimos 12 meses.
 *  - inactive: já comprou mas não compra há 90+ dias.
 *  - returning: 2+ pedidos.
 *  - new: 0 ou 1 pedido.
 */
export async function classifyCustomer(
  supabaseAdmin: any,
  storeId: string,
  customerId: string | null,
): Promise<ClassifyResult> {
  if (!customerId) {
    return { class: "new", reason: "Sem cadastro", orders_count: 0, total_spent: 0, last_order_at: null, cashback: 0, tier: null };
  }
  const { data: cust } = await supabaseAdmin
    .from("customers")
    .select("id,tier,cashback")
    .eq("id", customerId)
    .maybeSingle();

  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const { data: sales } = await supabaseAdmin
    .from("sales")
    .select("id,total,created_at")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows = (sales as any[]) ?? [];
  const orders_count = rows.length;
  const total_spent = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const last_order_at = rows[0]?.created_at ?? null;
  const cashback = Number((cust as any)?.cashback ?? 0);
  const tier = ((cust as any)?.tier as string | null) ?? null;

  let klass: CustomerClass = "new";
  let reason = "0 pedidos nos últimos 12 meses";
  const daysSinceLast = last_order_at
    ? Math.floor((Date.now() - new Date(last_order_at).getTime()) / (24 * 3600 * 1000))
    : null;

  if (orders_count >= 5 || total_spent >= 1000) {
    klass = "vip";
    reason = `Cliente VIP (${orders_count} pedidos • R$ ${total_spent.toFixed(2)})`;
  } else if (daysSinceLast !== null && daysSinceLast >= 90) {
    klass = "inactive";
    reason = `Inativa há ${daysSinceLast} dias`;
  } else if (orders_count >= 2) {
    klass = "returning";
    reason = `Já comprou ${orders_count}x`;
  } else if (orders_count === 1) {
    klass = "returning";
    reason = "1 pedido registrado";
  }

  return { class: klass, reason, orders_count, total_spent, last_order_at, cashback, tier };
}

/**
 * Cria ou atualiza um lead da Bella IA vinculado a uma conversa.
 * Idempotente por (store_id, contact, channel).
 */
export async function upsertLead(
  supabaseAdmin: any,
  params: {
    store_id: string;
    conversation_id: string;
    customer_id: string | null;
    channel: "whatsapp" | "instagram" | "messenger";
    contact: string;
    name?: string | null;
    interest?: string | null;
    stage?: "new" | "qualified" | "negotiating" | "won" | "lost" | "handoff";
    reason?: string | null;
  },
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("bella_leads")
    .select("id, stage, interest, name")
    .eq("store_id", params.store_id)
    .eq("channel", params.channel)
    .eq("contact", params.contact)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const patch: Record<string, unknown> = { last_interaction_at: now, updated_at: now };
    if (params.customer_id) patch.customer_id = params.customer_id;
    if (params.name && !(existing as any).name) patch.name = params.name;
    if (params.interest) patch.interest = params.interest;
    if (params.stage) patch.stage = params.stage;
    if (params.reason) patch.reason = params.reason;
    await supabaseAdmin.from("bella_leads").update(patch).eq("id", (existing as any).id);
    return (existing as any).id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("bella_leads")
    .insert({
      store_id: params.store_id,
      conversation_id: params.conversation_id,
      customer_id: params.customer_id,
      channel: params.channel,
      contact: params.contact,
      name: params.name ?? null,
      interest: params.interest ?? null,
      stage: params.stage ?? "new",
      reason: params.reason ?? null,
      last_interaction_at: now,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[bella-crm] upsertLead:", error.message);
    return null;
  }
  return (created as any).id;
}
