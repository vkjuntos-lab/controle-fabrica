/**
 * Contrato de leitura do módulo fiscal: o que cada área mostra e como todo
 * código do banco é traduzido antes de chegar à tela.
 *
 * Este módulo é puro e não importa React: o teste de contrato compara ele com
 * as migrations, e a tela só consome. A razão é concreta — a tabela genérica
 * do fiscal lia `label`, `legal_name`, `fiscal_nature`, `sku`, `name` e
 * `version` para identificar a linha, e nenhuma dessas chaves existe em oito
 * das onze áreas: documentos, recebidos, eventos, pendências, conciliações,
 * classificações, perfis de contraparte e simulações mostravam o UUID cru na
 * coluna "Registro". Nenhum teste de unidade e nenhum typecheck enxergam isso;
 * só a tela, contra o banco.
 */

/** Coluna exibida na listagem de uma área. */
export type Column = {
  /** Chave real da coluna na tabela do banco. */
  key: string;
  /** Cabeçalho em português. */
  title: string;
  /** Rótulo do valor quando a coluna guarda um código do banco. */
  labels?: Record<string, string>;
  /** Valor padrão quando a coluna é nulo. */
  empty?: string;
};

/** Listagem de uma área, com a identidade da linha resolvida por campos reais. */
export type Listing = {
  /** Tabela lida pelo backend. A tela não escolhe tabela; ela a consome. */
  table: string;
  /** Colunas da tabela, na ordem em que aparecem. */
  title: string;
  /** Campos que identificam a linha, em ordem de preferência. */
  identity: string[];
  /** Colunas. */
  columns: Column[];
};

/** Situação do documento fiscal. Rascunho nunca é documento emitido. */
export const DOCUMENT_STATUS: Record<string, string> = {
  DRAFT: "Rascunho preparado",
  PENDING_VALIDATION: "Pendente de validação cadastral",
  VALIDATED: "Cadastro validado",
  READY_TO_SEND: "Conferido e pronto para envio",
  SENDING: "Transmissão em andamento",
  PROCESSING: "Provedor processando",
  AUTHORIZED: "Autorizado",
  REJECTED: "Rejeitado",
  CANCELLATION_REQUESTED: "Cancelamento solicitado",
  CANCELED: "Cancelado",
  DENIED: "Negado na conciliação",
  CONTINGENCY_PENDING: "Contingência pendente",
};

/** Ciclo de aprovação de regra, natureza e perfil. Regra não pula revisão. */
export const RULE_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  REVIEW: "Em revisão",
  APPROVED: "Aprovado",
  ACTIVE: "Vigente",
  RETIRED: "Encerrado",
};

/** Tipo de operação fiscal. Remessa a parceiro não é venda. */
export const OPERATION_KIND: Record<string, string> = {
  DIRECT_SALE: "Venda a cliente",
  PARTNER_REMITTANCE: "Remessa a parceiro",
  PARTNER_RETURN: "Retorno de parceiro",
  CUSTOMER_RETURN: "Devolução de cliente",
  SUPPLIER_PURCHASE: "Compra de mercadoria",
  SUPPLIER_RETURN: "Devolução a fornecedor",
  INTERNAL_TRANSFER: "Transferência entre estabelecimentos",
  PRODUCTION_CONSUMPTION: "Consumo de produção",
  OTHER: "Outra operação",
};

/** Ambiente do provedor. Homologação não autoriza documento de produção. */
export const ENVIRONMENT: Record<string, string> = {
  HOMOLOGATION: "Homologação",
  PRODUCTION: "Produção",
};

/** Origem oficial que pode gerar documento. */
export const SOURCE_TYPE: Record<string, string> = {
  SHIPMENT: "Expedição de venda",
  PARTNER_SHIPMENT: "Remessa a parceiro",
  CUSTOMER_RETURN: "Devolução de cliente",
  SUPPLIER_RETURN: "Devolução a fornecedor",
  PARTNER_RETURN: "Retorno de parceiro",
  INTERNAL_TRANSFER: "Transferência entre estabelecimentos",
};

/** Situação do estabelecimento emissor. */
export const ESTABLISHMENT_STATUS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  SUSPENDED: "Suspenso",
};

