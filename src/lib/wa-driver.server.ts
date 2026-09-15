// Server-only. Sends WhatsApp messages using per-store credentials.
// Providers: 'wa_link' (link manual), 'zapi' (Z-API), 'cloud' (Meta Cloud API)

export type WaCredentials = {
  provider: string;
  from_number?: string | null;
  active?: boolean | null;
  cloud_token?: string | null;
  cloud_phone_id?: string | null;
  cloud_template_name?: string | null;
  cloud_template_lang?: string | null;
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_client_token?: string | null;
};

export type WaErrorDetails = {
  http_status?: number;
  message?: string;
  code?: number | string;
  error_subcode?: number | string;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  type?: string;
  details?: string;
  raw?: any;
};

export type WaSendResult = {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
  errorDetails?: WaErrorDetails;
};

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function extractMetaError(body: any, httpStatus: number): WaErrorDetails {
  const err = body?.error ?? {};
  return {
    http_status: httpStatus,
    message: err.message,
    code: err.code,
    error_subcode: err.error_subcode,
    error_user_title: err.error_user_title,
    error_user_msg: err.error_user_msg,
    fbtrace_id: err.fbtrace_id,
    type: err.type,
    details: err.error_data?.details ?? err.error_data?.messaging_product ?? undefined,
    raw: body,
  };
}

function describeMetaError(details: WaErrorDetails): string {
  const parts = [details.message, details.error_user_title, details.error_user_msg].filter(Boolean);
  const meta = [
    details.code !== undefined ? `code ${details.code}` : null,
    details.error_subcode !== undefined ? `subcode ${details.error_subcode}` : null,
    details.fbtrace_id ? `trace ${details.fbtrace_id}` : null,
  ].filter(Boolean);
  return [...parts, details.details, meta.length ? `(${meta.join(", ")})` : null].filter(Boolean).join(" — ");
}

/**
 * Envia mensagem usando credenciais de uma loja.
 * Se `useTemplate` = true e provider = 'cloud', usa template pré-aprovado
 * (necessário fora da janela de 24h).
 */
export async function sendWhatsAppWithCreds(
  creds: WaCredentials,
  phone: string,
  message: string,
  opts: { useTemplate?: boolean; templateParams?: string[] } = {},
): Promise<WaSendResult> {
  const provider = creds.provider ?? "wa_link";
  const to = normalizePhone(phone);
  if (!to) return { ok: false, provider, error: "phone_empty" };
  if (to.length < 12 || to.length > 15) {
    return { ok: false, provider, error: "Telefone de destino inválido. Use DDI + DDD + número, ex: 5517999999999." };
  }
  const from = normalizePhone(creds.from_number);
  if (from && from === to) {
    return { ok: false, provider, error: "O teste não pode ser enviado para o próprio número da loja. Informe um número de cliente diferente, com DDI." };
  }
  if (!message?.trim() && !opts.useTemplate) return { ok: false, provider, error: "message_empty" };

  try {
    if (provider === "zapi") {
      const instance = creds.zapi_instance_id || process.env.ZAPI_INSTANCE_ID;
      const token = creds.zapi_token || process.env.ZAPI_TOKEN;
      const clientToken = creds.zapi_client_token || process.env.ZAPI_CLIENT_TOKEN;
      if (!instance || !token) return { ok: false, provider, error: "zapi_credentials_missing" };
      const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (clientToken) headers["Client-Token"] = clientToken;
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ phone: to, message }) });
      const body = (await r.json().catch(() => ({}))) as any;
      if (!r.ok) return { ok: false, provider, error: `zapi_${r.status}: ${JSON.stringify(body).slice(0, 200)}` };
      return { ok: true, provider, messageId: body?.messageId ?? body?.id };
    }

    if (provider === "cloud") {
      const token = creds.cloud_token || process.env.WHATSAPP_TOKEN;
      const phoneId = creds.cloud_phone_id || process.env.WHATSAPP_PHONE_ID;
      if (!token || !phoneId) return { ok: false, provider, error: "cloud_credentials_missing" };
      const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

      let payload: any;
      if (opts.useTemplate && creds.cloud_template_name) {
        const params = opts.templateParams ?? [message];
        payload = {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: creds.cloud_template_name,
            language: { code: creds.cloud_template_lang || "pt_BR" },
            components: params.length > 0 ? [{
              type: "body",
              parameters: params.map((p) => ({ type: "text", text: p })),
            }] : [],
          },
        };
      } else {
        payload = {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        };
      }

      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await r.json().catch(() => ({}))) as any;
      if (!r.ok) {
        const details = extractMetaError(body, r.status);
        return { ok: false, provider, error: `cloud_${r.status}: ${describeMetaError(details)}`, errorDetails: details };
      }
      const messageId = body?.messages?.[0]?.id;
      return { ok: true, provider, messageId };
    }

    return { ok: false, provider: "wa_link", error: "wa_link_no_send" };
  } catch (e) {
    return { ok: false, provider, error: (e as Error).message };
  }
}

/** Legacy signature — busca env global (compat com código antigo). */
export async function sendWhatsApp(
  provider: string,
  phone: string,
  message: string,
): Promise<WaSendResult> {
  return sendWhatsAppWithCreds({ provider }, phone, message);
}
