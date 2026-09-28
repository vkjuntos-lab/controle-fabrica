/**
 * Rótulos, listas e fluxo do módulo de Vendas e logística (MASTER 013).
 *
 * O banco guarda apenas códigos; toda tradução para português do Brasil vive
 * aqui, no mesmo padrão de `lib/crm/constants.ts` (MASTER 012) e
 * `lib/inventory/constants.ts` (MASTER 003). Nenhuma regra financeira ou fiscal
 * é inventada: os valores abaixo descrevem o que o servidor aceita.
 */

export const ORDER_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovado",
  AWAITING_STOCK: "Aguardando estoque",
  READY_FOR_FULFILLMENT: "Pronto para separação",
  PARTIALLY_FULFILLED: "Parcialmente expedido",
  FULFILLED: "Expedido",
  CLOSED: "Encerrado",
  CANCELED: "Cancelado",
};

/** Situações derivadas do estoque; nunca são editadas à mão. */
export const STOCK_STATUS: Record<string, string> = {
  NOT_EVALUATED: "Não avaliado",
  SUFFICIENT: "Suficiente",
  INSUFFICIENT: "Insuficiente",
  PARTIAL: "Parcial",
  RESERVED: "Reservado",
  MAKE_TO_ORDER: "Sob encomenda",
};

export const FULFILLMENT_PROGRESS: Record<string, string> = {
  NOT_STARTED: "Não iniciado",
  IN_PROGRESS: "Em andamento",
  PARTIAL: "Parcial",
  COMPLETE: "Completo",
};

export const RESERVATION_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  ACTIVE: "Ativa",
  PARTIALLY_CONSUMED: "Parcialmente consumida",
  CONSUMED: "Consumida",
  RELEASED: "Liberada",
  EXPIRED: "Expirada",
  CANCELED: "Cancelada",
};

/** Reservas que ainda prendem disponibilidade de estoque. */
export const ACTIVE_RESERVATION_STATUS = ["OPEN", "ACTIVE", "PARTIALLY_CONSUMED"] as const;

export const FULFILLMENT_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  READY_FOR_PICKING: "Aguardando separação",
  PICKING: "Em separação",
  PICKED: "Separado",
  PACKING: "Em embalagem",
  READY_FOR_SHIPMENT: "Pronto para expedição",
  SHIPPED: "Expedido",
  CANCELED: "Cancelado",
};

export const PICKING_TASK_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  PICKED: "Separado",
  CONFIRMED: "Conferido",
  CANCELED: "Cancelado",
};

export const SHIPMENT_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  READY: "Pronta",
  DISPATCHED: "Expedida",
  IN_TRANSIT: "Em trânsito",
  DELIVERED: "Entregue",
  PARTIALLY_DELIVERED: "Parcialmente entregue",
  DELIVERY_EXCEPTION: "Ocorrência na entrega",
  RETURNED: "Devolvida",
  CANCELED: "Cancelada",
};

export const RETURN_STATUS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  RECEIVING: "Em recebimento",
  RECEIVED: "Recebida",
  INSPECTED: "Inspecionada",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
  CANCELED: "Cancelada",
};

export const RETURN_DESTINATION: Record<string, string> = {
  PENDING: "A definir",
  SELLABLE: "Revendável",
  QUARANTINE: "Quarentena",
  SCRAP: "Descarte",
};

export const EXCEPTION_SEVERITY: Record<string, string> = {
  INFO: "Informativa",
  WARNING: "Atenção",
  ERROR: "Erro",
  BLOCKING: "Bloqueante",
};

export const EXCEPTION_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  IN_REVIEW: "Em análise",
  RESOLVED: "Resolvida",
  IGNORED: "Ignorada",
};

/** `logistics_exceptions.exception_type`, como o `CHECK` da tabela define. */
export const EXCEPTION_TYPE: Record<string, string> = {
  INSUFFICIENT_STOCK: "Estoque insuficiente",
  RESERVATION_CONFLICT: "Conflito de reserva",
  INVALID_SKU: "SKU inválido",
  WRONG_BATCH: "Lote errado",
  PICKING_DIFFERENCE: "Divergência na separação",
  PACKING_DIFFERENCE: "Divergência na embalagem",
  SHIPMENT_DUPLICATE: "Expedição duplicada",
  DELIVERY_DELAY: "Atraso na entrega",
  DELIVERY_FAILURE: "Falha na entrega",
  DAMAGED_GOODS: "Mercadoria avariada",
  CUSTOMER_REFUSAL: "Recusa do cliente",
};

/** `shipment_delivery_proofs.proof_type`. `PHOTO` existe no banco, mas o
 *  registro de evidência é feito por texto: não há upload de arquivo. */
export const PROOF_TYPE: Record<string, string> = {
  RECEIPT: "Recibo",
  SIGNATURE: "Assinatura",
  DOCUMENT: "Documento",
  PHOTO: "Foto",
  NOTE: "Observação",
};

