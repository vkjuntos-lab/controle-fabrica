import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import JSZip from "jszip";
import {
  Sparkles,
  Upload,
  Download,
  Loader2,
  ImageIcon,
  Package,
  History,
  Trash2,
  RotateCcw,
  Store,
  CheckCircle2,
  XCircle,
  Clock,
  PlayCircle,
  Archive,
  Droplets,
} from "lucide-react";
import {
  enhanceMarketingPhoto,
  MARKETING_PRESETS,
  type MarketingPresetKey,
} from "@/lib/pdv-marketing-photos.functions";
import { fetchCatalog, type CatalogProduct } from "@/lib/pdv-catalog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  applyWatermark,
  dataUrlToBlob,
  DEFAULT_WATERMARK,
  type WatermarkConfig,
  type WatermarkPosition,
} from "@/lib/pdv-marketing-watermark";
import {
  attachGenerationToProduct,
  deleteGeneration,
  downloadGenerationBlob,
  insertGeneration,
  listGenerationsForProduct,
  markCurrent,
  signedUrl,
  uploadGenerationImage,
  type GenerationRow,
  type GenerationStatus,
} from "@/lib/pdv-marketing-history";

export const Route = createFileRoute("/pdv/marketing-fotos")({
  head: () => ({
    meta: [
      { title: "Fotos para Marketing IA — KS MultiMake" },
      {
        name: "description",
        content:
          "Ajuste fotos de produtos automaticamente para marketplaces, Instagram, Stories e WhatsApp com IA, com histórico, marca d'água e exportação em ZIP.",
      },
    ],
  }),
  component: MarketingPhotosPage,
});

const PRESET_KEYS = Object.keys(MARKETING_PRESETS) as MarketingPresetKey[];

type Slot = {
  status: GenerationStatus;
  rawDataUrl?: string; // original IA output (no watermark)
  displayUrl?: string; // watermark applied (or raw)
  error?: string;
  generationId?: string;
  imagePath?: string;
};
type Slots = Partial<Record<MarketingPresetKey, Slot>>;

