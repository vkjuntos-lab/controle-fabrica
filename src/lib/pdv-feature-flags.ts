// Feature flags locais (por usuário / dispositivo).
// Não afetam o fluxo padrão; servem para habilitar rotas secundárias opt-in.

export type FeatureFlag = "catalog.offline_ocr_enabled";

const PREFIX = "ksmm.flag.";

export function getFlag(name: FeatureFlag): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PREFIX + name) === "1";
}

export function setFlag(name: FeatureFlag, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + name, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ksmm:flag", { detail: { name, value } }));
}

import * as React from "react";

export function useFlag(name: FeatureFlag): [boolean, (v: boolean) => void] {
  const [v, setV] = React.useState<boolean>(() => getFlag(name));
  React.useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { name: FeatureFlag; value: boolean };
      if (d?.name === name) setV(d.value);
    };
    window.addEventListener("ksmm:flag", h);
    return () => window.removeEventListener("ksmm:flag", h);
  }, [name]);
  return [v, (nv: boolean) => setFlag(name, nv)];
}
