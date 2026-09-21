/**
 * Lógica pura do Inventory Ledger — convenção única do saldo.
 *
 * REGRAS (fonte de verdade conceitual, espelhada no banco):
 *   * quantity é SEMPRE positiva; a direção (IN/OUT) decide o sinal.
 *   * Movimentos POSTED e REVERSED compõem o saldo; PENDING e CANCELED nunca
 *     somam. "REVERSED" é anotação do original estornado que permanece no
 *     saldo — o efeito é cancelado pelo REVERSAL de direção oposta (o par
 *     soma zero), jamais por edição do movimento.
 *   * Movimento consolidado não é editado nem excluído; correção gera
 *     movimento compensatório (REVERSAL / ajuste / correção manual).
 *   * Saldo = SUM(IN) - SUM(OUT).
 *   * Remessa para parceiro (PARTNER_SHIPMENT) é OUT de posição física e IN na
 *     localização do parceiro (par atômico); não é venda, não cria receita nem
 *     conta a receber.
 *
 * Estas funções são puras e testáveis sem banco; o Postgres repete as mesmas
 * regras nas funções SECURITY DEFINER (inventory_post_movement e afins).
 */

export type LedgerDirection = "IN" | "OUT";
export type LedgerStatus = "PENDING" | "POSTED" | "REVERSED" | "CANCELED";

export type LedgerMovement = {
  id?: string;
  variantId: string;
  locationId: string;
  batchId?: string | null;
  movementType: string;
  direction: LedgerDirection;
  quantity: number;
  status: LedgerStatus;
};

/** Impacto de um movimento no saldo. PENDING e CANCELED não impactam. */
export function movementImpact(
  movement: Pick<LedgerMovement, "direction" | "quantity" | "status">,
): number {
  if (movement.status === "PENDING" || movement.status === "CANCELED") return 0;
  return movement.direction === "IN" ? movement.quantity : -movement.quantity;
}

/** Saldo derivado: soma dos movimentos válidos (POSTED e REVERSED). */
export function calculateBalance(movements: LedgerMovement[]): number {
  return movements.reduce((acc, m) => acc + movementImpact(m), 0);
}

/** Saldo de uma variante em uma localização específica (batch na mesma chave). */
export function calculateBalanceAt(
  movements: LedgerMovement[],
  variantId: string,
  locationId: string,
  batchId?: string | null,
): number {
  return movements
    .filter(
      (m) =>
        m.variantId === variantId &&
        m.locationId === locationId &&
        (batchId === undefined || m.batchId === batchId),
    )
    .reduce((acc, m) => acc + movementImpact(m), 0);
}

/** Saldo total de uma variante na organização (todas as localizações). */
export function calculateTotalBalance(movements: LedgerMovement[], variantId: string): number {
  return movements
    .filter((m) => m.variantId === variantId)
    .reduce((acc, m) => acc + movementImpact(m), 0);
}

export type PostOutResult =
  { ok: true; balanceAfter: number } | { ok: false; reason: string; balanceAfter: number };

/**
 * Valida se uma saída de `outQuantity` é permitida contra o saldo atual.
 * Com allowNegative = false, o saldo jamais pode ficar negativo. Nunca
 * permite saldo negativo "em silêncio": quando permitido, retorna ok=true com
 * o novo saldo para auditoria.
 */
export function canPostOut(
  balance: number,
  outQuantity: number,
  allowNegative: boolean,
): PostOutResult {
  const balanceAfter = balance - outQuantity;
  if (outQuantity <= 0)
    return { ok: false, reason: "Quantidade deve ser maior que zero.", balanceAfter };
  if (!allowNegative && balanceAfter < 0) {
    return {
      ok: false,
      reason: `Saldo insuficiente nesta localização. Disponível: ${balance}; solicitado: ${outQuantity}.`,
      balanceAfter,
    };
  }
  return { ok: true, balanceAfter };
}

/**
 * Movimento compensatório de uma reversão: direção oposta, mesma quantidade,
 * mesma variante/local/lote. O original permanece intacto no histórico.
 */
export function buildReversal(movement: LedgerMovement, _reason: string): LedgerMovement {
  return {
    variantId: movement.variantId,
    locationId: movement.locationId,
    batchId: movement.batchId ?? null,
    movementType: "REVERSAL",
    direction: movement.direction === "IN" ? "OUT" : "IN",
    quantity: movement.quantity,
    status: "POSTED",
  };
}

/**
 * Par atômico de uma operação origem->destino: OUT na origem e IN no destino,
 * compartilhando a mesma referência (transferId). Nunca executar só metade.
 * Suporta transferência interna e remessa/retorno de parceiro.
 */
export function buildTransferPair({
  variantId,
  quantity,
  sourceLocationId,
  destinationLocationId,
  transferId,
  transferType = "TRANSFER",
}: {
  variantId: string;
  quantity: number;
  sourceLocationId: string;
  destinationLocationId: string;
  transferId: string;
  transferType?: "TRANSFER" | "PARTNER_SHIPMENT" | "PARTNER_RETURN";
}): LedgerMovement[] {
  const outType =
    transferType === "PARTNER_SHIPMENT" || transferType === "PARTNER_RETURN"
      ? transferType
      : "TRANSFER_OUT";
  const inType =
    transferType === "PARTNER_SHIPMENT" || transferType === "PARTNER_RETURN"
      ? transferType
      : "TRANSFER_IN";
  return [
    {
      variantId,
      locationId: sourceLocationId,
      movementType: outType,
      direction: "OUT",
      quantity,
      status: "POSTED",
      id: `${transferId}:out`,
    },
    {
      variantId,
      locationId: destinationLocationId,
      movementType: inType,
      direction: "IN",
      quantity,
      status: "POSTED",
      id: `${transferId}:in`,
    },
  ];
}

/**
 * Idempotência: um mesmo evento externo (marketplace, ERP, API, importação,
 * webhook) não pode gerar duas movimentações. Devolve false quando a chave já
 * foi processada.
 */
export function isUniqueIdempotency(usedKeys: ReadonlySet<string>, key: string | null): boolean {
  if (key == null || key.trim() === "") return true;
  return !usedKeys.has(key);
}

/** Chave estável (determinística) para um evento externo. */
export function idempotencyKey(source: string, externalId: string | number): string {
  return `${source}:${String(externalId)}`;
}
