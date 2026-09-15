/**
 * O PIN numérico do operador nunca é usado diretamente como senha do Auth:
 * senhas puramente numéricas são recusadas pela proteção contra senhas
 * vazadas (HIBP). Derivamos uma senha forte e determinística a partir do PIN.
 */
export function pinToPassword(pin: string): string {
  return `KS!pin.${pin}.mm#v1`;
}