export const CARRIER_MODALITY: Record<string, string> = {
  ROAD: "Rodoviário",
  AIR: "Aéreo",
  SEA: "Marítimo",
  COURIER: "Courier",
  OWN_FLEET: "Frota própria",
  OTHER: "Outro",
};

export const SHIPPING_METHOD: Record<string, string> = {
  STANDARD: "Padrão",
  EXPRESS: "Expresso",
  RETIRE: "Retirada no local",
  OWN_TRANSPORT: "Transporte próprio",
  OTHER: "Outro",
};

/**
 * Ações de pedido oferecidas por status.
 *
 * A tela usa esta tabela para exibir apenas as ações possíveis; o servidor
 * continua sendo a autoridade e recusa qualquer transição fora daqui. Um teste
 * unitário cobre a completude desta lista contra `ORDER_STATUS`.
 */
export const ORDER_ACTIONS: Record<string, string[]> = {
  DRAFT: ["submit", "cancel"],
  PENDING_APPROVAL: ["approve", "reject", "cancel"],
  APPROVED: ["reserve", "cancel"],
  AWAITING_STOCK: ["reserve", "create_fulfillment", "cancel"],
  READY_FOR_FULFILLMENT: ["reserve", "create_fulfillment", "cancel"],
  PARTIALLY_FULFILLED: ["reserve", "create_fulfillment", "create_return", "cancel"],
  FULFILLED: ["create_return", "close"],
  CLOSED: [],
  CANCELED: [],
};

/** Status em que o pedido ainda aceita reserva e nova separação. */
export const OPEN_ORDER_STATUS = [
  "APPROVED",
  "AWAITING_STOCK",
  "READY_FOR_FULFILLMENT",
  "PARTIALLY_FULFILLED",
] as const;

/** Status terminais: não aceitam mais nenhuma ação. */
export const TERMINAL_ORDER_STATUS = ["CLOSED", "CANCELED"] as const;

/** Expedição que já saiu e pode receber rastreio, prova e entrega. */
export const IN_TRANSIT_SHIPMENT_STATUS = [
  "DISPATCHED",
  "IN_TRANSIT",
  "PARTIALLY_DELIVERED",
] as const;

/** Expedição entregue, a partir da qual se pode abrir devolução. */
export const DELIVERED_SHIPMENT_STATUS = ["DELIVERED", "PARTIALLY_DELIVERED"] as const;

/** Ações de atendimento por status, com as permissões que cada uma exige. */
export const FULFILLMENT_ACTIONS: Record<
  string,
  { action: string; label: string; permission: string }[]
> = {
  DRAFT: [],
  READY_FOR_PICKING: [
    { action: "start", label: "Iniciar separação", permission: "fulfillment.manage" },
  ],
  PICKING: [{ action: "pick", label: "Concluir separação", permission: "fulfillment.manage" }],
  PICKED: [{ action: "pack", label: "Iniciar embalagem", permission: "fulfillment.manage" }],
  PACKING: [{ action: "ready", label: "Liberar para expedição", permission: "fulfillment.manage" }],
  READY_FOR_SHIPMENT: [],
  SHIPPED: [],
  CANCELED: [],
};

/**
 * Políticas operacionais por organização, exatamente as doze que
 * `sales_settings_save` valida e grava. A tela edita todas elas; qualquer
 * valor fora destas listas é recusado pelo servidor.
 */
export const SETTING_OPTIONS = {
  reservation_policy: {
    label: "Reserva de estoque",
    options: ["FULL_ONLY", "ALLOW_PARTIAL", "ALLOW_NEGATIVE_AVAILABLE"],
    labels: {
      FULL_ONLY: "Somente a quantidade inteira",
      ALLOW_PARTIAL: "Permitir reserva parcial",
      ALLOW_NEGATIVE_AVAILABLE: "Permitir disponível negativo",
    },
    hint: "Reserva não movimenta estoque: apenas torna a mercadoria indisponível para os demais pedidos.",
  },
  price_override_policy: {
    label: "Alteração de preço",
    options: ["BLOCK", "ALLOW_WITH_AUTHORIZATION"],
    labels: {
      BLOCK: "Bloquear sempre",
      ALLOW_WITH_AUTHORIZATION: "Permitir com alçada",
    },
    hint: "O preço do pedido vem da tabela oficial na data do pedido; a interface nunca o digita.",
  },
  credit_exposure_policy: {
    label: "Exposição de crédito",
    options: ["OPEN_RECEIVABLES_ONLY", "OPEN_RECEIVABLES_PLUS_OPEN_ORDERS"],
    labels: {
      OPEN_RECEIVABLES_ONLY: "Somente recebíveis em aberto",
      OPEN_RECEIVABLES_PLUS_OPEN_ORDERS: "Recebíveis e pedidos aprovados",
    },
    hint: "Define o que entra no cálculo aprovado pelo servidor na aprovação do pedido.",
  },
  tracking_mode: {
    label: "Rastreamento",
    options: ["MANUAL", "WEBHOOK"],
    labels: { MANUAL: "Manual", WEBHOOK: "Integrado com a transportadora" },
    hint: "Nenhum provedor externo está conectado; o modo integrado ainda exige configuração.",
  },
  receivable_trigger: {
    label: "Gatilho financeiro",
    options: ["NONE", "ON_APPROVAL", "ON_DISPATCH"],
    labels: {
      NONE: "Não gerar",
      ON_APPROVAL: "Na aprovação do pedido",
      ON_DISPATCH: "Na expedição, proporcional ao expedido",
    },
    hint: "Pedido aprovado não é venda recebida: o gatilho é configurável e nada é cobrado sem conferência.",
  },
} as const;

