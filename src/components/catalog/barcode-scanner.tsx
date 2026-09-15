import * as React from "react";
import { Camera, X } from "lucide-react";

/**
 * Scanner de código de barras usando a BarcodeDetector API nativa.
 * Fallback: entrada manual + placeholder pedindo teclado do leitor USB.
 */
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

export function BarcodeScanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [supported, setSupported] = React.useState(true);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
    if (!w.BarcodeDetector) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    let raf = 0;
    const detector = new w.BarcodeDetector({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
    });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length) {
              onDetect(results[0].rawValue);
              return;
            }
          } catch { /* ignore per-frame errors */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr("Não consegui abrir a câmera. Use o campo abaixo.");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Leitor de código de barras</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4">
          {supported ? (
            <div className="overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              Este navegador não tem leitor nativo. Use o leitor USB (ele digita como teclado) ou digite abaixo.
            </div>
          )}
          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manual.trim()) {
                  onDetect(manual.trim());
                }
              }}
              placeholder="Digite ou passe o leitor…"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => manual.trim() && onDetect(manual.trim())}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Usar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
