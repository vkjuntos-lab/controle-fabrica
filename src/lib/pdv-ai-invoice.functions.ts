import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 🧾 OCR de NF-e / DANFE / Nota fiscal por foto.
 *
 * Recebe uma foto (ou várias, uma por chamada) da nota e devolve os itens
 * extraídos para o lojista revisar e importar em lote.
 */
export type InvoiceItem = {
  descricao: string | null;
  codigo_barras: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
  lote: string | null;
  validade: string | null; // MM/YYYY
  marca: string | null;
  categoria: string | null;
};

export type InvoiceResult = {
  fornecedor: string | null;
  cnpj: string | null;
  numero: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  itens: InvoiceItem[];
  confidence: number;
};

export const analyzeInvoiceFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const imageBase64 = typeof d.imageBase64 === "string" ? d.imageBase64 : "";
    const imageMime = typeof d.imageMime === "string" ? d.imageMime : "image/jpeg";
    if (!imageBase64) throw new Error("Envie uma foto da nota.");
    return { imageBase64, imageMime };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "IA indisponível." };

    const system = `Você é um assistente de OCR de nota fiscal brasileira (NF-e/NFC-e/DANFE) para varejo de cosméticos.
Extraia da imagem TODOS os itens da nota: descrição, código de barras (EAN se visível),
quantidade, unidade, valor unitário e valor total. Se houver lote ou validade impressos, capture-os.
Deixe null quando algo não estiver legível. Valores em BRL como número. Datas no formato MM/YYYY para validade e DD/MM/YYYY para emissão.
Retorne EXCLUSIVAMENTE JSON válido no schema pedido.`;

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["fornecedor", "cnpj", "numero", "data_emissao", "valor_total", "itens", "confidence"],
      properties: {
        fornecedor: { type: ["string", "null"] },
        cnpj: { type: ["string", "null"] },
        numero: { type: ["string", "null"] },
        data_emissao: { type: ["string", "null"] },
        valor_total: { type: ["number", "null"] },
        confidence: { type: "number" },
        itens: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "descricao", "codigo_barras", "quantidade", "unidade",
              "valor_unitario", "valor_total", "lote", "validade",
              "marca", "categoria",
            ],
            properties: {
              descricao: { type: ["string", "null"] },
              codigo_barras: { type: ["string", "null"] },
              quantidade: { type: ["number", "null"] },
              unidade: { type: ["string", "null"] },
              valor_unitario: { type: ["number", "null"] },
              valor_total: { type: ["number", "null"] },
              lote: { type: ["string", "null"] },
              validade: { type: ["string", "null"] },
              marca: { type: ["string", "null"] },
              categoria: { type: ["string", "null"] },
            },
          },
        },
      },
    };

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia os itens desta nota fiscal e devolva JSON conforme o schema." },
            { type: "image_url", image_url: { url: `data:${data.imageMime};base64,${data.imageBase64}` } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "invoice_extraction", strict: true, schema },
      },
    };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 402) return { ok: false as const, error: "Sem créditos IA." };
        if (res.status === 429) return { ok: false as const, error: "Muitas requisições. Tente novamente em segundos." };
        const txt = await res.text().catch(() => "");
        console.error("[ai-invoice]", res.status, txt.slice(0, 300));
        return { ok: false as const, error: `IA falhou (${res.status}).` };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json?.choices?.[0]?.message?.content ?? "";
      const empty: InvoiceResult = {
        fornecedor: null, cnpj: null, numero: null, data_emissao: null,
        valor_total: null, itens: [], confidence: 0,
      };
      let parsed: InvoiceResult = empty;
      try { parsed = { ...empty, ...JSON.parse(content) }; }
      catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = { ...empty, ...JSON.parse(m[0]) }; } catch { /* ignore */ } }
      }
      return { ok: true as const, data: parsed };
    } catch (e) {
      console.error("[ai-invoice] erro", (e as Error).message);
      return { ok: false as const, error: "Falha de rede ao chamar IA." };
    }
  });

