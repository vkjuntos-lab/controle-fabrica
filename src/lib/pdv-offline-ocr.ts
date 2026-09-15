// OCR offline via Tesseract.js — carregado sob demanda (lazy).
// Rota secundária opt-in: só é invocada quando a feature flag
// "catalog.offline_ocr_enabled" está ligada E o usuário clica no botão.
// NÃO substitui o fluxo Gemini padrão.

export type OfflineOcrSuggestion = {
  rawText: string;
  barcode: string | null;
  precoVenda: number | null;
  precoCusto: number | null;
  marca: string | null;
  nomeSugerido: string | null;
};

type ProgressCb = (pct: number, status: string) => void;

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getWorker(onProgress?: ProgressCb) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker("por", 1, {
        logger: (m) => {
          if (onProgress && typeof m.progress === "number") {
            onProgress(Math.round(m.progress * 100), m.status ?? "");
          }
        },
      });
      return w;
    })();
  }
  return workerPromise;
}

const BRAND_HINTS = [
  "ruby rose", "vult", "quem disse berenice", "avon", "natura", "eudora",
  "boticario", "maybelline", "loreal", "l'oreal", "revlon", "mac", "nyx",
  "payot", "dermage", "granado", "risque", "impala", "colorama", "dailus",
];

function parsePrice(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/(\d{1,4})[.,](\d{2})/);
  if (!m) return null;
  const v = Number(`${m[1]}.${m[2]}`);
  return Number.isFinite(v) ? v : null;
}

function extractSuggestions(rawText: string): Omit<OfflineOcrSuggestion, "rawText"> {
  const text = rawText.replace(/\r/g, "");
  const lower = text.toLowerCase();

  // EAN-13 / EAN-8
  const barcodeMatch = text.match(/\b(\d{13}|\d{8})\b/);
  const barcode = barcodeMatch?.[1] ?? null;

  // Marca por dicionário
  let marca: string | null = null;
  for (const b of BRAND_HINTS) {
    if (lower.includes(b)) {
      marca = b.replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
  }

  // Preços: procura por "R$" ou padrão numérico com vírgula
  const precos: number[] = [];
  const re = /r?\$?\s*(\d{1,4}[.,]\d{2})/gi;
  for (const m of text.matchAll(re)) {
    const v = parsePrice(m[1]);
    if (v !== null) precos.push(v);
  }
  precos.sort((a, b) => a - b);
  const precoCusto = precos.length >= 2 ? precos[0] : null;
  const precoVenda = precos.length >= 1 ? precos[precos.length - 1] : null;

  // Nome sugerido: primeira linha "significativa" (>= 4 letras, não só dígitos)
  const nomeSugerido =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 4 && /[a-zA-ZÀ-ÿ]/.test(l) && !/^\d+$/.test(l)) ?? null;

  return { barcode, precoVenda, precoCusto, marca, nomeSugerido };
}

export async function runOfflineOcr(
  file: Blob,
  onProgress?: ProgressCb,
): Promise<OfflineOcrSuggestion> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(file);
  const rawText = data.text ?? "";
  return { rawText, ...extractSuggestions(rawText) };
}

export async function terminateOfflineOcr() {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* ignore */
  } finally {
    workerPromise = null;
  }
}
