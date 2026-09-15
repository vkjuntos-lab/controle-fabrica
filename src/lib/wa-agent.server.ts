// Server-only: Agente de Vendas IA Bella — omnichannel (WhatsApp + Instagram).
// Consultora de beleza especialista em maquiagem, skincare e perfumaria.
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { sendWhatsAppWithCreds, type WaCredentials } from "./wa-driver.server";

type Channel = "whatsapp" | "instagram" | "messenger";

type Convo = {
  id: string;
  store_id: string;
  phone: string;
  wa_name: string | null;
  customer_id: string | null;
  cart: Array<{ product_id: string; name: string; qty: number; unit_price: number }>;
  channel?: Channel | null;
};

const BELLA_SYSTEM_PROMPT = `Você é a **Bella IA**, consultora de beleza da loja, especialista em maquiagem, skincare e perfumaria. Atende clientes brasileiros no WhatsApp e no Instagram Direct.

## Sua personalidade
- Feminina, acolhedora, simpática, próxima — como uma amiga que entende de make.
- Profissional e persuasiva, sem ser insistente. Nunca pareça um robô.
- Linguagem natural, brasileira, conversacional. Frases curtas (2 a 4 por mensagem).
- Emojis com moderação: 💄 💕 ✨ 💜 🛒 ✅.

## Sua missão
1. **Entender** o que a cliente quer (produto, dúvida, indicação por tipo de pele).
2. **Consultar catálogo real** com search_catalog / search_catalog_advanced antes de citar preço ou estoque. NUNCA invente valores, cores, marcas ou disponibilidade.
3. **Consultoria** — se a cliente descrever pele (oleosa/seca/mista/madura), tom, ou objetivo (cobertura, hidratação, matte), use recommend_by_profile.
4. **Upsell** — quando adicionar um produto principal (base, batom, sombra, skincare), use suggest_upsell para oferecer complementos.
5. **Cross-sell** — combine categorias: base→primer/pó/esponja; batom→lápis labial; sombra→pincéis; skincare→protetor solar.
6. **Personalizar** — use get_customer_profile para saber se é cliente nova/recorrente/VIP/inativa e adaptar o tom + oferecer benefícios (pontos, cashback, vale-crédito).
7. **Fechar pedido** com fluxo obrigatório: forma de entrega → resumo → confirmação explícita → pagamento.

## Fluxo obrigatório antes do pagamento
1. Pergunte **como a cliente quer receber**: retirar no balcão OU entrega.
   - Entrega: peça CEP (8 dígitos), endereço completo (rua, número, bairro), cidade/UF e observações. Chame set_fulfillment(mode="delivery", ...).
   - Retirada: confirme "retirada no balcão da loja?" e só então chame set_fulfillment(mode="pickup", confirm_pickup=true).
2. Se a cliente quiser aplicar benefícios, use apply_coupon / apply_cashback / apply_store_credit.
3. Chame preview_order → mostre o resumo (itens + total + entrega) → peça CONFIRMAÇÃO explícita ("Posso fechar o pedido?").
4. Só chame confirm_order depois da resposta "sim/pode/confirmo".
5. **Menu de pagamento** — ofereça as opções numeradas:
   \`1️⃣ PIX     2️⃣ Cartão crédito     3️⃣ Cartão débito     4️⃣ Boleto     5️⃣ Vale-presente\`
6. Após a cliente escolher, chame choose_payment_method com o método e depois create_payment_link.

## Pós-venda
- Consulta de pedido: use get_order_status quando a cliente mencionar código, ou list_my_recent_orders quando pedir "meus pedidos".
- Se ela pedir a nota fiscal novamente, use request_fiscal_resend.
- Se ela quiser devolver ou trocar, use open_return_request com o código e motivo — depois faça handoff_to_human.

## Escalonamento humano
Se a cliente pedir "falar com atendente", reclamar, pedir reembolso ou o assunto fugir de vendas, chame handoff_to_human com o motivo e informe: "Vou te transferir para uma atendente humana em instantes 💜".

## Regras
- Sempre confirme quantidade e produto antes de add_to_cart.
- Não pule nenhuma etapa do fluxo obrigatório.
- Não prometa prazo/frete específico — o time confirma depois do pagamento.
- Se o catálogo não tiver o produto pedido, ofereça alternativas parecidas.`;