/** Ciclo do leiaute técnico. Rascunho não emite nada. */
export const LAYOUT_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  HOMOLOGATION: "Em homologação",
  ACTIVE: "Vigente",
  RETIRED: "Encerrado",
};

/** Provedor só opera depois de homologado; nenhum está configurado. */
export const PROVIDER_STATUS: Record<string, string> = {
  PENDING_HOMOLOGATION: "Aguardando homologação",
  DISABLED: "Desativado",
};

/** Situação da pendência. RESOLVED exige justificativa gravada. */
export const EXCEPTION_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  IN_REVIEW: "Em tratamento",
  RESOLVED: "Resolvida",
};

/** Natureza da pendência. */
export const EXCEPTION_TYPE: Record<string, string> = {
  MISSING_TAX_CONFIGURATION: "Regra tributária ausente",
  INVALID_PRODUCT_CLASSIFICATION: "Classificação de produto inválida",
  INVALID_CUSTOMER_FISCAL_DATA: "Cadastro fiscal do cliente incompleto",
  INVALID_ESTABLISHMENT_DATA: "Cadastro do estabelecimento incompleto",
  INVALID_OPERATION_CLASSIFICATION: "Natureza da operação incompatível",
  DOCUMENT_DUPLICATE: "Documento duplicado",
  PROVIDER_UNAVAILABLE: "Provedor não configurado",
  TRANSMISSION_TIMEOUT: "Tempo de transmissão esgotado",
  AUTHORIZATION_REJECTED: "Autorização recusada",
  INBOUND_DOCUMENT_MISMATCH: "Divergência no documento recebido",
  TAX_CALCULATION_DIVERGENCE: "Divergência no cálculo de tributo",
  FISCAL_FINANCIAL_MISMATCH: "Divergência com o financeiro",
  FISCAL_INVENTORY_MISMATCH: "Divergência com o estoque",
};

/** Gravidade da pendência. O banco não impõe lista fechada. */
export const EXCEPTION_SEVERITY: Record<string, string> = {
  BLOCKING: "Bloqueante",
  WARNING: "Advertência",
  INFO: "Informativa",
};

/** Situação do documento recebido. Importado não é conferido. */
export const INBOUND_STATUS: Record<string, string> = {
  PENDING_VERIFICATION: "Aguardando verificação",
  UNDER_REVIEW: "Em conferência",
  MATCHED: "Conferido",
  MISMATCH: "Divergente",
};

/** Autenticidade é sempre declarada pelo ambiente oficial, nunca pelo XML. */
export const AUTHENTICITY_STATUS: Record<string, string> = {
  UNVERIFIED: "Não verificada",
};

/** Resultado da conferência entre documento e operação oficial. */
export const RECONCILIATION_STATUS: Record<string, string> = {
  MATCHED: "Conferido",
  MISMATCH: "Divergente",
  PENDING: "Pendente",
};

/** Decisão registrada na trilha de revisão da regra. */
export const REVIEW_DECISION: Record<string, string> = {
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  REQUESTED_CHANGES: "Ajuste solicitado",
  RETIRED: "Encerrado",
};

/** Método de cálculo suportado pelo motor. Nada fora desta lista é calculado. */
export const CALCULATION_BASE: Record<string, string> = {
  BASE_CALCULO: "Sobre a base de cálculo",
  VALOR_LIQUIDO: "Sobre o valor líquido",
  ISOLATED: "Valor isolado",
};

/** Situação da inscrição estadual do destinatário. */
export const IE_STATUS: Record<string, string> = {
  CONTRIBUINTE: "Contribuinte",
  ISENTO: "Isento",
  NAO_APLICAVEL: "Não aplicável",
};

/** Eventos gravados na trilha do documento. */
export const EVENT_TYPE: Record<string, string> = {
  FISCAL_DOCUMENT_PREPARED: "Documento preparado",
  FISCAL_DOCUMENT_STATE_CHANGED: "Situação do documento alterada",
  FISCAL_INBOUND_IMPORTED: "Documento recebido importado",
  FISCAL_RECONCILIATION_RECORDED: "Conciliação registrada",
};

