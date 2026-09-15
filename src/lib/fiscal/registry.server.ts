// Seleciona provider fiscal a partir do fiscal_settings.provider da loja.
import type { FiscalProvider } from "./types";
import { focusProvider } from "./focus.server";
import { makeSatProvider } from "./sat.server";

export function getProvider(name?: string | null, opts?: { satHost?: string | null }): FiscalProvider {
  switch ((name ?? "focus").toLowerCase()) {
    case "sat": return makeSatProvider(opts?.satHost);
    case "focus":
    default: return focusProvider;
  }
}