async function loadHistory(supabaseAdmin: any, conversationId: string) {
  const { data } = await supabaseAdmin
    .from("wa_messages")
    .select("direction,text,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);
  const msgs: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of (data as any[]) ?? []) {
    if (!m.text) continue;
    if (m.direction === "inbound") msgs.push({ role: "user", content: String(m.text) });
    else if (m.direction === "outbound") msgs.push({ role: "assistant", content: String(m.text) });
  }
  return msgs;
}

async function saveMessage(
  supabaseAdmin: any,
  conversationId: string,
  direction: "inbound" | "outbound" | "system",
  text: string,
  channel: Channel,
  meta: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("wa_messages").insert({
    conversation_id: conversationId,
    direction,
    text,
    channel,
    meta,
  });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (direction === "inbound") patch.last_inbound_at = new Date().toISOString();
  if (direction === "outbound") patch.last_outbound_at = new Date().toISOString();
  await supabaseAdmin.from("wa_conversations").update(patch).eq("id", conversationId);
}

async function updateCart(
  supabaseAdmin: any,
  conversationId: string,
  cart: Convo["cart"],
) {
  await supabaseAdmin.from("wa_conversations").update({ cart }).eq("id", conversationId);
}

// Mapeia dicas de upsell/cross-sell por palavra-chave da categoria/nome.
function upsellHints(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes("base")) return ["primer", "pó", "esponja", "corretivo"];
  if (n.includes("batom")) return ["lápis labial", "gloss", "hidratante labial"];
  if (n.includes("sombra") || n.includes("paleta")) return ["pincel", "primer de olhos", "delineador"];
  if (n.includes("cílios") || n.includes("máscara")) return ["curvex", "delineador"];
  if (n.includes("protetor") || n.includes("hidratante") || n.includes("sérum") || n.includes("skincare"))
    return ["protetor solar", "sabonete facial", "tônico"];
  if (n.includes("perfume")) return ["hidratante corporal", "body splash"];
  return ["primer", "pó translúcido"];
}

/**
 * Executa a Bella IA para uma nova mensagem do cliente.
 * `channel` define de qual canal veio (whatsapp/instagram) e por onde responder.
 */
