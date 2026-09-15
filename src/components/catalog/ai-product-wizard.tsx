import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Camera, Mic, Loader2, X, HardDrive } from "lucide-react";
import {
  analyzeProductFromMedia,
  transcribeAudio,
} from "@/lib/pdv-ai-product.functions";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { uploadProductImage, upsertProduct, type Category } from "@/lib/pdv-catalog";
import { useFlag } from "@/lib/pdv-feature-flags";
import { runOfflineOcr } from "@/lib/pdv-offline-ocr";

type AiFields = {
  nome: string | null; marca: string | null; categoria: string | null;
  descricao: string | null; volume: string | null; cor: string | null;
  codigo_barras: string | null; fabricante: string | null;
  preco_custo: number | null; preco_venda: number | null;
  estoque_inicial: number | null; estoque_minimo: number | null;
  fornecedor: string | null; tags: string[]; confidence: number;
};

async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Grava PCM via Web Audio API e devolve WAV mono 16kHz. */
function useVoiceRecorder() {
  const [recording, setRecording] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<{
    stream?: MediaStream; ctx?: AudioContext; node?: ScriptProcessorNode;
    src?: MediaStreamAudioSourceNode; chunks: Float32Array[]; sampleRate: number;
  }>({ chunks: [], sampleRate: 16000 });

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AudioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    ref.current = { stream, ctx, node, src, chunks: [], sampleRate: ctx.sampleRate };
    node.onaudioprocess = (e) => {
      ref.current.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    src.connect(node); node.connect(ctx.destination);
    setRecording(true);
  }

  async function stop(): Promise<Blob | null> {
    setBusy(true);
    setRecording(false);
    const s = ref.current;
    s.stream?.getTracks().forEach((t) => t.stop());
    s.node?.disconnect(); s.src?.disconnect();
    await s.ctx?.close();
    if (!s.chunks.length) { setBusy(false); return null; }
    // concatena
    const total = s.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of s.chunks) { merged.set(c, off); off += c.length; }
    // downsample para 16k
    const targetRate = 16000;
    const ratio = s.sampleRate / targetRate;
    const outLen = Math.floor(merged.length / ratio);
    const ds = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = Math.floor(i * ratio);
      ds[i] = merged[idx];
    }
    // WAV encode PCM16 mono 16kHz
    const buffer = new ArrayBuffer(44 + ds.length * 2);
    const view = new DataView(buffer);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); view.setUint32(4, 36 + ds.length * 2, true); w(8, "WAVE");
    w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    w(36, "data"); view.setUint32(40, ds.length * 2, true);
    let p = 44;
    for (let i = 0; i < ds.length; i++) {
      const v = Math.max(-1, Math.min(1, ds[i]));
      view.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      p += 2;
    }
    setBusy(false);
    return new Blob([buffer], { type: "audio/wav" });
  }

  return { recording, busy, start, stop };
}

