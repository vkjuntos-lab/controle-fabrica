// Provider Focus NFe — SERVER-ONLY. Se FOCUS_NFE_TOKEN não estiver setado, opera em modo simulação (homologação).
import type { FiscalProvider, EmitInput, EmitResult, CancelInput, CancelResult, FiscalEnv } from "./types";

const BASE_HOMOLOG = "https://homologacao.focusnfe.com.br";
const BASE_PROD = "https://api.focusnfe.com.br";

function baseUrl(env: FiscalEnv) { return env === "producao" ? BASE_PROD : BASE_HOMOLOG; }
function authHeader() {
  const t = process.env.FOCUS_NFE_TOKEN;
  if (!t) return null;
  return "Basic " + Buffer.from(`${t}:`).toString("base64");
}

// Gera chave fake determinística (44 dígitos) para modo simulação
function fakeChave(ref: string, numero: number): string {
  const raw = `${Date.now()}${numero}${ref}`.replace(/\D/g, "");
  return (raw + "0".repeat(44)).slice(0, 44);
}

function buildFocusPayload(input: EmitInput, kind: "nfce" | "nfe") {
  return {
    natureza_operacao: kind === "nfce" ? "Venda ao consumidor" : "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    cnpj_emitente: input.emitter.cnpj.replace(/\D/g, ""),
    nome_emitente: input.emitter.razao_social,
    uf_emitente: input.emitter.uf,
    regime_tributario: input.emitter.regime === "simples" ? 1 : input.emitter.regime === "presumido" ? 2 : 3,
    presenca_comprador: kind === "nfce" ? 1 : 9,
    modalidade_frete: 9,
    local_destino: 1,
    cpf_destinatario: input.customer?.cpf?.replace(/\D/g, "") || undefined,
    cnpj_destinatario: input.customer?.cnpj?.replace(/\D/g, "") || undefined,
    nome_destinatario: input.customer?.name || undefined,
    items: input.items.map((it, idx) => ({
      numero_item: idx + 1,
      codigo_produto: it.code,
      descricao: it.description,
      cfop: it.cfop,
      unidade_comercial: it.unit,
      quantidade_comercial: it.qty,
      valor_unitario_comercial: it.unit_price,
      valor_bruto: Number((it.qty * it.unit_price).toFixed(2)),
      unidade_tributavel: it.unit,
      quantidade_tributavel: it.qty,
      valor_unitario_tributavel: it.unit_price,
      ncm: it.ncm || "00000000",
      cest: it.cest || undefined,
      origem: it.origem,
      icms_situacao_tributaria: it.csosn || it.cst_icms || "102",
      icms_aliquota: it.icms_aliq,
      pis_situacao_tributaria: "49",
      pis_aliquota: it.pis_aliq,
      cofins_situacao_tributaria: "49",
      cofins_aliquota: it.cofins_aliq,
    })),
    formas_pagamento: input.payments.map((p) => ({
      forma_pagamento: p.method === "dinheiro" ? "01" : p.method === "cartao_credito" ? "03" : p.method === "cartao_debito" ? "04" : p.method === "pix" ? "17" : "99",
      valor_pagamento: p.amount,
    })),
  };
}

export const focusProvider: FiscalProvider = {
  name: "focus",

  async emitNFCe(input) { return emit(input, "nfce"); },
  async emitNFe(input) { return emit(input, "nfe"); },

  async cancelDoc(input: CancelInput): Promise<CancelResult> {
    const auth = authHeader();
    if (!auth) return { status: "cancelled", protocolo: `SIM-CANC-${Date.now()}` };
    try {
      const r = await fetch(`${baseUrl(input.environment)}/v2/nfce/${input.ref}?justificativa=${encodeURIComponent(input.motivo)}`, {
        method: "DELETE", headers: { Authorization: auth },
      });
      const j: any = await r.json();
      if (!r.ok) return { status: "rejected", error: j?.mensagem ?? "Falha ao cancelar" };
      return { status: "cancelled", protocolo: j?.numero_protocolo, xml: j?.caminho_xml_cancelamento };
    } catch (e: any) { return { status: "rejected", error: e?.message ?? "erro" }; }
  },

  async queryStatus(uf, env) {
    const auth = authHeader();
    if (!auth) return { online: true, message: "simulação" };
    try {
      const r = await fetch(`${baseUrl(env)}/v2/hom_nfe/status_sefaz?uf=${uf}`, { headers: { Authorization: auth } });
      return { online: r.ok };
    } catch { return { online: false, message: "timeout" }; }
  },
};

async function emit(input: EmitInput, kind: "nfce" | "nfe"): Promise<EmitResult> {
  const auth = authHeader();
  // Modo simulação (sem token) — devolve autorização fake para desenvolvimento/homologação interna
  if (!auth) {
    const chave = fakeChave(input.ref, input.numero);
    return {
      status: "authorized",
      chave,
      protocolo: `SIM-${Date.now()}`,
      qrcode_url: `https://simulador.local/qr/${chave}`,
      danfe_url: `https://simulador.local/danfe/${chave}.pdf`,
      provider_ref: input.ref,
      xml: `<simulacao chave="${chave}" ref="${input.ref}"/>`,
    };
  }

  try {
    const payload = buildFocusPayload(input, kind);
    const url = `${baseUrl(input.environment)}/v2/${kind}?ref=${encodeURIComponent(input.ref)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j: any = await r.json();
    if (!r.ok && r.status !== 202) return { status: "rejected", error: j?.mensagem ?? j?.erros?.[0]?.mensagem ?? `HTTP ${r.status}` };
    if (j?.status === "autorizado") {
      return {
        status: "authorized",
        chave: j.chave_nfe,
        protocolo: j.numero_protocolo,
        qrcode_url: j.qrcode,
        danfe_url: j.caminho_danfe ?? j.url_danfe,
        provider_ref: j.ref ?? input.ref,
        xml: j.caminho_xml_nota_fiscal,
      };
    }
    if (j?.status === "processando_autorizacao") return { status: "processing", provider_ref: j.ref ?? input.ref };
    return { status: "rejected", error: j?.mensagem_sefaz ?? j?.mensagem ?? "SEFAZ rejeitou" };
  } catch (e: any) {
    return { status: "contingency", error: e?.message ?? "network" };
  }
}
