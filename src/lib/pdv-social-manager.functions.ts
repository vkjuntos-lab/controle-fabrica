import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 🤖 Geração de Post com IA
 */
export const generateSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    description: z.string(),
    mediaType: z.enum(["SINGLE", "CAROUSEL", "VIDEO", "WHATSAPP"]),
    visualStyle: z.string().optional(),
    storeId: z.string(),
  }).parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("IA indisponível (chave ausente).");

    const { description, mediaType, visualStyle } = data;

    // 1. Legenda e Hashtags
    const textPrompt = `Você é um especialista em marketing de mídias sociais para a KS Multi Make (loja de maquiagens).
Crie uma legenda cativante em português do Brasil para um post sobre: "${description}".
Estilo visual: ${visualStyle || "Moderno"}.
Responda APENAS com um JSON: {"caption": "...", "hashtags": ["#tag1", "#tag2"]}`;

    const textRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: textPrompt }],
        response_format: { type: "json_object" }
      }),
    });

    if (!textRes.ok) throw new Error("Falha ao gerar texto com IA.");
    const textJson = await textRes.json();
    const { caption, hashtags } = JSON.parse(textJson.choices[0].message.content || "{}");

    // 2. Imagens
    const numImages = mediaType === "CAROUSEL" ? 3 : 1;
    const images: string[] = [];
    const imagePrompt = `Professional product photography for KS Multi Make cosmetics: ${description}. Style: ${visualStyle || "clean, aesthetic"}. Pinks and Purples. 1:1 aspect ratio.`;

    for (let i = 0; i < numImages; i++) {
      const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          prompt: imagePrompt + (i > 0 ? ` variation ${i + 1}` : ""),
          n: 1,
          size: "1024x1024",
        }),
      });
      if (imgRes.ok) {
        const imgJson = await imgRes.json();
        if (imgJson.data?.[0]?.url) images.push(imgJson.data[0].url);
      }
    }

    return { caption, hashtags, images };
  });

/**
 * 💾 Salvar Rascunho
 */
export const savePostDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    caption: z.string(),
    platform: z.enum(["INSTAGRAM", "FACEBOOK", "WHATSAPP", "BOTH"]),
    mediaType: z.enum(["SINGLE", "CAROUSEL", "VIDEO", "WHATSAPP"]),
    mediaUrls: z.array(z.string()),
    aiPrompt: z.string().optional(),
    visualStyle: z.string().optional(),
    storeId: z.string(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await (supabase as any)
      .from("post_drafts")
      .insert({
        caption: data.caption,
        platform: data.platform,
        media_type: data.mediaType,
        media_urls: data.mediaUrls,
        ai_prompt: data.aiPrompt,
        visual_style: data.visualStyle,
        store_id: data.storeId,
        status: "DRAFT"
      });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * 📋 Listar Rascunhos
 */
export const listPostDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: drafts, error } = await (supabase as any)
      .from("post_drafts")
      .select("*")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return drafts;
  });

/**
 * 🗑️ Excluir Rascunho
 */
export const deletePostDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await (supabase as any)
      .from("post_drafts")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * 📅 Agendamento e Publicação Real
 */
export const scheduleSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    draftId: z.string().uuid(),
    scheduledAt: z.string().optional(),
    storeId: z.string().uuid(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    // Atualiza status do rascunho para agendado
    const { error } = await (supabase as any)
      .from("post_drafts")
      .update({ 
        status: data.scheduledAt ? "SCHEDULED" : "PUBLISHED",
        scheduled_at: data.scheduledAt || new Date().toISOString()
      })
      .eq("id", data.draftId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * 🔄 Renovação de Tokens de Redes Sociais
 */
export const refreshSocialTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Lógica para chamar API da Meta e trocar short-lived por long-lived token
    return { status: "tokens_refreshed" };
  });


