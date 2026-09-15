import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, X, Camera } from "lucide-react";
import { analyzeInvoiceFromImage, type InvoiceItem } from "@/lib/pdv-ai-invoice.functions";
import { upsertProduct, type Category } from "@/lib/pdv-catalog";
import { useCurrentStore } from "@/lib/pdv-current-store";

async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function compress(file: File, maxDim = 1800, q = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((r) => canvas.toBlob((b) => r(b ?? file), "image/jpeg", q));
  } finally { URL.revokeObjectURL(url); }
}

type Row = InvoiceItem & { keep: boolean };

export function InvoiceImport({
  onClose,
  onSaved,
  categories,
}: {
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
}) {
  const analyze = useServerFn(analyzeInvoiceFromImage);
  const { currentStoreId } = useCurrentStore();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [supplier, setSupplier] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function run() {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      const b64 = await fileToBase64(await compress(file));
      const out = await analyze({ data: { imageBase64: b64, imageMime: "image/jpeg" } });
      if (!out.ok) { setErr(out.error); return; }
      setSupplier(out.data.fornecedor ?? "");
      setRows(out.data.itens.map((i) => ({ ...i, keep: true })));
    } finally { setBusy(false); }
  }

  async function save() {
    if (!rows || !currentStoreId) return;
    setSaving(true); setErr(null);
    try {
      const selected = rows.filter((r) => r.keep && r.descricao);
      let ok = 0;
      for (const r of selected) {
        const cat = categories.find(
          (c) => c.name.toLowerCase() === (r.categoria ?? "").toLowerCase(),
        );
        await upsertProduct({
          store_id: currentStoreId,
          sku: (r.codigo_barras ?? crypto.randomUUID().slice(0, 8)).toUpperCase(),
          ean: r.codigo_barras,
          name: r.descricao!,
          unit_price: r.valor_unitario ?? 0,
          cost_price: r.valor_unitario,
          brand: r.marca,
          category_id: cat?.id ?? null,
          supplier: supplier || null,
          tags: [],
          ai_generated: true,
          active: true,
        });
        ok++;
      }
      setSaved(ok);
      setTimeout(() => onSaved(), 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao importar.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Importar nota fiscal (foto)</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">IA</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {!rows ? (
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">
              Fotografe a NF-e, DANFE ou cupom fiscal. A IA lê os itens e você revisa antes de salvar.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center hover:bg-muted/50">
              {preview ? (
                <img src={preview} alt="" className="max-h-72 rounded-md object-contain" />
              ) : (
                <>
                  <Camera className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Tirar foto da nota</span>
                  <span className="text-[11px] text-muted-foreground">ou selecionar arquivo</span>
                </>
              )}
              <input
                type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>
            )}
            <button
              onClick={run}
              disabled={!file || busy}
              className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Lendo nota…</span> : "🧾 Ler itens da nota"}
            </button>
          </div>
        ) : (
          <div className="max-h-[80vh] overflow-y-auto p-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                <span className="text-muted-foreground">Fornecedor</span>
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </label>
              <div className="flex items-end text-xs text-muted-foreground">
                {rows.length} item(ns) detectado(s) · desmarque os que não quiser importar.
              </div>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-1.5"></th>
                    <th className="px-2 py-1.5 text-left">Descrição</th>
                    <th className="px-2 py-1.5 text-left">Cód. barras</th>
                    <th className="px-2 py-1.5 text-right">Qtd</th>
                    <th className="px-2 py-1.5 text-right">Unit R$</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={r.keep} onChange={(e) => {
                          const copy = [...rows]; copy[i] = { ...r, keep: e.target.checked }; setRows(copy);
                        }} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={r.descricao ?? ""} onChange={(e) => {
                          const c = [...rows]; c[i] = { ...r, descricao: e.target.value }; setRows(c);
                        }} className="w-full bg-transparent" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={r.codigo_barras ?? ""} onChange={(e) => {
                          const c = [...rows]; c[i] = { ...r, codigo_barras: e.target.value }; setRows(c);
                        }} className="w-32 bg-transparent" />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.quantidade ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <input value={r.valor_unitario?.toString() ?? ""} onChange={(e) => {
                          const c = [...rows]; c[i] = { ...r, valor_unitario: e.target.value ? Number(e.target.value.replace(",", ".")) : null }; setRows(c);
                        }} className="w-16 bg-transparent text-right" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
            {saved != null && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                ✅ {saved} produto(s) importado(s) com sucesso.
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setRows(null)} className="flex-1 rounded-md border border-border px-3 py-2 text-sm">Voltar</button>
              <button onClick={save} disabled={saving} className="flex-[2] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {saving ? "Importando…" : `Importar ${rows.filter((r) => r.keep).length} produto(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
