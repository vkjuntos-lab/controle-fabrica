import * as React from "react";

export type ReceiptWidth = 58 | 80;
export type ReceiptFont = "helvetica" | "courier" | "times";

export type ReceiptSettings = {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  cnpj: string;
  widthMm: ReceiptWidth;
  font: ReceiptFont;
  footer: string;
  logoDataUrl: string | null; // base64 PNG/JPG
};

export const defaultSettings: ReceiptSettings = {
  companyName: "KS MultiMake",
  addressLine1: "Loja Vila Madalena · Caixa 02",
  addressLine2: "R. Fradique Coutinho, 1200 — São Paulo/SP",
  cnpj: "CNPJ 00.000.000/0001-00",
  widthMm: 80,
  font: "helvetica",
  footer: "Obrigado pela preferência! · ks-multimake.com.br",
  logoDataUrl: null,
};

const STORAGE_KEY = "ks-pdv-receipt-settings-v1";

type Ctx = {
  settings: ReceiptSettings;
  update: (patch: Partial<ReceiptSettings>) => void;
  reset: () => void;
};

const SettingsContext = React.createContext<Ctx | null>(null);

export function ReceiptSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<ReceiptSettings>(defaultSettings);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...defaultSettings, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, []);

  React.useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const value = React.useMemo<Ctx>(
    () => ({
      settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      reset: () => setSettings(defaultSettings),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useReceiptSettings() {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error("useReceiptSettings must be used inside <ReceiptSettingsProvider>");
  return ctx;
}
