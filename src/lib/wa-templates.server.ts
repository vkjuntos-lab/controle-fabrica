// Server-only. Sincroniza templates aprovados na Meta (WhatsApp Cloud API)
// e retorna um payload normalizado para persistir em wa_templates.

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: Array<{
    type: string; // HEADER | BODY | FOOTER | BUTTONS
    text?: string;
    format?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
};

export type NormalizedTemplate = {
  meta_template_id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  header_text: string | null;
  body_text: string | null;
  footer_text: string | null;
  buttons: any[];
  variables_count: number;
  raw: MetaTemplate;
};

function countVars(text: string | undefined | null): number {
  if (!text) return 0;
  const m = text.match(/\{\{\s*\d+\s*\}\}/g);
  return m ? m.length : 0;
}

export function normalizeMetaTemplate(t: MetaTemplate): NormalizedTemplate {
  const comps = t.components ?? [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const btns = comps.find((c) => c.type === "BUTTONS");
  return {
    meta_template_id: t.id,
    name: t.name,
    language: t.language,
    category: t.category ?? null,
    status: t.status ?? "UNKNOWN",
    header_text: header?.text ?? null,
    body_text: body?.text ?? null,
    footer_text: footer?.text ?? null,
    buttons: btns?.buttons ?? [],
    variables_count: countVars(body?.text),
    raw: t,
  };
}

/**
 * Busca templates aprovados na Meta Graph API.
 * Requer: token com permissão whatsapp_business_management e WABA ID.
 */
export async function fetchMetaTemplates(params: {
  wabaId: string;
  token: string;
}): Promise<NormalizedTemplate[]> {
  const url = `https://graph.facebook.com/v20.0/${params.wabaId}/message_templates?limit=200&fields=id,name,language,category,status,components`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${params.token}` } });
  const body = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) {
    const err = body?.error ?? {};
    const msg = err.message ?? `HTTP ${r.status}`;
    // 190 = OAuthException (token inválido/expirado)
    if (err.code === 190 || /access token|session has expired/i.test(String(msg))) {
      throw new Error(
        "O Token da Meta (Cloud API) expirou ou é inválido. Gere um novo token no painel da Meta e salve em Configurações do WhatsApp para sincronizar os templates.",
      );
    }
    throw new Error(`meta_templates_fetch_failed: ${msg}`);
  }

  const list: MetaTemplate[] = body?.data ?? [];
  return list.map(normalizeMetaTemplate);
}
