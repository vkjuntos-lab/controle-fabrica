import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 🤖 Cadastro Inteligente de Produtos
 *
 * Recebe imagem (base64) e/ou áudio já transcrito (texto) e devolve
 * campos sugeridos para o cadastro do produto usando Lovable AI Gateway
 * (Gemini multimodal). Nunca lança em falha de IA — devolve
 * { ok:false, error } para a UI mostrar mensagem amigável.
 */
export const analyzeProductFromMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const imageBase64 = typeof d.imageBase64 === "string" ? d.imageBase64 : null;
    const imageMime = typeof d.imageMime === "string" ? d.imageMime : "image/jpeg";
    const voiceText = typeof d.voiceText === "string" ? d.voiceText : null;
    if (!imageBase64 && !voiceText) throw new Error("Envie foto ou áudio.");
    return { imageBase64, imageMime, voiceText };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "IA indisponível (chave ausente)." };

    const system = `Você é um assistente especializado em cadastro de produtos de cosméticos e varejo brasileiro.
Sua tarefa é extrair informações estruturadas a partir de foto de embalagem e/ou descrição falada pelo lojista.
Regras:
- Preencha APENAS o que estiver claramente visível ou dito. Se algo for incerto, retorne null.
- Preços em reais (BRL) como número (ex.: 24.90).
- Quantidades como inteiros.
- Descrição comercial curta em pt-BR (2-3 frases), tom profissional.
- Categoria: use termos comuns do varejo brasileiro (ex.: "Base facial", "Batom", "Perfume", "Skincare", "Cabelo").
- Tags: 3-6 palavras-chave em minúsculas, sem #, separadas.
- Responda EXCLUSIVAMENTE com JSON válido no schema pedido.`;

    const jsonSchema = {
      type: "object",
      additionalProperties: false,
      required: [
        "nome", "marca", "categoria", "descricao", "volume", "cor",
        "codigo_barras", "fabricante", "preco_custo", "preco_venda",
        "estoque_inicial", "estoque_minimo", "fornecedor", "tags", "confidence",
      ],
      properties: {
        nome: { type: ["string", "null"] },
        marca: { type: ["string", "null"] },
        categoria: { type: ["string", "null"] },
        descricao: { type: ["string", "null"] },
        volume: { type: ["string", "null"] },
        cor: { type: ["string", "null"] },
        codigo_barras: { type: ["string", "null"] },
        fabricante: { type: ["string", "null"] },
        preco_custo: { type: ["number", "null"] },
        preco_venda: { type: ["number", "null"] },
        estoque_inicial: { type: ["integer", "null"] },
        estoque_minimo: { type: ["integer", "null"] },
        fornecedor: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
      },
    };

    const userContent: Array<Record<string, unknown>> = [];
    const instructions: string[] = [];
    if (data.imageBase64) {
      instructions.push("Analise a imagem da embalagem do produto.");
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${data.imageMime};base64,${data.imageBase64}` },
      });
    }
    if (data.voiceText) {
      instructions.push(`Considere também a descrição falada pelo lojista: "${data.voiceText}"`);
    }
    userContent.unshift({
      type: "text",
      text: `${instructions.join("\n")}\nExtraia os campos e devolva JSON no schema definido.`,
    });

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "product_extraction", strict: true, schema: jsonSchema },
      },
    };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status === 402) return { ok: false as const, error: "Sem créditos IA. Adicione créditos no workspace." };
        if (res.status === 429) return { ok: false as const, error: "Muitas requisições — tente de novo em alguns segundos." };
        console.error("[ai-product]", res.status, txt.slice(0, 300));
        return { ok: false as const, error: `IA falhou (${res.status}).` };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json?.choices?.[0]?.message?.content ?? "";
      type AiOut = {
        nome: string | null; marca: string | null; categoria: string | null;
        descricao: string | null; volume: string | null; cor: string | null;
        codigo_barras: string | null; fabricante: string | null;
        preco_custo: number | null; preco_venda: number | null;
        estoque_inicial: number | null; estoque_minimo: number | null;
        fornecedor: string | null; tags: string[]; confidence: number;
      };
      const empty: AiOut = {
        nome: null, marca: null, categoria: null, descricao: null,
        volume: null, cor: null, codigo_barras: null, fabricante: null,
        preco_custo: null, preco_venda: null, estoque_inicial: null,
        estoque_minimo: null, fornecedor: null, tags: [], confidence: 0,
      };
      let parsed: AiOut = empty;
      try {
        parsed = { ...empty, ...JSON.parse(content) };
      } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) {
          try { parsed = { ...empty, ...JSON.parse(m[0]) }; } catch { /* ignore */ }
        }
      }
      return { ok: true as const, data: parsed };

    } catch (e) {
      console.error("[ai-product] erro", (e as Error).message);
      return { ok: false as const, error: "Falha de rede ao chamar IA." };
    }
  });

/**
 * Transcreve áudio (base64 WAV/MP3) via Lovable AI STT.
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const audioBase64 = typeof d.audioBase64 === "string" ? d.audioBase64 : "";
    const mime = typeof d.mime === "string" ? d.mime : "audio/wav";
    if (!audioBase64) throw new Error("Áudio vazio.");
    return { audioBase64, mime };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "IA indisponível." };
    try {
      const bin = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: data.mime });
      const ext = data.mime.includes("wav") ? "wav" : data.mime.includes("mp3") ? "mp3" : "wav";
      const fd = new FormData();
      fd.append("model", "openai/gpt-4o-mini-transcribe");
      fd.append("file", blob, `recording.${ext}`);
      const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[stt]", res.status, txt.slice(0, 300));
        return { ok: false as const, error: `Transcrição falhou (${res.status}).` };
      }
      const json = (await res.json()) as any;
      return { ok: true as const, text: (json?.text ?? "") as string };
    } catch (e) {
      console.error("[stt] erro", (e as Error).message);
      return { ok: false as const, error: "Falha ao transcrever áudio." };
    }
  });