export const SETTING_FLAGS = {
  make_to_order_enabled: {
    label: "Permitir venda sob encomenda",
    hint: "Quando o saldo não cobre o item, o pedido pode seguir como produção sob encomenda.",
  },
  approval_segregation: {
    label: "Exigir outro usuário na aprovação",
    hint: "Desliga a segregação de funções: quem cria o pedido não pode aprová-lo.",
  },
  allow_partial_fulfillment: {
    label: "Permitir expedição parcial",
    hint: "Autoriza a expedição de parte do pedido; o saldo permanece em aberto.",
  },
  shipment_requires_full_confirmation: {
    label: "Exigir conferência integral antes de expedir",
    hint: "Com a conferência parcial, a diferença separada vira ocorrência em vez de estoque.",
  },
  require_shipping_address: {
    label: "Exigir endereço de entrega",
    hint: "Endereço do cadastro da empresa é o endereço oficial do pedido.",
  },
} as const;

/** Números com significado próprio: nunca devem ser exibidos sem rótulo. */
export const MONEY_COLUMNS = [
  "total_amount",
  "original_amount",
  "open_amount",
  "unit_price",
  "line_total",
  "subtotal",
  "discount_total",
  "freight_amount",
  "tax_amount",
  "credit_limit",
  "credit_available",
  "overdue_amount",
] as const;

export const label = (map: Record<string, string>, value: unknown): string => {
  const raw = value == null ? "" : String(value);
  return raw ? (map[raw] ?? raw.replace(/_/g, " ").toLowerCase()) : "—";
};

export const orderStatusLabel = (value: unknown) => label(ORDER_STATUS, value);
export const stockStatusLabel = (value: unknown) => label(STOCK_STATUS, value);
export const fulfillmentStatusLabel = (value: unknown) => label(FULFILLMENT_STATUS, value);
export const pickingStatusLabel = (value: unknown) => label(PICKING_TASK_STATUS, value);
export const reservationStatusLabel = (value: unknown) => label(RESERVATION_STATUS, value);
export const shipmentStatusLabel = (value: unknown) => label(SHIPMENT_STATUS, value);
export const returnStatusLabel = (value: unknown) => label(RETURN_STATUS, value);
export const exceptionStatusLabel = (value: unknown) => label(EXCEPTION_STATUS, value);
export const exceptionSeverityLabel = (value: unknown) => label(EXCEPTION_SEVERITY, value);
export const exceptionTypeLabel = (value: unknown) => label(EXCEPTION_TYPE, value);
export const proofTypeLabel = (value: unknown) => label(PROOF_TYPE, value);
export const carrierModalityLabel = (value: unknown) => label(CARRIER_MODALITY, value);
export const returnDestinationLabel = (value: unknown) => label(RETURN_DESTINATION, value);
export const shippingMethodLabel = (value: unknown) => label(SHIPPING_METHOD, value);

/** Ações do pedido possíveis no status atual; lista vazia quando terminal. */
export const orderActions = (status: unknown): string[] =>
  ORDER_ACTIONS[status == null ? "" : String(status)] ?? [];

/** Ações de atendimento possíveis no status atual. */
export const fulfillmentActions = (
  status: unknown,
): { action: string; label: string; permission: string }[] =>
  FULFILLMENT_ACTIONS[status == null ? "" : String(status)] ?? [];

/** Rótulo de uma política a partir do valor gravado. */
export const settingLabel = (key: string, value: unknown): string => {
  const option = SETTING_OPTIONS[key as keyof typeof SETTING_OPTIONS];
  if (!option) return value == null || value === "" ? "—" : String(value);
  const raw = String(value);
  const labels = option.labels as Record<string, string>;
  return labels[raw] ?? raw;
};

/** Verdadeiro quando o status é de um conjunto de códigos. */
export const isOneOf = (value: unknown, codes: readonly string[]): boolean =>
  value != null && codes.includes(String(value));