export function AiProductWizard({
  onClose,
  onSaved,
  categories,
}: {
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
}) {
  const { currentStoreId } = useCurrentStore();
  const analyzeFn = useServerFn(analyzeProductFromMedia);
  const sttFn = useServerFn(transcribeAudio);
  const recorder = useVoiceRecorder();
  const [offlineOcrOn] = useFlag("catalog.offline_ocr_enabled");

  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [voiceText, setVoiceText] = React.useState("");
  const [analyzing, setAnalyzing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AiFields | null>(null);
  const [ocrBusy, setOcrBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function toggleRecord() {
    setErr(null);
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob || blob.size < 2048) { setErr("Áudio muito curto. Grave novamente."); return; }
      const b64 = await fileToBase64(blob);
      const out = await sttFn({ data: { audioBase64: b64, mime: "audio/wav" } });
      if (!out.ok) { setErr(out.error); return; }
      setVoiceText((prev) => (prev ? prev + " " : "") + out.text);
    } else {
      try { await recorder.start(); } catch { setErr("Não consegui acessar o microfone."); }
    }
  }

  async function analyze() {
    setErr(null);
    if (!file && !voiceText.trim()) {
      setErr("Envie uma foto e/ou descreva o produto por voz.");
      return;
    }
    setAnalyzing(true);
    try {
      let imageBase64: string | null = null;
      let imageMime = "image/jpeg";
      if (file) {
        const compressed = await compressImage(file);
        imageBase64 = await fileToBase64(compressed);
        imageMime = "image/jpeg";
      }
      const out = await analyzeFn({
        data: { imageBase64, imageMime, voiceText: voiceText.trim() || null },
      });
      if (!out.ok) { setErr(out.error); return; }
      setResult(out.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao analisar.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeOffline() {
    setErr(null);
    if (!file) { setErr("Envie uma foto para o OCR offline."); return; }
    setOcrBusy("Preparando modelo…");
    try {
      const compressed = await compressImage(file);
      const s = await runOfflineOcr(compressed, (pct, status) => {
        setOcrBusy(`${status || "Processando"} ${pct}%`);
      });
      // preenche AiFields como sugestão — usuário revisa antes de salvar
      setResult({
        nome: s.nomeSugerido,
        marca: s.marca,
        categoria: null,
        descricao: s.rawText.slice(0, 300) || null,
        volume: null,
        cor: null,
        codigo_barras: s.barcode,
        fabricante: null,
        preco_custo: s.precoCusto,
        preco_venda: s.precoVenda,
        estoque_inicial: null,
        estoque_minimo: null,
        fornecedor: null,
        tags: ["ocr-offline"],
        confidence: 0.5,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no OCR offline.");
    } finally {
      setOcrBusy(null);
    }
  }


  async function save() {
    if (!result || !currentStoreId) return;
    setSaving(true);
    setErr(null);
    try {
      let imagePath: string | null = null;
      if (file) {
        const compressed = await compressImage(file);
        imagePath = await uploadProductImage(currentStoreId, compressed, "jpg");
      }
      // resolve categoria: procura por nome existente ou cria depois (manual)
      const cat = categories.find(
        (c) => c.name.toLowerCase() === (result.categoria ?? "").toLowerCase(),
      );
      await upsertProduct({
        store_id: currentStoreId,
        sku: (result.codigo_barras ?? crypto.randomUUID().slice(0, 8)).toUpperCase(),
        ean: result.codigo_barras,
        name: result.nome ?? "Produto sem nome",
        unit_price: result.preco_venda ?? 0,
        cost_price: result.preco_custo,
        brand: result.marca,
        description: result.descricao,
        image_url: imagePath,
        category_id: cat?.id ?? null,
        min_stock: result.estoque_minimo ?? 0,
        volume: result.volume,
        color: result.cor,
        supplier: result.fornecedor,
        tags: result.tags,
        ai_generated: true,
        active: true,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Cadastro Inteligente</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              IA
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">
              Envie uma foto da embalagem e/ou descreva o produto por voz. A IA
              preenche os campos para você revisar.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50">
                {preview ? (
                  <img src={preview} alt="Pré-visualização da imagem do produto" className="max-h-40 rounded-md object-contain" />
                ) : (
                  <>
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs font-medium">Foto da embalagem</span>
                    <span className="text-[10px] text-muted-foreground">toque para abrir a câmera</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <button
                  onClick={toggleRecord}
                  disabled={recorder.busy}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                    recorder.recording
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-primary text-primary-foreground"
                  } disabled:opacity-60`}
                >
                  <Mic className="h-4 w-4" />
                  {recorder.busy
                    ? "Transcrevendo…"
                    : recorder.recording
                    ? "Parar gravação"
                    : "Gravar descrição"}
                </button>
                <textarea
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  placeholder="Ex.: Base Ruby Rose bege 03, custou 8 reais, vendo por 24,90, tenho 30 unidades."
                  className="min-h-[80px] rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
            </div>

            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={analyzing || (!file && !voiceText.trim())}
              className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {analyzing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analisando com IA…
                </span>
              ) : (
                "✨ Analisar e preencher"
              )}
            </button>

            {offlineOcrOn && (
              <button
                onClick={analyzeOffline}
                disabled={!!ocrBusy || !file}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
                title="Reconhecimento local no navegador. Sem custo, precisão menor."
              >
                <HardDrive className="h-3.5 w-3.5" />
                {ocrBusy ?? "OCR offline (grátis, experimental)"}
              </button>
            )}
          </div>
        ) : (
          <ResultForm
            fields={result}
            onChange={setResult}
            preview={preview}
            categories={categories}
            saving={saving}
            err={err}
            onBack={() => setResult(null)}
            onSave={save}
          />
        )}
      </div>
    </div>
  );
}

function ResultForm({
  fields, onChange, preview, categories, saving, err, onBack, onSave,
}: {
  fields: AiFields;
  onChange: (f: AiFields) => void;
  preview: string | null;
  categories: Category[];
  saving: boolean;
  err: string | null;
  onBack: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof AiFields>(k: K, v: AiFields[K]) =>
    onChange({ ...fields, [k]: v });

  return (
    <div className="max-h-[80vh] space-y-3 overflow-y-auto p-4">
      <div className="flex items-start gap-3">
        {preview && (
          <img src={preview} alt="" className="h-24 w-24 rounded-md object-cover" />
        )}
        <div className="flex-1 text-xs">
          <div className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
            IA sugeriu os campos abaixo — confiança {Math.round((fields.confidence ?? 0) * 100)}%
          </div>
          <div className="mt-1 text-muted-foreground">
            Revise, corrija e salve. Campos vazios você preenche manualmente.
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Fld label="Nome"><In v={fields.nome ?? ""} on={(v) => set("nome", v)} /></Fld>
        <Fld label="Marca"><In v={fields.marca ?? ""} on={(v) => set("marca", v)} /></Fld>
        <Fld label="Categoria (existente)">
          <select
            value={categories.find((c) => c.name.toLowerCase() === (fields.categoria ?? "").toLowerCase())?.id ?? ""}
            onChange={(e) => {
              const c = categories.find((x) => x.id === e.target.value);
              set("categoria", c?.name ?? fields.categoria);
            }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— {fields.categoria ?? "sem categoria"} —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Fld>
        <Fld label="Código de barras"><In v={fields.codigo_barras ?? ""} on={(v) => set("codigo_barras", v)} /></Fld>
        <Fld label="Volume"><In v={fields.volume ?? ""} on={(v) => set("volume", v)} /></Fld>
        <Fld label="Cor"><In v={fields.cor ?? ""} on={(v) => set("cor", v)} /></Fld>
        <Fld label="Preço custo (R$)">
          <In v={fields.preco_custo?.toString() ?? ""} on={(v) => set("preco_custo", v ? Number(v.replace(",", ".")) : null)} />
        </Fld>
        <Fld label="Preço venda (R$)">
          <In v={fields.preco_venda?.toString() ?? ""} on={(v) => set("preco_venda", v ? Number(v.replace(",", ".")) : null)} />
        </Fld>
        <Fld label="Estoque inicial">
          <In v={fields.estoque_inicial?.toString() ?? ""} on={(v) => set("estoque_inicial", v ? Number(v) : null)} />
        </Fld>
        <Fld label="Estoque mínimo">
          <In v={fields.estoque_minimo?.toString() ?? ""} on={(v) => set("estoque_minimo", v ? Number(v) : null)} />
        </Fld>
        <Fld label="Fornecedor"><In v={fields.fornecedor ?? ""} on={(v) => set("fornecedor", v)} /></Fld>
        <Fld label="Fabricante"><In v={fields.fabricante ?? ""} on={(v) => set("fabricante", v)} /></Fld>
      </div>
      <Fld label="Descrição">
        <textarea
          value={fields.descricao ?? ""}
          onChange={(e) => set("descricao", e.target.value)}
          className="min-h-[70px] w-full rounded-md border border-input bg-background p-2 text-sm"
        />
      </Fld>
      <Fld label="Tags (separadas por vírgula)">
        <In
          v={(fields.tags ?? []).join(", ")}
          on={(v) => set("tags", v.split(",").map((t) => t.trim()).filter(Boolean))}
        />
      </Fld>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
        >
          Voltar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-[2] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar produto"}
        </button>
      </div>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function In({ v, on }: { v: string; on: (v: string) => void }) {
  return (
    <input
      value={v}
      onChange={(e) => on(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
    />
  );
}
