export type Field = {
  key: string;
  label: string;
  type?: "date" | "number" | "checkbox";
  options?: string[];
  reference?: string;
  optional?: boolean;
};
export type FormDefinition = {
  operation: string;
  title: string;
  permission: string;
  fields: Field[];
};
const ref = (key: string, label: string, reference: string, optional = false): Field => ({
  key,
  label,
  reference,
  optional,
});
const text = (key: string, label: string, optional = false): Field => ({ key, label, optional });
const date = (key: string, label: string, optional = true): Field => ({
  key,
  label,
  type: "date",
  optional,
});
export const forms: Record<string, FormDefinition> = {
  establishments: {
    operation: "establishment",
    title: "Estabelecimento",
    permission: "fiscal.configure",
    fields: [
      text("legal_name", "Razão social"),
      ref("company_id", "Empresa do grupo", "company_options"),
      text("tax_registration", "CNPJ"),
      text("state_registration", "Inscrição estadual", true),
      ref("fiscal_address_id", "Endereço fiscal", "address_options"),
      ref("tax_regime_id", "Regime", "regimes"),
      { key: "environment", label: "Ambiente", options: ["HOMOLOGATION", "PRODUCTION"] },
      text("regime_reason", "Justificativa do regime"),
    ],
  },
  regimes: {
    operation: "regime",
    title: "Regime tributário",
    permission: "fiscal.configure",
    fields: [
      text("code", "Código aprovado"),
      text("label", "Descrição"),
      date("valid_from", "Vigência inicial", false),
      date("valid_to", "Vigência final"),
    ],
  },
  operations: {
    operation: "operation",
    title: "Tipo de operação",
    permission: "fiscal.configure",
    fields: [
      text("code", "Código interno"),
      text("label", "Descrição"),
      {
        key: "kind",
        label: "Operação",
        options: [
          "DIRECT_SALE",
          "PARTNER_REMITTANCE",
          "PARTNER_RETURN",
          "CUSTOMER_RETURN",
          "SUPPLIER_PURCHASE",
          "SUPPLIER_RETURN",
          "INTERNAL_TRANSFER",
          "PRODUCTION_CONSUMPTION",
          "OTHER",
        ],
      },
      { key: "requires_document", label: "Exige documento fiscal", type: "checkbox" },
    ],
  },
  natures: {
    operation: "nature",
    title: "Natureza fiscal",
    permission: "fiscal.configure",
    fields: [
      ref("operation_type_id", "Operação", "operations"),
      ref("establishment_id", "Estabelecimento", "establishments", true),
      text("fiscal_nature", "Natureza"),
      text("cfop_code", "CFOP validado pelo responsável fiscal"),
      text("purpose", "Finalidade"),
      { key: "version", label: "Versão", type: "number" },
      date("valid_from", "Vigência inicial", false),
      date("valid_to", "Vigência final"),
      text("justification", "Justificativa"),
    ],
  },
  products: {
    operation: "product",
    title: "Classificação do produto",
    permission: "fiscal.tax_rules.manage",
    fields: [
      ref("product_variant_id", "Variante", "variant_options"),
      text("ncm", "NCM aprovado"),
      text("cest", "CEST", true),
      {
        key: "origin_code",
        label: "Código de origem aprovado",
        options: ["0", "1", "2", "3", "4", "5", "6", "7", "8"],
      },
      text("fiscal_unit", "Unidade tributável"),
      text("tax_classification", "Classificação tributária", true),
      { key: "version", label: "Versão", type: "number" },
      date("effective_from", "Vigência inicial", false),
      date("effective_to", "Vigência final"),
      text("justification", "Justificativa"),
    ],
  },
  companies: {
    operation: "company",
    title: "Perfil fiscal da contraparte",
    permission: "fiscal.configure",
    fields: [
      ref("company_id", "Cliente ou fornecedor", "company_options"),
      text("tax_registration", "CPF/CNPJ"),
      text("state_registration", "Inscrição estadual", true),
      {
        key: "ie_status",
        label: "Situação da IE",
        options: ["CONTRIBUINTE", "ISENTO", "NAO_APLICAVEL"],
      },
      { key: "version", label: "Versão", type: "number" },
      date("effective_from", "Vigência inicial", false),
      date("effective_to", "Vigência final"),
    ],
  },
  taxes: {
    operation: "tax",
    title: "Tributo ou tratamento",
    permission: "fiscal.configure",
    fields: [
      text("code", "Código"),
      text("label", "Descrição"),
      {
        key: "calculation_base",
        label: "Método suportado pelo motor",
        options: ["BASE_CALCULO", "VALOR_LIQUIDO", "ISOLADO"],
      },
    ],
  },
  layouts: {
    operation: "layout",
    title: "Versão técnica",
    permission: "fiscal.configure",
    fields: [
      { key: "document_model", label: "Modelo", options: ["NFe"] },
      text("version", "Versão"),
      text("source_reference", "Fonte técnica"),
      date("published_at", "Publicação", false),
      date("valid_from", "Vigência inicial", false),
      date("valid_to", "Vigência final"),
      date("implanted_at", "Implantação", false),
      text("homologation_notes", "Evidências da homologação"),
    ],
  },
  rules: {
    operation: "rule",
    title: "Regra tributária",
    permission: "fiscal.tax_rules.manage",
    fields: [
      ref("operation_type_id", "Operação", "operations"),
      ref("establishment_id", "Estabelecimento", "establishments", true),
      ref("tax_regime_id", "Regime", "regimes", true),
      text("product_classification", "NCM do escopo", true),
      ref("customer_company_id", "Contraparte específica", "company_options", true),
      { key: "document_model", label: "Modelo", options: ["NFe"] },
      ref("layout_version_id", "Leiaute validado", "layouts"),
      { key: "version", label: "Versão", type: "number" },
      { key: "priority", label: "Prioridade (menor vence)", type: "number" },
      date("valid_from", "Vigência inicial", false),
      date("valid_to", "Vigência final"),
      text("justification", "Justificativa"),
    ],
  },
  documents: {
    operation: "prepare",
    title: "Preparar NF-e da expedição",
    permission: "fiscal.documents.create",
    fields: [
      ref("source_id", "Expedição de venda", "shipment_options"),
      ref("establishment_id", "Estabelecimento", "establishments"),
      ref("operation_type_id", "Operação fiscal", "operations"),
      ref("nature_id", "Natureza fiscal aprovada", "natures"),
      ref("layout_version_id", "Leiaute validado", "layouts"),
    ],
  },
};
export const sections = [
  ["dashboard", "Dashboard", "fiscal.dashboard"],
  ["documents", "Documentos de saída", "fiscal.read"],
  ["inbound", "Recebidos", "fiscal.inbound.read"],
  ["events", "Eventos e cancelamentos", "fiscal.events.read"],
  ["exceptions", "Pendências", "fiscal.exceptions.read"],
  ["reconciliations", "Conciliações", "fiscal.reconciliation.read"],
  ["simulations", "Simulações", "fiscal.simulate"],
  ["establishments", "Estabelecimentos", "fiscal.configure"],
  ["companies", "Contrapartes", "fiscal.configure"],
  ["products", "Classificações", "fiscal.tax_rules.read"],
  ["rules", "Regras tributárias", "fiscal.tax_rules.read"],
  ["regimes", "Regimes", "fiscal.configure"],
  ["operations", "Operações", "fiscal.configure"],
  ["natures", "Naturezas", "fiscal.configure"],
  ["taxes", "Tributos", "fiscal.configure"],
  ["layouts", "Versões técnicas", "fiscal.configure"],
  ["providers", "Integração", "fiscal.provider.manage"],
] as const;
