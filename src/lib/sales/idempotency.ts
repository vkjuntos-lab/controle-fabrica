/**
 * Derivação da chave de idempotência do gateway de vendas.
 *
 * `sales_execute` exige uma chave no formato UUID e obedece a duas regras: a
 * mesma chave com o mesmo conteúdo devolve o mesmo resultado, e a mesma chave com
 * conteúdo diferente é recusada. A chave precisa, então, carregar o conteúdo da
 * operação sem depender apenas de aleatoriedade.
 *
 * Fica isolado em módulo puro, sem React, para ser testado diretamente: um erro
 * aqui só apareceria em produção, e a consequência seria pedido duplicado.
 */

/** Resumo estável do payload (FNV-1a de 32 bits, em hexadecimal). */
export function payloadDigest(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Monta um UUID válido a partir do identificador da tentativa e do resumo do
 * payload. A tentativa ocupa os grupos fixos; o resumo ocupa o grupo da versão e
 * o da variante, que é o que faz o mesmo conteúdo cair sempre na mesma chave.
 */
export function keyFrom(attempt: string, digest: string): string {
  const hex = attempt.replace(/-/g, "");
  const variant = "89ab"[Number.parseInt(digest[3], 16) % 4];
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${digest.slice(0, 3)}`,
    `${variant}${digest.slice(4, 7)}`,
    hex.slice(12, 24),
  ].join("-");
}

/** Chave de idempotência de uma tentativa, já serializando o payload. */
export function keyForPayload(attempt: string, payload: unknown): string {
  return keyFrom(attempt, payloadDigest(JSON.stringify(payload ?? null)));
}
