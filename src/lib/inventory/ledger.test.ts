import { describe, expect, it } from "vitest";

import {
  buildReversal,
  buildTransferPair,
  calculateBalance,
  canPostOut,
  calculateBalanceAt,
  calculateTotalBalance,
  idempotencyKey,
  isUniqueIdempotency,
  type LedgerMovement,
} from "@/lib/inventory/ledger";

function movement(
  partial: Partial<LedgerMovement> & { direction: LedgerMovement["direction"] },
): LedgerMovement {
  return {
    variantId: "V1",
    locationId: "L1",
    movementType: "OPENING_BALANCE",
    quantity: 1,
    status: "POSTED",
    ...partial,
  };
}

describe("inventory ledger (regras da fonte oficial do estoque)", () => {
  it("entrada +100 = saldo 100", () => {
    const movements = [movement({ direction: "IN", quantity: 100 })];
    expect(calculateBalance(movements)).toBe(100);
  });

  it("saída -20 = saldo 80", () => {
    const movements = [
      movement({ direction: "IN", quantity: 100 }),
      movement({ direction: "OUT", quantity: 20, movementType: "SALE" }),
    ];
    expect(calculateBalance(movements)).toBe(80);
  });

  it("devolução +2 = saldo 82", () => {
    const movements = [
      movement({ direction: "IN", quantity: 100 }),
      movement({ direction: "OUT", quantity: 20, movementType: "SALE" }),
      movement({ direction: "IN", quantity: 2, movementType: "SALE_RETURN" }),
    ];
    expect(calculateBalance(movements)).toBe(82);
  });

  it("ajuste -1 = saldo 81", () => {
    const movements = [
      movement({ direction: "IN", quantity: 100 }),
      movement({ direction: "OUT", quantity: 20, movementType: "SALE" }),
      movement({ direction: "IN", quantity: 2, movementType: "SALE_RETURN" }),
      movement({ direction: "OUT", quantity: 1, movementType: "ADJUSTMENT_OUT" }),
    ];
    expect(calculateBalance(movements)).toBe(81);
  });

  it("transferência de 20: origem -20, destino +20, total organizacional igual", () => {
    const pair = buildTransferPair({
      variantId: "V1",
      quantity: 20,
      sourceLocationId: "CENTRAL",
      destinationLocationId: "LOJA",
      transferId: "T-1",
    });
    expect(pair).toHaveLength(2);
    expect(pair[0].direction).toBe("OUT");
    expect(pair[0].locationId).toBe("CENTRAL");
    expect(pair[1].direction).toBe("IN");
    expect(pair[1].locationId).toBe("LOJA");

    const opening = movement({ direction: "IN", quantity: 100, locationId: "CENTRAL" });
    const all = [opening, ...pair];
    expect(calculateBalanceAt(all, "V1", "CENTRAL")).toBe(80);
    expect(calculateBalanceAt(all, "V1", "LOJA")).toBe(20);
    expect(calculateTotalBalance(all, "V1")).toBe(100);
  });

  it("reversão: original permanece POSTED e a compensação restaura o saldo", () => {
    const original = movement({ direction: "IN", quantity: 100, movementType: "OPENING_BALANCE" });
    const reversal = buildReversal(original, "informei 100 por engano, era 0");

    expect(reversal.direction).toBe("OUT");
    expect(reversal.quantity).toBe(100);
    expect(reversal.movementType).toBe("REVERSAL");

    // Convenção atual: o original NUNCA vira REVERSED — permanece POSTED e o
    // efeito é cancelado pela compensação REVERSAL (POSTED, direção oposta).
    // Ambos somam no saldo e o par zera o efeito líquido.
    const after: LedgerMovement[] = [original, reversal];
    expect(original.status).toBe("POSTED");
    expect(reversal.status).toBe("POSTED");
    expect(calculateBalance(after)).toBe(0);
    // Status legado REVERSED também não compõe o saldo.
    const legacy = [{ ...original, status: "REVERSED" } as LedgerMovement];
    expect(calculateBalance(legacy)).toBe(0);
  });

  it("saldo negativo é bloqueado quando allow_negative_inventory = false", () => {
    const movements = [movement({ direction: "IN", quantity: 10 })];
    const balance = calculateBalance(movements);
    const withAllowNegative = canPostOut(balance, 12, false);
    expect(withAllowNegative.ok).toBe(false);
    if (!withAllowNegative.ok) {
      expect(withAllowNegative.reason).toContain("Saldo insuficiente");
    }
    expect(canPostOut(balance, 12, true).ok).toBe(true);
  });

  it("concorrência: duas saídas simultâneas validam o saldo a cada postagem", () => {
    // Saldo = 10. Usuário A tira 8; usuário B tira 7 ao mesmo tempo.
    // O padrão proibido validaria os dois contra o saldo antigo e terminaria
    // em saldo negativo. O padrão do ledger revalida após cada POST e bloqueia
    // a segunda saída quando o saldo não cobre.
    const movements: LedgerMovement[] = [movement({ direction: "IN", quantity: 10 })];

    const first = canPostOut(calculateBalance(movements), 8, false);
    expect(first.ok).toBe(true);
    if (first.ok) {
      movements.push(movement({ direction: "OUT", quantity: 8, movementType: "SALE" }));
    }

    const second = canPostOut(calculateBalance(movements), 7, false);
    expect(second.ok).toBe(false);
    // Sequência em ordem inversa também falha de forma consistente.
    const alternate: LedgerMovement[] = [movement({ direction: "IN", quantity: 10 })];
    if (canPostOut(calculateBalance(alternate), 7, false).ok) {
      alternate.push(movement({ direction: "OUT", quantity: 7, movementType: "SALE" }));
    }
    expect(canPostOut(calculateBalance(alternate), 8, false).ok).toBe(false);
  });

  it("idempotência: mesmo idempotency_key não gera segunda movimentação", () => {
    const used = new Set<string>();
    const key = idempotencyKey("marketplace", "12345");
    expect(isUniqueIdempotency(used, key)).toBe(true);
    used.add(key);
    expect(isUniqueIdempotency(used, key)).toBe(false);
    expect(isUniqueIdempotency(used, null)).toBe(true);
    expect(key).toBe("marketplace:12345");
  });

  it("cenário empresarial de aceite (sapatilha ballet 34/rosa)", () => {
    // Abertura na Fábrica +100; transferir 10 para Loja própria; remeter 20
    // para o Parceiro A. Remessa NÃO é venda: nenhum movimento de tipo de
    // venda ou saída financeira deve existir.
    const factory = "FABRICA";
    const store = "LOJA";
    const partner = "PARCEIRO_A";

    const movements: LedgerMovement[] = [
      movement({
        direction: "IN",
        quantity: 100,
        locationId: factory,
        movementType: "OPENING_BALANCE",
      }),
    ];
    const transfer = buildTransferPair({
      variantId: "V1",
      quantity: 10,
      sourceLocationId: factory,
      destinationLocationId: store,
      transferId: "T-1",
    });
    movements.push(...transfer);
    const shipment = buildTransferPair({
      variantId: "V1",
      quantity: 20,
      sourceLocationId: factory,
      destinationLocationId: partner,
      transferId: "SHIP-1",
      transferType: "PARTNER_SHIPMENT",
    });
    movements.push(...shipment);

    expect(shipment[0].movementType).toBe("PARTNER_SHIPMENT");
    expect(shipment[0].direction).toBe("OUT");
    expect(shipment[1].movementType).toBe("PARTNER_SHIPMENT");
    expect(shipment[1].direction).toBe("IN");
    expect(calculateBalanceAt(movements, "V1", factory)).toBe(70);
    expect(calculateBalanceAt(movements, "V1", store)).toBe(10);
    expect(calculateBalanceAt(movements, "V1", partner)).toBe(20);
    expect(calculateTotalBalance(movements, "V1")).toBe(100);

    // Nenhum movimento de venda nem referência financeira nasce da remessa.
    expect(movements.some((m) => m.movementType === "SALE")).toBe(false);
    expect(movements.every((m) => typeof m.quantity === "number")).toBe(true);
  });
});