/** Achados da conciliação. Nenhum é resolvido por correspondência aritmética. */
export const FINDING_TYPE: Record<string, string> = {
  OFFICIAL_AUTHORIZATION_PENDING: "Autorização oficial pendente",
  FISCAL_INVENTORY_MISMATCH: "Item fiscal sem correspondência no estoque",
  COMMERCIAL_BALANCE: "Saldo comercial ainda não coberto",
  RECEIPT_NOT_POSTED: "Recebimento ainda não postado",
  PAYABLE_NOT_LINKED: "Obrigação financeira não vinculada",
  PAYABLE_TOTAL_MISMATCH: "Total da obrigação diverge do documento",
  XML_NOT_ARCHIVED: "XML não arquivado",
  PRODUCT_NOT_MAPPED: "Produto não mapeado",
  QUANTITY_OR_PRICE_MISMATCH: "Quantidade ou preço divergente",
  ITEM_COUNT_MISMATCH: "Contagem de itens divergente",
  TAX_FREIGHT_AND_AUTHENTICITY_REVIEW_PENDING: "Tributo, frete e autenticidade pendentes",
  INBOUND_DOCUMENT_MISMATCH: "Divergência no documento recebido",
};

/**
 * Código de origem da mercadoria. O banco só declara `0 = nacional` e
 * `1..8 = estrangeira conforme seção da NCM`; a significância de cada
 * seção é decisão do responsável fiscal e não é interpretada aqui.
 */
export const ORIGIN_CODE: Record<string, string> = {
  "0": "Nacional",
  "1": "Estrangeira — origem 1",
  "2": "Estrangeira — origem 2",
  "3": "Estrangeira — origem 3",
  "4": "Estrangeira — origem 4",
  "5": "Estrangeira — origem 5",
  "6": "Estrangeira — origem 6",
  "7": "Estrangeira — origem 7",
  "8": "Estrangeira — origem 8",
};

const money = "—";

/**
 * Colunas de cada área. Toda chave existe na tabela da área: o teste
 * `constants.test.ts` compara com o SQL das migrations, não com tipos
 * gerados. A primeira coluna identifica o registro para quem lê; se for
 * `id`, a área volta a mostrar UUID.
 */
