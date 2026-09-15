/**
 * Client-side watermark composition (text or logo) on a canvas.
 * Applied at preview/download/ZIP time so the raw generation stays intact.
 */
export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export type WatermarkConfig = {
  enabled: boolean;
  kind: "text" | "logo";
  text?: string;
  logoDataUrl?: string | null;
  position: WatermarkPosition;
  opacity: number; // 0..1
  scale: number; // 0.05..0.5 (relative to width)
};

export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: false,
  kind: "text",
  text: "@ksmultimake",
  logoDataUrl: null,
  position: "bottom-right",
  opacity: 0.7,
  scale: 0.18,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function anchor(pos: WatermarkPosition, W: number, H: number, w: number, h: number) {
  const pad = Math.max(12, Math.round(Math.min(W, H) * 0.02));
  switch (pos) {
    case "top-left":
      return { x: pad, y: pad };
    case "top-right":
      return { x: W - w - pad, y: pad };
    case "bottom-left":
      return { x: pad, y: H - h - pad };
    case "center":
      return { x: (W - w) / 2, y: (H - h) / 2 };
    default:
      return { x: W - w - pad, y: H - h - pad };
  }
}

export async function applyWatermark(
  imageDataUrl: string,
  cfg: WatermarkConfig,
): Promise<string> {
  const src = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0);

  if (!cfg.enabled) return canvas.toDataURL("image/png");

  ctx.globalAlpha = Math.max(0, Math.min(1, cfg.opacity));

  if (cfg.kind === "logo" && cfg.logoDataUrl) {
    const logo = await loadImage(cfg.logoDataUrl);
    const targetW = canvas.width * cfg.scale;
    const targetH = (logo.naturalHeight / logo.naturalWidth) * targetW;
    const { x, y } = anchor(cfg.position, canvas.width, canvas.height, targetW, targetH);
    ctx.drawImage(logo, x, y, targetW, targetH);
  } else if (cfg.kind === "text" && cfg.text) {
    const fontSize = Math.max(14, canvas.width * cfg.scale * 0.35);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const metrics = ctx.measureText(cfg.text);
    const w = metrics.width;
    const h = fontSize * 1.2;
    const { x, y } = anchor(cfg.position, canvas.width, canvas.height, w, h);
    // subtle stroke for legibility
    ctx.textBaseline = "top";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(1, fontSize * 0.06);
    ctx.strokeText(cfg.text, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(cfg.text, x, y);
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/png");
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