async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function urlToBase64(url: string): Promise<{ b64: string; mime: string }> {
  const r = await fetch(url);
  const blob = await r.blob();
  return { b64: await fileToBase64(blob), mime: blob.type || "image/jpeg" };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

const STATUS_META: Record<
  GenerationStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  queued: {
    label: "Na fila",
    className: "bg-muted text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
  processing: {
    label: "Em andamento",
    className: "bg-blue-500/15 text-blue-600",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  done: {
    label: "Concluído",
    className: "bg-emerald-500/15 text-emerald-600",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  error: {
    label: "Erro",
    className: "bg-destructive/15 text-destructive",
    icon: <XCircle className="h-3 w-3" />,
  },
};

function StatusBadge({ status }: { status: GenerationStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.className}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

function MarketingPhotosPage() {
  const enhanceFn = useServerFn(enhanceMarketingPhoto);
  const qc = useQueryClient();
  const { currentStoreId } = useCurrentStore();

  const [source, setSource] = React.useState<"upload" | "catalog">("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [productId, setProductId] = React.useState<string>("");
  const [slots, setSlots] = React.useState<Slots>({});
  const [globalErr, setGlobalErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [wm, setWm] = React.useState<WatermarkConfig>(DEFAULT_WATERMARK);
  const [publishToStorefront, setPublishToStorefront] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(true);

  const catalogQ = useQuery({
    queryKey: ["catalog-marketing"],
    queryFn: fetchCatalog,
    staleTime: 60_000,
  });

  const selectedProduct: CatalogProduct | undefined = React.useMemo(
    () => catalogQ.data?.find((p) => p.id === productId),
    [catalogQ.data, productId],
  );

  // History query (only when a product is selected)
  const historyQ = useQuery({
    queryKey: ["marketing-history", productId],
    queryFn: () => listGenerationsForProduct(productId),
    enabled: !!productId,
    staleTime: 15_000,
  });

  const [historyUrls, setHistoryUrls] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const rows = historyQ.data ?? [];
      const map: Record<string, string> = {};
      await Promise.all(
        rows
          .filter((r) => r.image_path)
          .map(async (r) => {
            const u = await signedUrl(r.image_path!);
            if (u) map[r.id] = u;
          }),
      );
      if (alive) setHistoryUrls(map);
    })();
    return () => {
      alive = false;
    };
  }, [historyQ.data]);

  // Preview from upload
  React.useEffect(() => {
    if (source !== "upload" || !file) {
      if (source === "upload") setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, source]);

  // Preview from catalog
  React.useEffect(() => {
    if (source !== "catalog" || !selectedProduct?.image_url) {
      if (source === "catalog") setPreview(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase.storage
        .from("product-images")
        .createSignedUrl(selectedProduct.image_url!, 3600);
      if (alive) setPreview(data?.signedUrl ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [selectedProduct, source]);

  // Re-apply watermark to all done slots when config changes
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const updates: Slots = {};
      for (const [k, s] of Object.entries(slots)) {
        if (s?.status === "done" && s.rawDataUrl) {
          const wmed = await applyWatermark(s.rawDataUrl, wm);
          updates[k as MarketingPresetKey] = { ...s, displayUrl: wmed };
        }
      }
      if (alive && Object.keys(updates).length) {
        setSlots((p) => ({ ...p, ...updates }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wm.enabled, wm.kind, wm.text, wm.logoDataUrl, wm.position, wm.opacity, wm.scale]);

  async function getSourceImage(): Promise<{ b64: string; mime: string } | null> {
    if (source === "upload") {
      if (!file) return null;
      return { b64: await fileToBase64(file), mime: file.type || "image/jpeg" };
    }
    if (!preview) return null;
    return urlToBase64(preview);
  }

  async function processOne(
    k: MarketingPresetKey,
    img: { b64: string; mime: string },
  ) {
    setSlots((p) => ({ ...p, [k]: { ...(p[k] ?? {}), status: "processing" } }));
    try {
      const out = await enhanceFn({
        data: {
          imageBase64: img.b64,
          imageMime: img.mime,
          preset: k,
          productName: selectedProduct?.name ?? null,
          brand: selectedProduct?.brand ?? null,
        },
      });
      if (!out.ok) {
        if (currentStoreId) {
          await insertGeneration({
            store_id: currentStoreId,
            product_id: productId || null,
            preset: k,
            status: "error",
            error: out.error,
          }).catch(() => {});
        }
        setSlots((p) => ({
          ...p,
          [k]: { status: "error", error: out.error },
        }));
        return;
      }
      const rawDataUrl = `data:${out.mime};base64,${out.imageBase64}`;
      let imagePath: string | undefined;
      let generationId: string | undefined;
      if (currentStoreId) {
        try {
          imagePath = await uploadGenerationImage(
            currentStoreId,
            productId || null,
            out.imageBase64,
            out.mime,
          );
          const row = await insertGeneration({
            store_id: currentStoreId,
            product_id: productId || null,
            preset: k,
            status: "done",
            image_path: imagePath,
          });
          generationId = row.id;
        } catch (e) {
          console.warn("[history] failed to persist", e);
        }
      }
      const displayUrl = await applyWatermark(rawDataUrl, wm);
      setSlots((p) => ({
        ...p,
        [k]: {
          status: "done",
          rawDataUrl,
          displayUrl,
          imagePath,
          generationId,
        },
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha";
      setSlots((p) => ({ ...p, [k]: { status: "error", error: msg } }));
    } finally {
      if (productId) qc.invalidateQueries({ queryKey: ["marketing-history", productId] });
    }
  }

  async function generate(keys: MarketingPresetKey[]) {
    setGlobalErr(null);
    const img = await getSourceImage();
    if (!img) {
      setGlobalErr("Selecione uma imagem primeiro.");
      return;
    }
    setBusy(true);
    setSlots((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = { status: "queued" };
      return next;
    });
    for (const k of keys) {
      await processOne(k, img);
    }
    setBusy(false);
  }

  async function retryFailed() {
    const failed = PRESET_KEYS.filter((k) => slots[k]?.status === "error");
    if (failed.length) await generate(failed);
  }

  const failedCount = PRESET_KEYS.filter((k) => slots[k]?.status === "error").length;
  const doneCount = PRESET_KEYS.filter((k) => slots[k]?.status === "done").length;

  async function downloadOne(k: MarketingPresetKey) {
    const s = slots[k];
    if (!s?.displayUrl) return;
    const a = document.createElement("a");
    a.href = s.displayUrl;
    a.download = `${(selectedProduct?.name ?? "foto").replace(/\s+/g, "-")}-${k}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadZip() {
    const zip = new JSZip();
    const base = (selectedProduct?.name ?? "fotos").replace(/\s+/g, "-").toLowerCase();
    let n = 0;
    for (const k of PRESET_KEYS) {
      const s = slots[k];
      if (s?.status === "done" && s.displayUrl) {
        zip.file(`${base}-${k}.png`, dataUrlToBlob(s.displayUrl));
        n++;
      }
    }
    if (!n) {
      setGlobalErr("Gere pelo menos uma imagem antes de exportar.");
      return;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-marketing.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onLogoUpload(f: File | null) {
    if (!f) return setWm((p) => ({ ...p, logoDataUrl: null }));
    const dataUrl = await blobToDataUrl(f);
    setWm((p) => ({ ...p, logoDataUrl: dataUrl, kind: "logo", enabled: true }));
  }

  async function revertToGeneration(row: GenerationRow) {
    if (!row.image_path) return;
    const blob = await downloadGenerationBlob(row.image_path);
    if (!blob) {
      setGlobalErr("Não foi possível baixar essa versão.");
      return;
    }
    const rawDataUrl = await blobToDataUrl(blob);
    const displayUrl = await applyWatermark(rawDataUrl, wm);
    setSlots((p) => ({
      ...p,
      [row.preset as MarketingPresetKey]: {
        status: "done",
        rawDataUrl,
        displayUrl,
        imagePath: row.image_path!,
        generationId: row.id,
      },
    }));
    await markCurrent(row);
    qc.invalidateQueries({ queryKey: ["marketing-history", productId] });
  }

  async function removeGeneration(row: GenerationRow) {
    if (!confirm("Remover esta versão do histórico?")) return;
    await deleteGeneration(row);
    qc.invalidateQueries({ queryKey: ["marketing-history", productId] });
  }

  async function attachToCatalog(k: MarketingPresetKey) {
    const s = slots[k];
    if (!s?.displayUrl || !currentStoreId) return;
    if (!productId) {
      setGlobalErr("Selecione um produto do catálogo antes de anexar.");
      return;
    }
    try {
      await attachGenerationToProduct({
        productId,
        storeId: currentStoreId,
        imageBlob: dataUrlToBlob(s.displayUrl),
        publishToStorefront,
      });
      qc.invalidateQueries({ queryKey: ["catalog-marketing"] });
      alert(
        publishToStorefront
          ? "Foto vinculada ao produto e publicada no e-commerce."
          : "Foto vinculada ao produto no catálogo.",
      );
    } catch (e) {
      setGlobalErr(e instanceof Error ? e.message : "Falha ao anexar.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" />
            Fotos para Marketing com IA
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajuste, versione, aplique marca d'água, exporte em ZIP e vincule ao catálogo/e-commerce.
          </p>
        </div>
      </header>

      {/* Fonte + preview + ações */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setSource("upload")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
              source === "upload"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background"
            }`}
          >
            <Upload className="h-4 w-4" /> Upload direto
          </button>
          <button
            onClick={() => setSource("catalog")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
              source === "catalog"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background"
            }`}
          >
            <Package className="h-4 w-4" /> Do catálogo
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-3">
            {preview ? (
              <img
                src={preview}
                alt="Imagem selecionada"
                className="max-h-56 rounded-md object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-xs">Sem imagem</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {source === "upload" ? (
              <label className="flex cursor-pointer flex-col items-start gap-2 rounded-md border border-input bg-background p-3 text-sm">
                <span className="font-medium">Selecione a foto original</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                <span className="text-[11px] text-muted-foreground">
                  Para histórico e vincular ao catálogo, escolha "Do catálogo".
                </span>
              </label>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-input bg-background p-3 text-sm">
                <label className="text-xs font-medium">Produto do catálogo</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">— selecione —</option>
                  {(catalogQ.data ?? [])
                    .filter((p) => p.image_url)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.brand ? `— ${p.brand}` : ""}
                      </option>
                    ))}
                </select>
                {catalogQ.data && catalogQ.data.filter((p) => p.image_url).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum produto com foto cadastrada.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => generate([...PRESET_KEYS])}
                disabled={busy || !preview}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Gerar todos os formatos
              </button>
              <button
                onClick={retryFailed}
                disabled={busy || failedCount === 0}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50"
                title="Reprocessar apenas as fotos que falharam"
              >
                <PlayCircle className="h-4 w-4" />
                Reprocessar falhas {failedCount ? `(${failedCount})` : ""}
              </button>
              <button
                onClick={downloadZip}
                disabled={doneCount === 0}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                Baixar ZIP {doneCount ? `(${doneCount})` : ""}
              </button>
              {globalErr && (
                <span className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                  {globalErr}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Watermark controls */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Droplets className="h-4 w-4 text-primary" />
            Marca d'água
          </h2>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={wm.enabled}
              onChange={(e) => setWm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            Ativar
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-[11px] font-medium">Tipo</label>
            <div className="mt-1 flex gap-1">
              <button
                onClick={() => setWm((p) => ({ ...p, kind: "text" }))}
                className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                  wm.kind === "text"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }`}
              >
                Texto
              </button>
              <button
                onClick={() => setWm((p) => ({ ...p, kind: "logo" }))}
                className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                  wm.kind === "logo"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background"
                }`}
              >
                Logo
              </button>
            </div>
          </div>

          {wm.kind === "text" ? (
            <div className="sm:col-span-2">
              <label className="text-[11px] font-medium">Texto</label>
              <input
                value={wm.text ?? ""}
                onChange={(e) => setWm((p) => ({ ...p, text: e.target.value }))}
                placeholder="@sualoja"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label className="text-[11px] font-medium">Logo (PNG transparente ideal)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onLogoUpload(e.target.files?.[0] ?? null)}
                className="mt-1 text-xs"
              />
              {wm.logoDataUrl && (
                <img
                  src={wm.logoDataUrl}
                  alt="logo"
                  className="mt-1 h-10 w-auto rounded border border-border bg-white/50 p-1"
                />
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium">Posição</label>
            <select
              value={wm.position}
              onChange={(e) =>
                setWm((p) => ({ ...p, position: e.target.value as WatermarkPosition }))
              }
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="top-left">Superior esq.</option>
              <option value="top-right">Superior dir.</option>
              <option value="center">Centro</option>
              <option value="bottom-left">Inferior esq.</option>
              <option value="bottom-right">Inferior dir.</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium">
              Opacidade: {Math.round(wm.opacity * 100)}%
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(wm.opacity * 100)}
              onChange={(e) =>
                setWm((p) => ({ ...p, opacity: Number(e.target.value) / 100 }))
              }
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium">
              Tamanho: {Math.round(wm.scale * 100)}%
            </label>
            <input
              type="range"
              min={5}
              max={50}
              value={Math.round(wm.scale * 100)}
              onChange={(e) =>
                setWm((p) => ({ ...p, scale: Number(e.target.value) / 100 }))
              }
              className="mt-1 w-full"
            />
          </div>
        </div>
      </section>

      {/* Slots */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRESET_KEYS.map((k) => {
          const preset = MARKETING_PRESETS[k];
          const s = slots[k];
          return (
            <article
              key={k}
              className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="flex items-start justify-between gap-2 border-b border-border p-3">
                <div>
                  <h3 className="text-sm font-semibold">{preset.label}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {preset.size} — {preset.ratio}
                  </p>
                </div>
                {s?.status && <StatusBadge status={s.status} />}
              </div>
              <div className="flex flex-1 items-center justify-center bg-muted/30 p-3">
                {s?.status === "queued" && (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Clock className="h-6 w-6" />
                    <span className="text-xs">Na fila…</span>
                  </div>
                )}
                {s?.status === "processing" && (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">Gerando…</span>
                  </div>
                )}
                {s?.status === "done" && s.displayUrl && (
                  <img
                    src={s.displayUrl}
                    alt={preset.label}
                    className="max-h-64 rounded-md object-contain"
                  />
                )}
                {s?.status === "error" && (
                  <p className="text-center text-xs text-destructive">{s.error}</p>
                )}
                {!s && (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">Aguardando geração</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border p-3">
                <button
                  onClick={() => generate([k])}
                  disabled={busy || !preview}
                  className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {s?.status === "done" ? "Regerar" : s?.status === "error" ? "Reprocessar" : "Gerar"}
                </button>
                {s?.status === "done" && (
                  <>
                    <button
                      onClick={() => downloadOne(k)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar
                    </button>
                    {productId && (
                      <button
                        onClick={() => attachToCatalog(k)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        title="Definir como foto do produto no catálogo"
                      >
                        <Store className="h-3.5 w-3.5" /> Vincular
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* Publicação no e-commerce */}
      {productId && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publishToStorefront}
              onChange={(e) => setPublishToStorefront(e.target.checked)}
            />
            <Store className="h-4 w-4 text-primary" />
            Ao vincular ao catálogo, publicar automaticamente no e-commerce (vitrine pública)
          </label>
        </section>
      )}

      {/* Histórico */}
      {productId && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="mb-3 flex w-full items-center justify-between gap-2 text-left"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" />
              Histórico de gerações ({historyQ.data?.length ?? 0})
            </h2>
            <span className="text-xs text-muted-foreground">
              {historyOpen ? "Recolher" : "Expandir"}
            </span>
          </button>
          {historyOpen && (
            <>
              {historyQ.isLoading && (
                <p className="text-xs text-muted-foreground">Carregando…</p>
              )}
              {!historyQ.isLoading && (historyQ.data?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma geração salva para este produto ainda.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(historyQ.data ?? []).map((row) => {
                  const url = historyUrls[row.id];
                  const label = MARKETING_PRESETS[row.preset as MarketingPresetKey]?.label ?? row.preset;
                  return (
                    <div
                      key={row.id}
                      className={`flex flex-col overflow-hidden rounded-xl border ${
                        row.is_current ? "border-primary" : "border-border"
                      } bg-background`}
                    >
                      <div className="flex items-center justify-between gap-2 p-2">
                        <span className="truncate text-[11px] font-medium">{label}</span>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="flex h-32 items-center justify-center bg-muted/30">
                        {url ? (
                          <img
                            src={url}
                            alt={label}
                            className="max-h-32 object-contain"
                          />
                        ) : row.status === "error" ? (
                          <p className="p-2 text-center text-[10px] text-destructive">
                            {row.error ?? "Erro"}
                          </p>
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 border-t border-border p-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <div className="flex gap-1">
                          {row.status === "done" && row.image_path && (
                            <button
                              onClick={() => revertToGeneration(row)}
                              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                              title="Reverter para esta versão"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => removeGeneration(row)}
                            className="inline-flex items-center gap-1 rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10"
                            title="Excluir"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