export const listings: Record<string, Listing> = {
  documents: {
    table: "fiscal_documents",
    title: "Documento",
    identity: ["document_number"],
    columns: [
      { key: "document_number", title: "Número", empty: "Sem número" },
      { key: "series", title: "Série", empty: "—" },
      { key: "access_key", title: "Chave de acesso", empty: "Sem chave: não autorizado" },
      { key: "source_type", title: "Origem", labels: SOURCE_TYPE, empty: money },
      { key: "environment", title: "Ambiente", labels: ENVIRONMENT, empty: money },
      { key: "issue_date", title: "Emissão", empty: money },
      { key: "total_amount", title: "Total", empty: money },
      { key: "total_taxes", title: "Tributos", empty: money },
      { key: "status", title: "Situação", labels: DOCUMENT_STATUS, empty: money },
    ],
  },
  inbound: {
    table: "inbound_fiscal_documents",
    title: "Documento recebido",
    identity: ["access_key"],
    columns: [
      { key: "access_key", title: "Chave de acesso", empty: "Sem chave: XML sem identificação" },
      { key: "document_type", title: "Modelo", empty: money },
      { key: "issue_date", title: "Emissão", empty: money },
      { key: "total_amount", title: "Total", empty: money },
      {
        key: "authenticity_status",
        title: "Autenticidade",
        labels: AUTHENTICITY_STATUS,
        empty: money,
      },
      { key: "status", title: "Situação", labels: INBOUND_STATUS, empty: money },
    ],
  },
  events: {
    table: "fiscal_events",
    title: "Evento",
    identity: ["event_type"],
    columns: [
      { key: "event_type", title: "Evento", labels: EVENT_TYPE, empty: money },
      { key: "from_status", title: "De", labels: DOCUMENT_STATUS, empty: "—" },
      { key: "to_status", title: "Para", labels: DOCUMENT_STATUS, empty: money },
      { key: "created_at", title: "Registrado em", empty: money },
    ],
  },
  exceptions: {
    table: "fiscal_exceptions",
    title: "Pendência",
    identity: ["exception_type"],
    columns: [
      { key: "exception_type", title: "Pendência", labels: EXCEPTION_TYPE, empty: money },
      { key: "severity", title: "Gravidade", labels: EXCEPTION_SEVERITY, empty: "Bloqueante" },
      { key: "status", title: "Situação", labels: EXCEPTION_STATUS, empty: money },
      { key: "created_at", title: "Aberta em", empty: money },
      { key: "resolution", title: "Resolução", empty: "Sem resolução registrada" },
    ],
  },
  reconciliations: {
    table: "fiscal_reconciliations",
    title: "Conciliação",
    identity: ["status"],
    columns: [
      { key: "status", title: "Resultado", labels: RECONCILIATION_STATUS, empty: money },
      { key: "findings", title: "Achados", empty: "Nenhum achado" },
      { key: "created_at", title: "Registrada em", empty: money },
    ],
  },
  simulations: {
    table: "fiscal_simulations",
    title: "Simulação",
    identity: ["created_at"],
    columns: [
      { key: "created_at", title: "Executada em", empty: money },
      { key: "has_blocking_issue", title: "Bloqueio", empty: "Não" },
      { key: "result", title: "Resultado", empty: "—" },
    ],
  },
  establishments: {
    table: "fiscal_establishments",
    title: "Estabelecimento",
    identity: ["legal_name"],
    columns: [
      { key: "legal_name", title: "Razão social", empty: money },
      { key: "tax_registration", title: "CNPJ", empty: "—" },
      { key: "environment", title: "Ambiente", labels: ENVIRONMENT, empty: money },
      { key: "status", title: "Situação", labels: ESTABLISHMENT_STATUS, empty: money },
    ],
  },
  regimes: {
    table: "fiscal_tax_regimes",
    title: "Regime",
    identity: ["label"],
    columns: [
      { key: "code", title: "Código", empty: money },
      { key: "label", title: "Descrição", empty: money },
      { key: "version", title: "Versão", empty: money },
      { key: "valid_from", title: "Vigência inicial", empty: money },
      { key: "valid_to", title: "Vigência final", empty: "Vigente" },
      { key: "is_active", title: "Ativo", empty: "Não" },
    ],
  },
  operations: {
    table: "fiscal_operation_types",
    title: "Operação",
    identity: ["label"],
    columns: [
      { key: "code", title: "Código", empty: money },
      { key: "label", title: "Descrição", empty: money },
      { key: "kind", title: "Operação", labels: OPERATION_KIND, empty: money },
      { key: "requires_document", title: "Exige documento", empty: "Não" },
      { key: "is_active", title: "Ativa", empty: "Não" },
    ],
  },
  natures: {
    table: "fiscal_operation_natures",
    title: "Natureza",
    identity: ["fiscal_nature"],
    columns: [
      { key: "fiscal_nature", title: "Natureza", empty: "—" },
      { key: "cfop_code", title: "CFOP", empty: "—" },
      { key: "version", title: "Versão", empty: money },
      { key: "valid_from", title: "Vigência inicial", empty: money },
      { key: "status", title: "Situação", labels: RULE_STATUS, empty: money },
    ],
  },
  products: {
    table: "product_fiscal_profiles",
    title: "Classificação",
    identity: ["ncm"],
    columns: [
      { key: "ncm", title: "NCM", empty: money },
      { key: "cest", title: "CEST", empty: "—" },
      { key: "origin_code", title: "Origem", labels: ORIGIN_CODE, empty: money },
      { key: "fiscal_unit", title: "Unidade", empty: money },
      { key: "version", title: "Versão", empty: money },
      { key: "effective_from", title: "Vigência inicial", empty: money },
      { key: "status", title: "Situação", labels: RULE_STATUS, empty: money },
    ],
  },
  companies: {
    table: "company_fiscal_profiles",
    title: "Perfil da contraparte",
    identity: ["tax_registration"],
    columns: [
      { key: "tax_registration", title: "CPF/CNPJ", empty: "—" },
      { key: "state_registration", title: "Inscrição estadual", empty: "—" },
      { key: "version", title: "Versão", empty: money },
      { key: "effective_from", title: "Vigência inicial", empty: money },
      { key: "is_final_consumer", title: "Consumidor final", empty: "Não" },
      { key: "status", title: "Situação", labels: RULE_STATUS, empty: money },
    ],
  },
  taxes: {
    table: "fiscal_taxes",
    title: "Tributo",
    identity: ["label"],
    columns: [
      { key: "code", title: "Código", empty: money },
      { key: "label", title: "Descrição", empty: money },
      { key: "calculation_base", title: "Base", labels: CALCULATION_BASE, empty: money },
      { key: "is_active", title: "Ativo", empty: "Não" },
    ],
  },
  layouts: {
    table: "fiscal_layout_versions",
    title: "Leiaute",
    identity: ["version"],
    columns: [
      { key: "document_model", title: "Modelo", empty: money },
      { key: "version", title: "Versão", empty: money },
      { key: "valid_from", title: "Vigência inicial", empty: money },
      { key: "implanted_at", title: "Implantação", empty: "Não implantado" },
      { key: "status", title: "Situação", labels: LAYOUT_STATUS, empty: money },
    ],
  },
  rules: {
    table: "tax_rules",
    title: "Regra",
    identity: ["version"],
    columns: [
      { key: "version", title: "Versão", empty: money },
      { key: "priority", title: "Prioridade", empty: money },
      { key: "document_model", title: "Modelo", empty: "Todos" },
      { key: "valid_from", title: "Vigência inicial", empty: money },
      { key: "valid_to", title: "Vigência final", empty: "Vigente" },
      { key: "status", title: "Situação", labels: RULE_STATUS, empty: money },
    ],
  },
  regressions: {
    table: "fiscal_rule_regressions",
    title: "Regressão",
    identity: ["fingerprint"],
    columns: [
      { key: "fingerprint", title: "Impressão da regra", empty: money },
      { key: "rule_version", title: "Versão testada", empty: money },
      { key: "passed", title: "Resultado", empty: "Reprovada" },
      { key: "created_at", title: "Executada em", empty: money },
    ],
  },
  providers: {
    table: "fiscal_providers",
    title: "Provedor",
    identity: ["name"],
    columns: [
      { key: "name", title: "Provedor", empty: money },
      { key: "adapter_code", title: "Adaptador", empty: money },
      { key: "environment", title: "Ambiente", labels: ENVIRONMENT, empty: money },
      { key: "status", title: "Situação", labels: PROVIDER_STATUS, empty: money },
      { key: "certificate_expires_at", title: "Certificado até", empty: "Sem certificado" },
    ],
  },
};

