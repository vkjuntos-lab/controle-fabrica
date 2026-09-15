// Onda O — contratos do provider fiscal
export type FiscalKind = "nfce" | "nfe" | "cfe_sat" | "nfe_devolucao";
export type FiscalEnv = "homologacao" | "producao";

export interface EmitInput {
  ref: string; // referência única do sistema (ex: sale_id)
  serie: number;
  numero: number;
  environment: FiscalEnv;
  emitter: {
    cnpj: string; ie?: string | null; razao_social: string; nome_fantasia?: string | null;
    uf: string; municipio?: string | null; cep?: string | null; endereco?: string | null;
    regime: string; csc_id?: string | null; csc_token?: string | null;
  };
  customer?: {
    cpf?: string | null; cnpj?: string | null; name?: string | null;
    email?: string | null; ie?: string | null;
  } | null;
  items: Array<{
    code: string; description: string; ncm?: string | null; cest?: string | null;
    cfop: string; unit: string; qty: number; unit_price: number;
    csosn?: string | null; cst_icms?: string | null; origem: number;
    icms_aliq: number; pis_aliq: number; cofins_aliq: number;
  }>;
  payments: Array<{ method: string; amount: number }>;
  total: number;
}

export interface EmitResult {
  status: "authorized" | "rejected" | "processing" | "contingency";
  chave?: string;
  protocolo?: string;
  xml?: string;
  qrcode_url?: string;
  danfe_url?: string;
  provider_ref?: string;
  error?: string;
}

export interface CancelInput { ref: string; chave: string; motivo: string; environment: FiscalEnv; }
export interface CancelResult { status: "cancelled" | "rejected"; protocolo?: string; xml?: string; error?: string; }

export interface FiscalProvider {
  name: string;
  emitNFCe(input: EmitInput): Promise<EmitResult>;
  emitNFe(input: EmitInput): Promise<EmitResult>;
  cancelDoc(input: CancelInput): Promise<CancelResult>;
  queryStatus(uf: string, env: FiscalEnv): Promise<{ online: boolean; message?: string }>;
}
