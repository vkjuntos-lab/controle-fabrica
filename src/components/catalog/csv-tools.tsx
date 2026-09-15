import * as React from "react";
import { Download, Upload, X, Loader2 } from "lucide-react";
import { toCsv, fromCsv, downloadCsv } from "@/lib/csv";
import { upsertProduct, type CatalogProduct, type Category } from "@/lib/pdv-catalog";
import { useCurrentStore } from "@/lib/pdv-current-store";

const CSV_COLUMNS = [
  "sku", "ean", "name", "brand", "category", "unit_price", "cost_price",
  "min_stock", "volume", "color", "supplier", "tags", "active",
];

export function CsvTools({
  onClose,
  onImported,
  products,
  categories,
}: {
  onClose: () => void;
  onImported: () => void;
  products: CatalogProduct[];
  categories: Category[];
}) {
  const { currentStoreId } = useCurrentStore();
  const [preview, setPreview] = React.useState<Record<string, string>[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<number | null>(null);

  function doExport() {
    const rows = products.map((p) => ({
      sku: p.sku,
      ean: p.ean ?? "",
      name: p.name,
      brand: p.brand ?? "",
      category: categories.find((c) => c.id === p.category_id)?.name ?? "",
      unit_price: p.unit,
      cost_price: p.cost_price ?? "",
      min_stock: p.min_stock ?? 0,
      volume: p.volume ?? "",
      color: p.color ?? "",
      supplier: p.supplier ?? "",
      tags: (p.tags ?? []).join("|"),
      active: p.active ? "true" : "false",
    }));
    downloadCsv(`catalogo-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, CSV_COLUMNS));
  }

  async function onFile(f: File) {
    setErr(null); setSaved(null);
    try {
      const text = await f.text();
      const rows = fromCsv(text);
      if (!rows.length) { setErr("CSV vazio."); return; }
      setPreview(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao ler CSV.");
    }
  }

  async function doImport() {
    if (!preview || !currentStoreId) return;
    setBusy(true); setErr(null);
    try {
      let ok = 0;
      for (const r of preview) {
        if (!r.name?.trim() || !r.sku?.trim()) continue;
        const price = Number((r.unit_price ?? "0").replace(",", "."));
        if (!isFinite(price)) continue;
        const cat = categories.find(
          (c) => c.name.toLowerCase() === (r.category ?? "").toLowerCase(),
        );
        await upsertProduct({
          store_id: currentStoreId,
          sku: r.sku,
          ean: r.ean || null,
          name: r.name,
          brand: r.brand || null,
          category_id: cat?.id ?? null,
          unit_price: price,
          cost_price: r.cost_price ? Number(r.cost_price.replace(",", ".")) : null,
          min_stock: r.min_stock ? Number(r.min_stock) : 0,
          volume: r.volume || null,
          color: r.color || null,
          supplier: r.supplier || null,
          tags: r.tags ? r.tags.split("|").map((t) => t.trim()).filter(Boolean) : [],
          active: r.active !== "false",
        });
        ok++;
      }
      setSaved(ok);
      setTimeout(() => onImported(), 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao importar.");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Importar / Exportar CSV</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={doExport} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm hover:bg-muted/50">
              <Download className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium">Exportar catálogo</div>
                <div className="text-[11px] text-muted-foreground">{products.length} produto(s) → CSV</div>
              </div>
            </button>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm hover:bg-muted/50">
              <Upload className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium">Importar CSV</div>
                <div className="text-[11px] text-muted-foreground">colunas: {CSV_COLUMNS.slice(0, 5).join(", ")}…</div>
              </div>
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            </label>
          </div>

          {preview && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-xs">
                <span className="font-medium">Pré-visualização · {preview.length} linha(s)</span>
                <span className="ml-2 text-muted-foreground">(as sem SKU ou nome serão ignoradas)</span>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/40 text-muted-foreground">
                    <tr>
                      {CSV_COLUMNS.map((c) => <th key={c} className="px-2 py-1 text-left">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 30).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {CSV_COLUMNS.map((c) => (
                          <td key={c} className="truncate px-2 py-1">{r[c] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
          {saved != null && <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">✅ {saved} produto(s) importado(s).</div>}

          {preview && (
            <button onClick={doImport} disabled={busy}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Importando…</span> : `Importar ${preview.length} linha(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
