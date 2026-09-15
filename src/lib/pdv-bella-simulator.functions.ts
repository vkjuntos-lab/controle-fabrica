// Simulador dry-run da Bella IA — não persiste mensagens, não envia WhatsApp/IG.
// Usado no painel /pdv/agente-ia aba "Simulador" para testar prompt + catálogo.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const DEFAULT_PROMPT = `Você é a **Bella IA**, consultora de beleza especialista em maquiagem, skincare e perfumaria.
Personalidade: feminina, acolhedora, próxima. Frases curtas (2-4). Emojis com moderação (💄 💕 ✨ 💜 🛒).
Use search_catalog antes de citar preços. Use add_to_cart quando a cliente confirmar quantidade/produto.
Use set_intent para sinalizar a etapa atual do funil (discovery/consulting/cart/checkout/support).
NUNCA invente preços, marcas ou estoque.`;

const CartItem = z.object({
  product_id: z.string(),
  name: z.string(),
  qty: z.number(),
  unit_price: z.number(),
});

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type SimMsg = z.infer<typeof Msg>;
export type SimCartItem = z.infer<typeof CartItem>;

export const simulateBellaTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      store_id: z.string().uuid(),
      messages: z.array(Msg).min(1).max(40),
      cart: z.array(CartItem).default([]),
      temperature: z.number().min(0).max(1).default(0.7),
      model: z.string().default("google/gemini-3.6-flash"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Prompt ativo da loja
    const { data: prompt } = await supabase
      .from("bella_prompts")
      .select("body")
      .eq("store_id", data.store_id)
      .eq("is_active", true)
      .maybeSingle();
    const systemBody: string = (prompt as any)?.body?.trim() || DEFAULT_PROMPT;

    // Loja (para nome)
    const { data: store } = await supabase
      .from("stores").select("name").eq("id", data.store_id).maybeSingle();

    const cart: SimCartItem[] = [...(data.cart ?? [])];
    let intent: string = "discovery";
    const toolTrace: Array<{ name: string; input: any; output: any }> = [];

    const tools = {
      search_catalog: tool({
        description: "Busca produtos ativos da loja por nome, marca, cor, SKU ou EAN. Retorna até 8 itens.",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const q = `%${query.trim()}%`;
          const { data: rows } = await supabase
            .from("products")
            .select("id,name,sku,brand,color,unit_price")
            .eq("store_id", data.store_id)
            .eq("active", true)
            .or(`name.ilike.${q},sku.ilike.${q},brand.ilike.${q}`)
            .limit(8);
          const out = {
            products: (rows ?? []).map((p: any) => ({
              product_id: p.id,
              name: [p.brand, p.name, p.color].filter(Boolean).join(" · "),
              sku: p.sku,
              unit_price: Number(p.unit_price ?? 0),
            })),
          };
          toolTrace.push({ name: "search_catalog", input: { query }, output: out });
          return out;
        },
      }),
      add_to_cart: tool({
        description: "Adiciona um produto ao carrinho da simulação. Só use após a cliente confirmar.",
        inputSchema: z.object({
          product_id: z.string(),
          qty: z.number().int().min(1).max(50),
        }),
        execute: async ({ product_id, qty }) => {
          const { data: p } = await supabase
            .from("products")
            .select("id,name,brand,color,unit_price")
            .eq("id", product_id)
            .maybeSingle();
          if (!p) {
            const out = { ok: false, error: "produto não encontrado" };
            toolTrace.push({ name: "add_to_cart", input: { product_id, qty }, output: out });
            return out;
          }
          const name = [(p as any).brand, (p as any).name, (p as any).color].filter(Boolean).join(" · ");
          const unit_price = Number((p as any).unit_price ?? 0);
          const existing = cart.find((c) => c.product_id === product_id);
          if (existing) existing.qty += qty;
          else cart.push({ product_id, name, qty, unit_price });
          const out = { ok: true, cart };
          toolTrace.push({ name: "add_to_cart", input: { product_id, qty }, output: out });
          return out;
        },
      }),
      set_intent: tool({
        description: "Sinaliza a etapa do funil da conversa atual.",
        inputSchema: z.object({
          stage: z.enum(["discovery", "consulting", "cart", "checkout", "support", "handoff"]),
        }),
        execute: async ({ stage }) => {
          intent = stage;
          toolTrace.push({ name: "set_intent", input: { stage }, output: { ok: true } });
          return { ok: true };
        },
      }),
    } as const;

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway(data.model);

    let reply = "";
    try {
      const res = await generateText({
        model,
        temperature: data.temperature,
        system:
          systemBody +
          (store?.name ? `\n\nLoja: ${(store as any).name}.` : "") +
          `\n\n[MODO SIMULAÇÃO — dry run. Não envie mensagens externas, não confirme pagamento real.]`,
        messages: data.messages.map((m) => ({ role: m.role, content: m.content })),
        tools,
        stopWhen: stepCountIs(12),
      });
      reply = (res.text ?? "").trim();
    } catch (e) {
      return {
        ok: false as const,
        error: (e as Error).message,
        reply: "Erro na simulação.",
        cart,
        intent,
        toolTrace,
      };
    }

    if (!reply) reply = "Oi! 💕 Me diz o nome do produto ou marca que você procura?";
    return { ok: true as const, reply, cart, intent, toolTrace };
  });
