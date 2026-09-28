import { describe, expect, it } from "vitest";
import { z } from "zod";

import { keyForPayload, payloadDigest } from "@/lib/sales/idempotency";
import {
  SETTING_OPTIONS,
  SETTING_FLAGS,
  ORDER_ACTIONS,
  ORDER_STATUS,
} from "@/lib/sales/constants";

/**
 * O mesmo validador usado por `mutateSales`: `sales_execute` recebe a chave como
 * `uuid`, e um formato inválido faria toda escrita de vendas falhar.
 */
const uuid = z.string().uuid();

const ATTEMPT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("chave de idempotência de vendas", () => {
  it("gera uma chave no formato UUID exigido pelo gateway", () => {
    const key = keyForPayload(ATTEMPT, { operation: "save", values: { company_id: "a" } });
    expect(uuid.parse(key)).toBe(key);
  });

  it("mantém o formato UUID para qualquer tentativa", () => {
    for (let index = 0; index < 200; index += 1) {
      const attempt = crypto.randomUUID();
      for (const payload of [null, {}, { a: 1 }, { nested: { b: [1, 2, 3] } }, "texto"]) {
        expect(() => uuid.parse(keyForPayload(attempt, payload))).not.toThrow();
      }
    }
  });

  it("repetir o mesmo conteúdo reenvia a mesma chave", () => {
    const payload = { operation: "save", values: { company_id: "a", quantity: 2 } };
    expect(keyForPayload(ATTEMPT, payload)).toBe(keyForPayload(ATTEMPT, payload));
  });

  it("conteúdo diferente produz chave diferente", () => {
    const base = { operation: "save", values: { company_id: "a" } };
    const other = { operation: "save", values: { company_id: "b" } };
    expect(keyForPayload(ATTEMPT, base)).not.toBe(keyForPayload(ATTEMPT, other));
  });

  it("a ordem das chaves do payload não muda a chave", () => {
    // O gateway compara o conteúdo do payload: a mesma informação serializada de
    // outra ordem precisa cair na mesma chave, sob pena de recusar o reenvio.
    expect(keyForPayload(ATTEMPT, { a: 1, b: 2 })).toBe(keyForPayload(ATTEMPT, { b: 2, a: 1 }));
  });

  it("uma tentativa nova não repete a chave da tentativa anterior", () => {
    const payload = { operation: "save", values: {} };
    const first = keyForPayload(ATTEMPT, payload);
    const second = keyForPayload(crypto.randomUUID(), payload);
    expect(first).not.toBe(second);
  });

  it("resume conteúdos diferentes em resumos diferentes", () => {
    expect(payloadDigest("a")).not.toBe(payloadDigest("b"));
    expect(payloadDigest("")).toHaveLength(8);
    expect(payloadDigest("conteúdo com acento: ação")).toHaveLength(8);
  });
});

describe("constantes de vendas", () => {
  it("cobre todas as doze políticas validadas pelo servidor", () => {
    // `sales_settings_save` valida cinco opções, cinco booleanos, a validade da
    // reserva e o desconto máximo: doze políticas editáveis.
    const options = Object.keys(SETTING_OPTIONS).length;
    const flags = Object.keys(SETTING_FLAGS).length;
    expect(options + flags + 2).toBe(12);
  });

  it("não repete códigos dentro de uma política com opções", () => {
    for (const [key, option] of Object.entries(SETTING_OPTIONS)) {
      expect(new Set(option.options).size, key).toBe(option.options.length);
      for (const value of option.options) {
        expect(option.labels[value as keyof typeof option.labels], `${key}.${value}`).toBeTruthy();
      }
    }
  });

  it("tem ação declarada para todo status de pedido", () => {
    for (const status of Object.keys(ORDER_STATUS)) {
      expect(ACTIONS[status], status).toBeDefined();
    }
  });

  it("não oferece ação em status terminal", () => {
    expect(ORDER_ACTIONS.CLOSED).toEqual([]);
    expect(ORDER_ACTIONS.CANCELED).toEqual([]);
  });
});