/**
 * Permissão exigida por cada leitura. Precisa ser igual ao mapa de `_kind` em
 * `fiscal_query`: quando a tela libera uma área por uma permissão e o servidor
 * exige outra, o formulário abre e o seletor dentro dele falha.
 */
export const readPermission: Record<string, string> = {
  dashboard: "fiscal.dashboard",
  documents: "fiscal.read",
  inbound: "fiscal.inbound.read",
  events: "fiscal.events.read",
  exceptions: "fiscal.exceptions.read",
  reconciliations: "fiscal.reconciliation.read",
  simulations: "fiscal.simulate",
  providers: "fiscal.provider.manage",
  establishments: "fiscal.read",
  regimes: "fiscal.read",
  operations: "fiscal.read",
  natures: "fiscal.read",
  taxes: "fiscal.read",
  layouts: "fiscal.read",
  companies: "fiscal.read",
  products: "fiscal.tax_rules.read",
  rules: "fiscal.tax_rules.read",
  rule_items: "fiscal.tax_rules.read",
  reviews: "fiscal.tax_rules.read",
  regressions: "fiscal.tax_rules.read",
  detail: "fiscal.read",
  source_options: "fiscal.read",
  source_detail: "fiscal.read",
  company_options: "fiscal.read",
  variant_options: "fiscal.read",
  address_options: "fiscal.read",
  supplier_options: "fiscal.read",
  shipment_options: "fiscal.read",
  receipt_options: "fiscal.read",
  location_options: "fiscal.read",
  inbound_context: "fiscal.inbound.review",
};

/** Rótulos de translate para uma coluna, com o texto cru como último recurso. */
export function translate(value: unknown, labels?: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  const key = String(value);
  return labels?.[key] ?? key;
}