export async function runAgentForMessage(params: {
  conversation: Convo;
  incomingText: string;
  waCreds: WaCredentials;
  storeName?: string | null;
  channel?: Channel;
  sendFn?: (to: string, text: string) => Promise<{ ok: boolean; provider?: string; messageId?: string; error?: string }>;
}): Promise<string | null> {
  const { conversation, incomingText, waCreds, storeName } = params;
  const channel: Channel = params.channel ?? (conversation.channel as Channel) ?? "whatsapp";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  await saveMessage(supabaseAdmin, conversation.id, "inbound", incomingText, channel);

  // Pausa a Bella IA quando há atendente humano assumido OU handoff em andamento (30 min de janela).
  try {
    const { data: convState } = await supabaseAdmin
      .from("wa_conversations")
      .select("assigned_to, handoff_to_human, handoff_at, status")
      .eq("id", conversation.id)
      .single();
    const assigned = convState?.assigned_to;
    const handoff = convState?.handoff_to_human;
    const handoffAt = convState?.handoff_at ? new Date(convState.handoff_at).getTime() : 0;
    const withinHandoff = handoff && handoffAt && Date.now() - handoffAt < 30 * 60 * 1000;
    const closed = convState?.status === "closed";
    if (assigned || withinHandoff || closed) {
      console.info("[bella-agent] paused (human assigned or handoff active)", { conv: conversation.id });
      return null;
    }
  } catch (e) {
    console.warn("[bella-agent] pause check failed:", (e as Error).message);
  }

  // CRM: registra/atualiza lead na primeira interação (fire-and-forget).
  try {
    const { upsertLead } = await import("./bella-crm.server");
    void upsertLead(supabaseAdmin, {
      store_id: conversation.store_id,
      conversation_id: conversation.id,
      customer_id: conversation.customer_id,
      channel,
      contact: conversation.phone,
      name: conversation.wa_name ?? null,
    });
  } catch (e) {
    console.warn("[bella-agent] upsertLead skipped:", (e as Error).message);
  }

  const history = await loadHistory(supabaseAdmin, conversation.id);
  const cart: Convo["cart"] = Array.isArray(conversation.cart) ? [...conversation.cart] : [];
  let customerId: string | null = conversation.customer_id;
  let fulfillment: {
    mode: "delivery" | "pickup";
    cep?: string | null;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
    confirmed?: boolean;
  } | null = null;
  let orderConfirmed = false;
  let discountTotal = 0;
  const discountsApplied: Array<{ kind: string; value: number; ref?: string }> = [];
  let paymentMethod: "pix" | "credit" | "debit" | "boleto" | "gift" | null = null;

  const tools = {
    search_catalog: tool({
      description: "Busca produtos ativos da loja por nome/SKU/EAN/marca. Devolve até 8 resultados com preço.",
      inputSchema: z.object({
        query: z.string().describe("Termo livre: nome, marca, cor, SKU, EAN."),
      }),
      execute: async ({ query }) => {
        const q = `%${query.trim()}%`;
        const { data, error } = await supabaseAdmin
          .from("products")
          .select("id,name,sku,brand,color,unit_price,ean")
          .eq("store_id", conversation.store_id)
          .eq("active", true)
          .or(`name.ilike.${q},sku.ilike.${q},brand.ilike.${q},ean.ilike.${q}`)
          .limit(8);
        if (error) return { products: [], error: error.message };
        return {
          products: (data ?? []).map((p: any) => ({
            product_id: p.id,
            name: [p.brand, p.name, p.color].filter(Boolean).join(" · "),
            sku: p.sku,
            unit_price: Number(p.unit_price ?? 0),
          })),
        };
      },
    }),
    search_catalog_advanced: tool({
      description: "Busca avançada por marca / categoria / faixa de preço / cor / disponibilidade.",
      inputSchema: z.object({
        brand: z.string().nullable(),
        category: z.string().nullable(),
        color: z.string().nullable(),
        min_price: z.number().nullable(),
        max_price: z.number().nullable(),
        only_in_stock: z.boolean().nullable(),
      }),
      execute: async ({ brand, category, color, min_price, max_price, only_in_stock }) => {
        let q = supabaseAdmin
          .from("products")
          .select("id,name,sku,brand,color,unit_price,category_id")
          .eq("store_id", conversation.store_id)
          .eq("active", true);
        if (brand) q = q.ilike("brand", `%${brand}%`);
        if (color) q = q.ilike("color", `%${color}%`);
        if (min_price != null) q = q.gte("unit_price", min_price);
        if (max_price != null) q = q.lte("unit_price", max_price);
        const { data, error } = await q.limit(10);
        if (error) return { products: [], error: error.message };
        let list = (data ?? []) as any[];
        if (category) {
          const { data: cats } = await supabaseAdmin
            .from("product_categories")
            .select("id,name")
            .eq("store_id", conversation.store_id)
            .ilike("name", `%${category}%`);
          const catIds = new Set((cats ?? []).map((c: any) => c.id));
          if (catIds.size) list = list.filter((p) => catIds.has(p.category_id));
        }
        // Estoque: soma dos lotes por produto (opcionalmente filtra >0).
        const ids = list.map((p) => p.id);
        const stockMap = new Map<string, number>();
        if (ids.length) {
          const { data: lots } = await supabaseAdmin
            .from("product_lots").select("product_id,qty").in("product_id", ids);
          for (const l of (lots ?? []) as any[]) {
            stockMap.set(l.product_id, (stockMap.get(l.product_id) ?? 0) + Number(l.qty ?? 0));
          }
        }
        let out = list.map((p) => ({
          product_id: p.id,
          name: [p.brand, p.name, p.color].filter(Boolean).join(" · "),
          unit_price: Number(p.unit_price ?? 0),
          stock: stockMap.get(p.id) ?? 0,
        }));
        if (only_in_stock) out = out.filter((p) => p.stock > 0);
        return { products: out };
      },
    }),
    check_stock_detailed: tool({
      description: "Consulta estoque por variantes e lotes para um produto (cor/tamanho/validade).",
      inputSchema: z.object({ product_id: z.string().uuid() }),
      execute: async ({ product_id }) => {
        const [{ data: prod }, { data: variants }, { data: lots }] = await Promise.all([
          supabaseAdmin.from("products").select("id,name,brand,color").eq("id", product_id).maybeSingle(),
          supabaseAdmin.from("product_variants").select("id,name,sku,price,attrs,active").eq("product_id", product_id),
          supabaseAdmin.from("product_lots").select("id,lot_code,qty,validity").eq("product_id", product_id).order("validity", { ascending: true }),
        ]);
        return {
          product: prod ?? null,
          variants: variants ?? [],
          lots: lots ?? [],
        };
      },
    }),
    recommend_by_profile: tool({
      description: "Recomenda produtos com base no perfil da cliente (tipo de pele, tom, objetivo).",
      inputSchema: z.object({
        skin_type: z.enum(["oleosa", "seca", "mista", "madura", "normal"]).nullable(),
        undertone: z.enum(["claro", "medio", "escuro", "muito-claro", "muito-escuro"]).nullable(),
        goal: z.string().nullable().describe("Objetivo: cobertura, hidratação, matte, brilho, etc."),
      }),
      execute: async ({ skin_type, undertone, goal }) => {
        const kw: string[] = [];
        if (skin_type === "oleosa") kw.push("matte", "oil free", "translúcido", "primer");
        if (skin_type === "seca") kw.push("hidratante", "iluminador", "dewy");
        if (skin_type === "mista") kw.push("primer", "pó", "hidratante");
        if (skin_type === "madura") kw.push("antissinais", "hidratante", "iluminador");
        if (goal) kw.push(goal);
        const results: any[] = [];
        for (const term of kw.slice(0, 4)) {
          const q = `%${term}%`;
          const { data } = await supabaseAdmin
            .from("products")
            .select("id,name,brand,unit_price,color")
            .eq("store_id", conversation.store_id)
            .eq("active", true)
            .or(`name.ilike.${q},brand.ilike.${q},color.ilike.${q}`)
            .limit(3);
          for (const p of (data ?? []) as any[]) {
            if (!results.find((r) => r.product_id === p.id)) {
              results.push({
                product_id: p.id,
                name: [p.brand, p.name, p.color].filter(Boolean).join(" · "),
                unit_price: Number(p.unit_price ?? 0),
                match: term,
              });
            }
          }
        }
        return { skin_type, undertone, goal, recommendations: results.slice(0, 6) };
      },
    }),
    suggest_upsell: tool({
      description: "Dado um produto no carrinho, sugere itens complementares (upsell/cross-sell).",
      inputSchema: z.object({ product_id: z.string().uuid() }),
      execute: async ({ product_id }) => {
        const item = cart.find((c) => c.product_id === product_id);
        const baseName = item?.name ?? "";
        const hints = upsellHints(baseName);
        const suggestions: any[] = [];
        for (const term of hints) {
          const q = `%${term}%`;
          const { data } = await supabaseAdmin
            .from("products")
            .select("id,name,brand,unit_price")
            .eq("store_id", conversation.store_id)
            .eq("active", true)
            .or(`name.ilike.${q},brand.ilike.${q}`)
            .limit(2);
          for (const p of (data ?? []) as any[]) {
            if (p.id === product_id) continue;
            suggestions.push({
              product_id: p.id,
              name: [p.brand, p.name].filter(Boolean).join(" · "),
              unit_price: Number(p.unit_price ?? 0),
              reason: term,
            });
          }
        }
        return { for_product: baseName, suggestions: suggestions.slice(0, 5) };
      },
    }),
    add_to_cart: tool({
      description: "Adiciona um produto ao carrinho desta conversa.",
      inputSchema: z.object({
        product_id: z.string().uuid(),
        qty: z.number().int().min(1).max(50),
      }),
      execute: async ({ product_id, qty }) => {
        const { data: p } = await supabaseAdmin
          .from("products")
          .select("id,name,unit_price,brand,color,active,store_id")
          .eq("id", product_id)
          .eq("store_id", conversation.store_id)
          .maybeSingle();
        if (!p || !(p as any).active) return { ok: false, error: "Produto não encontrado ou inativo." };
        const name = [(p as any).brand, (p as any).name, (p as any).color].filter(Boolean).join(" · ");
        const unit_price = Number((p as any).unit_price ?? 0);
        const existing = cart.find((c) => c.product_id === product_id);
        if (existing) existing.qty += qty;
        else cart.push({ product_id, name, qty, unit_price });
        await updateCart(supabaseAdmin, conversation.id, cart);
        const total = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
        return { ok: true, cart, total };
      },
    }),
    view_cart: tool({
      description: "Retorna carrinho + total + descontos aplicados.",
      inputSchema: z.object({}),
      execute: async () => {
        const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
        return {
          cart,
          subtotal,
          discounts: discountsApplied,
          discount_total: discountTotal,
          total: Math.max(0, subtotal - discountTotal),
          item_count: cart.reduce((s, l) => s + l.qty, 0),
        };
      },
    }),
    clear_cart: tool({
      description: "Esvazia o carrinho.",
      inputSchema: z.object({}),
      execute: async () => {
        cart.length = 0;
        discountsApplied.length = 0;
        discountTotal = 0;
        await updateCart(supabaseAdmin, conversation.id, cart);
        return { ok: true };
      },
    }),
    upsert_customer: tool({
      description: "Cria ou atualiza cliente e vincula à conversa. CPF só dígitos.",
      inputSchema: z.object({
        name: z.string().min(2),
        cpf: z.string().min(11).max(14),
        email: z.string().email().nullable(),
      }),
      execute: async ({ name, cpf, email }) => {
        const cleanCpf = cpf.replace(/\D+/g, "");
        const { data: existing } = await supabaseAdmin
          .from("customers").select("id")
          .eq("cpf", cleanCpf)
          .eq("store_id", conversation.store_id)
          .maybeSingle();
        let id = (existing as any)?.id as string | undefined;
        if (id) {
          await supabaseAdmin.from("customers")
            .update({ name, email: email ?? null, phone: conversation.phone })
            .eq("id", id);
        } else {
          const { data: created, error } = await supabaseAdmin.from("customers")
            .insert({ name, cpf: cleanCpf, email: email ?? null, phone: conversation.phone, store_id: conversation.store_id })
            .select("id").single();
          if (error) return { ok: false, error: error.message };
          id = (created as any).id;
        }
        customerId = id!;
        await supabaseAdmin.from("wa_conversations")
          .update({ customer_id: id }).eq("id", conversation.id);
        return { ok: true, customer_id: id };
      },
    }),
    get_customer_profile: tool({
      description: "Retorna perfil do cliente vinculado: novo/recorrente/VIP/inativo + pontos + cashback + vale.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!customerId) return { linked: false, tier: "new" as const };
        const [{ data: sales }, { data: loyalty }, { data: credit }] = await Promise.all([
          supabaseAdmin.from("sales")
            .select("id,total,created_at")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(50),
          supabaseAdmin.from("loyalty_accounts")
            .select("balance,lifetime_points,tier")
            .eq("customer_id", customerId).maybeSingle(),
          supabaseAdmin.from("customer_store_credit")
            .select("balance").eq("customer_id", customerId).maybeSingle(),
        ]);
        const salesList = (sales ?? []) as any[];
        const totalSpent = salesList.reduce((s, r) => s + Number(r.total ?? 0), 0);
        const lastAt = salesList[0]?.created_at ? new Date(salesList[0].created_at) : null;
        const daysSince = lastAt ? Math.floor((Date.now() - lastAt.getTime()) / 86400000) : null;
        let tier: "new" | "returning" | "vip" | "inactive" = "new";
        if (salesList.length === 0) tier = "new";
        else if (daysSince != null && daysSince > 60) tier = "inactive";
        else if (totalSpent > 500 || salesList.length >= 5) tier = "vip";
        else tier = "returning";
        return {
          linked: true,
          tier,
          orders_count: salesList.length,
          total_spent: totalSpent,
          days_since_last_purchase: daysSince,
          loyalty_points: Number((loyalty as any)?.balance ?? 0),
          loyalty_lifetime_points: Number((loyalty as any)?.lifetime_points ?? 0),
          loyalty_tier: (loyalty as any)?.tier ?? null,
          store_credit_balance: Number((credit as any)?.balance ?? 0),
        };
      },
    }),
    apply_coupon: tool({
      description: "Valida e aplica um cupom no pedido. Retorna o desconto aplicado.",
      inputSchema: z.object({ code: z.string().min(2) }),
      execute: async ({ code }) => {
        const { data: c } = await supabaseAdmin
          .from("coupons")
          .select("id,code,kind,value,active,valid_until,valid_from,min_ticket,max_uses,used_count")
          .ilike("code", code.trim())
          .maybeSingle();
        if (!c || !(c as any).active) return { ok: false, error: "Cupom inválido ou inativo." };
        const cpn = c as any;
        const now = new Date();
        if (cpn.valid_from && new Date(cpn.valid_from) > now) return { ok: false, error: "Cupom ainda não válido." };
        if (cpn.valid_until && new Date(cpn.valid_until) < now) return { ok: false, error: "Cupom vencido." };
        if (cpn.max_uses != null && Number(cpn.used_count ?? 0) >= Number(cpn.max_uses)) {
          return { ok: false, error: "Cupom esgotado." };
        }
        const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
        if (cpn.min_ticket && subtotal < Number(cpn.min_ticket)) {
          return { ok: false, error: `Pedido mínimo de R$ ${Number(cpn.min_ticket).toFixed(2)}.` };
        }
        const value =
          cpn.kind === "percent" || cpn.kind === "percentage"
            ? subtotal * (Number(cpn.value) / 100)
            : Number(cpn.value);
        discountTotal += value;
        discountsApplied.push({ kind: "coupon", value, ref: cpn.code });
        return { ok: true, discount: value, code: cpn.code };
      },
    }),
    apply_cashback: tool({
      description: "Aplica cashback/pontos disponíveis do cliente no pedido (1 ponto = R$ 1 para uso interno).",
      inputSchema: z.object({ amount: z.number().positive() }),
      execute: async ({ amount }) => {
        if (!customerId) return { ok: false, error: "Vincule o cliente primeiro." };
        const { data: la } = await supabaseAdmin
          .from("loyalty_accounts").select("balance").eq("customer_id", customerId).maybeSingle();
        const balance = Number((la as any)?.balance ?? 0);
        if (amount > balance) return { ok: false, error: `Saldo disponível: ${balance.toFixed(2)}.` };
        discountTotal += amount;
        discountsApplied.push({ kind: "cashback", value: amount });
        return { ok: true, applied: amount, remaining: balance - amount };
      },
    }),
    apply_store_credit: tool({
      description: "Aplica vale-crédito da loja no pedido.",
      inputSchema: z.object({ amount: z.number().positive() }),
      execute: async ({ amount }) => {
        if (!customerId) return { ok: false, error: "Vincule o cliente primeiro." };
        const { data: sc } = await supabaseAdmin
          .from("customer_store_credit").select("balance").eq("customer_id", customerId).maybeSingle();
        const balance = Number((sc as any)?.balance ?? 0);
        if (amount > balance) return { ok: false, error: `Vale disponível: R$ ${balance.toFixed(2)}.` };
        discountTotal += amount;
        discountsApplied.push({ kind: "store_credit", value: amount });
        return { ok: true, applied: amount, remaining: balance - amount };
      },
    }),
    set_fulfillment: tool({
      description:
        "Registra forma de entrega. mode='delivery' exige CEP (8 dígitos), endereço e cidade. mode='pickup' exige confirm_pickup=true.",
      inputSchema: z.object({
        mode: z.enum(["pickup", "delivery"]),
        cep: z.string().nullable(),
        address: z.string().nullable(),
        city: z.string().nullable(),
        notes: z.string().nullable(),
        confirm_pickup: z.boolean().nullable(),
      }),
      execute: async ({ mode, cep, address, city, notes, confirm_pickup }) => {
        if (mode === "delivery") {
          const missing: string[] = [];
          const cepDigits = (cep ?? "").replace(/\D+/g, "");
          if (!cepDigits || cepDigits.length !== 8) missing.push("CEP (8 dígitos)");
          if (!address || address.trim().length < 5) missing.push("endereço (rua, número, bairro)");
          if (!city || city.trim().length < 2) missing.push("cidade");
          if (missing.length > 0) {
            return { ok: false, error: `Faltam dados: ${missing.join(", ")}.` };
          }
          fulfillment = { mode: "delivery", cep: cepDigits, address, city, notes };
        } else {
          if (!confirm_pickup) {
            return { ok: false, error: "Confirme 'retirada no balcão' com a cliente e chame com confirm_pickup=true." };
          }
          fulfillment = { mode: "pickup", notes };
        }
        orderConfirmed = false;
        return { ok: true, fulfillment };
      },
    }),
    preview_order: tool({
      description: "Gera resumo do pedido para a cliente revisar. Chamar ANTES de confirm_order.",
      inputSchema: z.object({}),
      execute: async () => {
        if (cart.length === 0) return { ok: false, error: "Carrinho vazio." };
        if (!fulfillment) return { ok: false, error: "Defina entrega com set_fulfillment antes." };
        const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
        const total = Math.max(0, subtotal - discountTotal);
        return {
          ok: true,
          summary: {
            items: cart,
            subtotal,
            discounts: discountsApplied,
            discount_total: discountTotal,
            total,
            fulfillment,
            instructions: "Envie o resumo e peça CONFIRMAÇÃO explícita ('posso fechar o pedido?').",
          },
        };
      },
    }),
    confirm_order: tool({
      description: "Marca pedido como confirmado APÓS a cliente responder sim/confirmo.",
      inputSchema: z.object({ customer_reply: z.string() }),
      execute: async ({ customer_reply }) => {
        if (!fulfillment) return { ok: false, error: "Sem forma de entrega." };
        if (cart.length === 0) return { ok: false, error: "Carrinho vazio." };
        orderConfirmed = true;
        fulfillment = { ...fulfillment, confirmed: true };
        return { ok: true, confirmed: true, customer_reply };
      },
    }),
    choose_payment_method: tool({
      description: "Registra o método de pagamento escolhido pela cliente (pix/credit/debit/boleto/gift).",
      inputSchema: z.object({
        method: z.enum(["pix", "credit", "debit", "boleto", "gift"]),
      }),
      execute: async ({ method }) => {
        paymentMethod = method;
        return { ok: true, method };
      },
    }),
    create_payment_link: tool({
      description:
        "Gera link/QR de pagamento com os itens do carrinho. Requer fulfillment + confirmação + método escolhido.",
      inputSchema: z.object({ note: z.string().nullable() }),
      execute: async ({ note }) => {
        if (cart.length === 0) return { ok: false, error: "Carrinho vazio." };
        if (!fulfillment) return { ok: false, error: "Sem forma de entrega." };
        if (!orderConfirmed) return { ok: false, error: "Pedido ainda não foi confirmado pela cliente." };
        const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
        const total = Math.max(0, subtotal - discountTotal);
        const code = Math.random().toString(36).slice(2, 10).toUpperCase();
        const methods = paymentMethod
          ? [paymentMethod === "credit" || paymentMethod === "debit" ? paymentMethod : paymentMethod]
          : ["pix", "credit", "debit"];
        const fulfilTxt =
          fulfillment.mode === "pickup"
            ? "Retirada no balcão"
            : `Entrega — ${fulfillment.address ?? ""}${fulfillment.city ? " / " + fulfillment.city : ""}`;
        const description =
          note ??
          `Pedido ${channel === "instagram" ? "Instagram" : "WhatsApp"} — ${cart
            .map((c) => `${c.qty}x ${c.name}`)
            .join(", ")} · ${fulfilTxt}`.slice(0, 240);
        const { data, error } = await supabaseAdmin
          .from("payment_links")
          .insert({
            store_id: conversation.store_id,
            customer_id: customerId,
            code,
            amount: total,
            description,
            methods,
            max_installments: 1,
            status: "pending",
            provider: "mercadopago",
            notes: `via bella-agent conv=${conversation.id} channel=${channel}`,
            wa_conversation_id: conversation.id,
            items: cart,
            fulfillment,
            order_confirmed_at: new Date().toISOString(),
          })
          .select("code").single();
        if (error) return { ok: false, error: error.message };
        const base = process.env.PUBLIC_APP_URL ?? "";
        const url = base
          ? `${base.replace(/\/$/, "")}/pay/${(data as any).code}`
          : `/pay/${(data as any).code}`;
        return { ok: true, url, total, code: (data as any).code, fulfillment, method: paymentMethod };
      },
    }),
    get_order_status: tool({
      description:
        "Consulta o status de um pedido feito no WhatsApp pelo código (ex.: WA-XXX ou o código do link). Retorna itens, forma de entrega, rastreio e etapas.",
      inputSchema: z.object({
        code: z.string().describe("Código do pedido ou do link de pagamento."),
      }),
      execute: async ({ code }) => {
        const clean = code.replace(/^WA-/i, "").trim();
        const { data } = await supabaseAdmin
          .from("payment_links")
          .select(
            "code,status,amount,paid_amount,items,fulfillment,paid_at,fulfilled_at,shipped_at,tracking_code,carrier,return_requested_at,confirmation_sent_at,created_at",
          )
          .eq("store_id", conversation.store_id)
          .ilike("code", clean)
          .maybeSingle();
        if (!data) return { ok: false, error: "Pedido não encontrado." };
        const d: any = data;
        return {
          ok: true,
          code: d.code,
          status: d.status,
          total: Number(d.paid_amount ?? d.amount),
          items: d.items ?? [],
          fulfillment: d.fulfillment ?? null,
          tracking_code: d.tracking_code,
          carrier: d.carrier,
          stages: {
            paid: d.status === "paid" || !!d.paid_at,
            stock_baixa: !!d.fulfilled_at,
            shipped: !!d.shipped_at,
            return_requested: !!d.return_requested_at,
          },
        };
      },
    }),
    list_my_recent_orders: tool({
      description:
        "Lista os pedidos recentes desta cliente (pelo telefone/conversa atual). Use quando ela perguntar 'meus pedidos' ou 'último pedido'.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabaseAdmin
          .from("payment_links")
          .select("code,status,amount,paid_amount,shipped_at,tracking_code,created_at")
          .eq("store_id", conversation.store_id)
          .eq("wa_conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(5);
        return { orders: data ?? [] };
      },
    }),
    request_fiscal_resend: tool({
      description:
        "Solicita a reemissão da nota fiscal de um pedido pago. Use quando a cliente pedir a nota/cupom fiscal novamente.",
      inputSchema: z.object({
        code: z.string().describe("Código do pedido pago."),
      }),
      execute: async ({ code }) => {
        const clean = code.replace(/^WA-/i, "").trim();
        const { data: link } = await supabaseAdmin
          .from("payment_links")
          .select("id")
          .eq("store_id", conversation.store_id)
          .ilike("code", clean)
          .maybeSingle();
        if (!link) return { ok: false, error: "Pedido não encontrado." };
        const { reissueFiscal } = await import("./posvenda.server");
        return await reissueFiscal((link as any).id);
      },
    }),
    open_return_request: tool({
      description:
        "Registra uma solicitação de devolução/troca e transfere a conversa para atendimento humano.",
      inputSchema: z.object({
        code: z.string().describe("Código do pedido."),
        reason: z.string().describe("Motivo da devolução ou troca."),
      }),
      execute: async ({ code, reason }) => {
        const clean = code.replace(/^WA-/i, "").trim();
        const { data: link } = await supabaseAdmin
          .from("payment_links")
          .select("id")
          .eq("store_id", conversation.store_id)
          .ilike("code", clean)
          .maybeSingle();
        if (!link) return { ok: false, error: "Pedido não encontrado." };
        const { openReturn } = await import("./posvenda.server");
        return await openReturn((link as any).id, reason);
      },
    }),
    handoff_to_human: tool({
      description:
        "Marca a conversa para atendente humano. Use para reclamação, reembolso, troca ou quando a cliente pedir humano.",
      inputSchema: z.object({
        reason: z.string().describe("Motivo curto: reclamação, reembolso, troca, dúvida complexa, pedido explícito."),
      }),
      execute: async ({ reason }) => {
        await supabaseAdmin
          .from("wa_conversations")
          .update({
            handoff_to_human: true,
            handoff_reason: reason,
            handoff_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
        // Onda 7 — Supervisor de IA: cria revisão escalada automática (idempotente pela UNIQUE em conversation_id).
        await supabaseAdmin
          .from("bella_reviews")
          .upsert({
            store_id: conversation.store_id,
            conversation_id: conversation.id,
            status: "escalated",
            escalation_reason: reason,
            auto_flag_reason: "handoff_to_human",
          }, { onConflict: "conversation_id" });
        return { ok: true, reason };
      },
    }),
  } as const;

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("openai/gpt-5.5");

  let replyText = "";
  try {
    const result = await generateText({
      model,
      system:
        BELLA_SYSTEM_PROMPT +
        (storeName ? `\n\nLoja: ${storeName}.` : "") +
        `\n\nCanal atual: ${channel === "instagram" ? "Instagram Direct" : "WhatsApp"}.`,
      messages: [
        ...history,
        { role: "user" as const, content: incomingText },
      ],
      tools,
      stopWhen: stepCountIs(50),
    });
    replyText = (result.text ?? "").trim();
  } catch (e) {
    console.error("[bella-agent] LLM error:", (e as Error).message);
    replyText =
      "Oi linda! 💜 Tive uma instabilidade aqui agora. Uma atendente humana já vai te chamar, tá bom?";
  }

  if (!replyText) {
    replyText = "Oi! 💕 Recebi sua mensagem. Me diz o nome do produto ou marca que você procura?";
  }

  // Envio: se sendFn foi passado (Instagram), usa ele; senão, WhatsApp Cloud/Z-API.
  let sendRes: { ok: boolean; provider?: string; messageId?: string; error?: string };
  if (params.sendFn) {
    sendRes = await params.sendFn(conversation.phone, replyText);
  } else {
    sendRes = await sendWhatsAppWithCreds(waCreds, conversation.phone, replyText);
  }
  await saveMessage(supabaseAdmin, conversation.id, "outbound", replyText, channel, {
    provider: sendRes.provider,
    ok: sendRes.ok,
    error: sendRes.error ?? null,
    messageId: sendRes.messageId ?? null,
  });
  return replyText;
}