/**
 * 💬 Assistente conversacional para cadastro de produto.
 *
 * Recebe um histórico de mensagens curto (usuário + assistente) e devolve:
 *  - reply: mensagem de texto para o chat
 *  - fields: campos do produto extraídos até agora (parcial)
 *  - done: true quando a IA considera o cadastro completo o suficiente
 */
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatFields = {
  nome: string | null; marca: string | null; categoria: string | null;
  descricao: string | null; volume: string | null; cor: string | null;
  codigo_barras: string | null; preco_custo: number | null;
  preco_venda: number | null; estoque_inicial: number | null;
  estoque_minimo: number | null; fornecedor: string | null; tags: string[];
};

export const chatProductAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const messages = Array.isArray(d.messages) ? d.messages : [];
    const fields = (d.fields ?? {}) as Record<string, unknown>;
    return {
      messages: messages.slice(-20) as ChatMessage[],
      fields: fields as Partial<ChatFields>,
    };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "IA indisponível." };

    const system = `Você é um assistente conversacional em pt-BR para cadastrar produtos de cosméticos em um PDV.
Objetivo: coletar dados de UM produto conversando naturalmente com o lojista.
Faça perguntas curtas, uma de cada vez. Comece pelo nome/marca. Depois preço custo, preço venda, estoque, código de barras (opcional), volume/cor, categoria.
Nunca peça o que já foi respondido. Quando tiver dados suficientes (mínimo: nome + preço venda), marque done=true e faça um breve resumo.
Retorne JSON EXATO no schema. Não invente valores.`;

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["reply", "fields", "done"],
      properties: {
        reply: { type: "string" },
        done: { type: "boolean" },
        fields: {
          type: "object",
          additionalProperties: false,
          required: [
            "nome", "marca", "categoria", "descricao", "volume", "cor",
            "codigo_barras", "preco_custo", "preco_venda",
            "estoque_inicial", "estoque_minimo", "fornecedor", "tags",
          ],
          properties: {
            nome: { type: ["string", "null"] },
            marca: { type: ["string", "null"] },
            categoria: { type: ["string", "null"] },
            descricao: { type: ["string", "null"] },
            volume: { type: ["string", "null"] },
            cor: { type: ["string", "null"] },
            codigo_barras: { type: ["string", "null"] },
            preco_custo: { type: ["number", "null"] },
            preco_venda: { type: ["number", "null"] },
            estoque_inicial: { type: ["integer", "null"] },
            estoque_minimo: { type: ["integer", "null"] },
            fornecedor: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    };

    const contextMsg = {
      role: "system" as const,
      content: `Estado atual dos campos coletados (mescle com novas informações; não sobrescreva com null):\n${JSON.stringify(data.fields ?? {})}`,
    };

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        contextMsg,
        ...data.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "chat_product", strict: true, schema },
      },
    };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 402) return { ok: false as const, error: "Sem créditos IA." };
        if (res.status === 429) return { ok: false as const, error: "Muitas requisições." };
        const txt = await res.text().catch(() => "");
        console.error("[ai-chat]", res.status, txt.slice(0, 300));
        return { ok: false as const, error: `IA falhou (${res.status}).` };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json?.choices?.[0]?.message?.content ?? "";
      const emptyFields: ChatFields = {
        nome: null, marca: null, categoria: null, descricao: null, volume: null,
        cor: null, codigo_barras: null, preco_custo: null, preco_venda: null,
        estoque_inicial: null, estoque_minimo: null, fornecedor: null, tags: [],
      };
      let parsed: { reply: string; fields: ChatFields; done: boolean } = {
        reply: "Desculpe, não entendi. Pode repetir?", fields: emptyFields, done: false,
      };
      try {
        const raw = JSON.parse(content);
        parsed = {
          reply: String(raw.reply ?? ""),
          fields: { ...emptyFields, ...(data.fields ?? {}), ...(raw.fields ?? {}) },
          done: !!raw.done,
        };
      } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            const raw = JSON.parse(m[0]);
            parsed = {
              reply: String(raw.reply ?? content),
              fields: { ...emptyFields, ...(data.fields ?? {}), ...(raw.fields ?? {}) },
              done: !!raw.done,
            };
          } catch { /* ignore */ }
        }
      }
      return { ok: true as const, data: parsed };
    } catch (e) {
      console.error("[ai-chat] erro", (e as Error).message);
      return { ok: false as const, error: "Falha de rede ao chamar IA." };
    }
  });
