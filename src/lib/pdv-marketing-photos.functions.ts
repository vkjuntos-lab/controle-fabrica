import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 📸 Ajuste de fotos com IA para marketplaces e redes sociais.
 * Usa Lovable AI Gateway (Nano Banana 2) para editar/recompor a foto
 * conforme o preset escolhido. Retorna base64 PNG.
 */

export type MarketingPresetKey =
  | "marketplace_1x1"
  | "instagram_feed_1x1"
  | "reels_stories_9x16"
  | "whatsapp_status_9x16"
  | "og_1200x630";

export const MARKETING_PRESETS: Record<
  MarketingPresetKey,
  { label: string; size: string; ratio: string; prompt: string }
> = {
  marketplace_1x1: {
    label: "Marketplace (1000×1000, fundo branco)",
    size: "1000x1000",
    ratio: "1:1",
    prompt:
      "Reenquadre a imagem em proporção 1:1 (quadrada). Remova completamente o fundo e substitua por BRANCO PURO (#FFFFFF), sem sombras artificiais coloridas — apenas uma sombra sutil natural sob o produto. Produto centralizado, ocupando cerca de 85% do quadro, foco nítido, iluminação neutra de estúdio, sem textos, sem logotipos adicionais, sem marca d'água, sem props. Padrão Mercado Livre / Shopee / Amazon.",
  },
  instagram_feed_1x1: {
    label: "Instagram Feed (1080×1080)",
    size: "1080x1080",
    ratio: "1:1",
    prompt:
      "Reenquadre em 1:1 e crie uma composição elegante para Instagram Feed: fundo estilizado com paleta suave e sofisticada (nudes, rosé, dourado ou tons pastel), leve gradiente e um toque de superfície de mármore ou tecido. Produto em destaque, iluminação premium de beleza, sombras suaves. Sem textos.",
  },
  reels_stories_9x16: {
    label: "Reels / Stories (1080×1920)",
    size: "1080x1920",
    ratio: "9:16",
    prompt:
      "Reenquadre em 9:16 vertical para Reels/Stories. Fundo cinematográfico com bokeh delicado ou gradiente moderno em tons de beleza (nude/rose/dourado). Produto centralizado na metade superior, deixando o terço inferior mais limpo para futuras legendas. Iluminação estilo editorial. Sem textos.",
  },
  whatsapp_status_9x16: {
    label: "WhatsApp Status / Facebook Story (1080×1920)",
    size: "1080x1920",
    ratio: "9:16",
    prompt:
      "Reenquadre em 9:16 vertical. Fundo limpo com leve gradiente colorido chamativo (mas sofisticado) para WhatsApp Status. Produto grande, com destaque visual forte. Iluminação vibrante. Sem textos.",
  },
  og_1200x630: {
    label: "Open Graph / Compartilhamento (1200×630)",
    size: "1200x630",
    ratio: "1.91:1",
    prompt:
      "Reenquadre em proporção 1.91:1 (horizontal, formato de compartilhamento de link). Produto à esquerda ou centralizado, com bastante espaço negativo à direita para eventual título. Fundo sofisticado em gradiente ou cena de beleza minimalista. Sem textos.",
  },
};

type EnhanceInput = {
  imageBase64: string;
  imageMime: string;
  preset: MarketingPresetKey;
  productName?: string | null;
  brand?: string | null;
};

export const enhanceMarketingPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const imageBase64 = typeof d.imageBase64 === "string" ? d.imageBase64 : "";
    const imageMime = typeof d.imageMime === "string" ? d.imageMime : "image/jpeg";
    const preset = d.preset as MarketingPresetKey;
    if (!imageBase64) throw new Error("Imagem obrigatória.");
    if (!preset || !(preset in MARKETING_PRESETS)) throw new Error("Preset inválido.");
    return {
      imageBase64,
      imageMime,
      preset,
      productName: typeof d.productName === "string" ? d.productName : null,
      brand: typeof d.brand === "string" ? d.brand : null,
    } as EnhanceInput;
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key)
      return { ok: false as const, error: "IA indisponível (chave ausente)." };

    const preset = MARKETING_PRESETS[data.preset];
    const context =
      data.productName || data.brand
        ? `Produto: ${data.productName ?? ""}${data.brand ? ` — Marca: ${data.brand}` : ""}.`
        : "";
    const instruction = `${context}\n\n${preset.prompt}\n\nDimensões-alvo: ${preset.size} (proporção ${preset.ratio}). PRESERVE fielmente o produto original (formato, cor, rótulo, embalagem, texto do rótulo). Não invente elementos no produto.`;

    try {
      const resp = await fetch(
        "https://ai.gateway.lovable.dev/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: instruction },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${data.imageMime};base64,${data.imageBase64}`,
                    },
                  },
                ],
              },
            ],
            modalities: ["image", "text"],
          }),
        },
      );

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        return {
          ok: false as const,
          error: `Falha da IA (${resp.status}): ${txt.slice(0, 300)}`,
        };
      }
      const json = (await resp.json()) as {
        data?: { b64_json?: string }[];
      };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64)
        return { ok: false as const, error: "IA não retornou imagem." };
      return { ok: true as const, imageBase64: b64, mime: "image/png" };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Erro desconhecido na IA.",
      };
    }
  });

/**
 * 🛠️ Rotinas de Limpeza e Otimização
 */
export const cleanupMarketingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ 
    storeId: z.string().uuid(),
    olderThanDays: z.number().default(30)
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const date = new Date();
    date.setDate(date.getDate() - data.olderThanDays);
    
    // Remove registros antigos do histórico que não são o 'current'
    const { error } = await (supabase as any)
      .from("marketing_history")
      .delete()
      .eq("store_id", data.storeId)
      .eq("is_current", false)
      .lt("created_at", date.toISOString());

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * 📦 Exportação em Lote Consolidada
 */
export const consolidateProductMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await (supabase as any)
      .from("marketing_history")
      .select("*")
      .eq("product_id", data.productId)
      .eq("is_current", true);
      
    if (error) throw new Error(error.message);
    return { count: rows?.length || 0, versions: rows };
  });

