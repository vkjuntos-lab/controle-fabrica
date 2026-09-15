import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, FileText, MessageSquare, FileSpreadsheet, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlag } from "@/lib/pdv-feature-flags";
import { usePdv, brl } from "@/lib/pdv-store";
import { usePdvAuth } from "@/lib/pdv-auth";
import {
  fetchCatalog,
  fetchExpiringLots,
  fetchCategories,
  upsertCategory,
  deleteCategory,
  upsertProduct,
  deleteProduct,
  stockEntry,
  stockAdjust,
  deleteLot,
  uploadProductImage,
  dbDateToMMYYYY,
  type CatalogProduct,
  type ExpiringLot,
  type Category,
} from "@/lib/pdv-catalog";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { AiProductWizard } from "@/components/catalog/ai-product-wizard";
import { InvoiceImport } from "@/components/catalog/invoice-import";
import { AiProductChat } from "@/components/catalog/ai-product-chat";
import { CsvTools } from "@/components/catalog/csv-tools";



export const Route = createFileRoute("/pdv/catalogo")({
  component: CatalogPage,
});

function CatalogPage() {
  const { user } = usePdvAuth();
  const { refreshCatalog } = usePdv();
  const { currentStoreId } = useCurrentStore();
  const qc = useQueryClient();

  const products = useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog });
  const expiring = useQuery({ queryKey: ["expiring", 90], queryFn: () => fetchExpiringLots(90) });
  const categories = useQuery({
    queryKey: ["product-categories", currentStoreId],
    queryFn: () => (currentStoreId ? fetchCategories(currentStoreId) : Promise.resolve([])),
    enabled: !!currentStoreId,
  });

  const [editing, setEditing] = React.useState<CatalogProduct | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [invoiceOpen, setInvoiceOpen] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [csvOpen, setCsvOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [offlineOcrOn, setOfflineOcrOn] = useFlag("catalog.offline_ocr_enabled");

  if (!user || user.role !== "admin") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm font-medium">Acesso restrito</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Apenas o administrador pode cadastrar produtos, lançar entradas e ver alertas de vencimento.
        </p>
      </div>
    );
  }

  const selected = products.data?.find((p) => p.id === selectedId) ?? null;

  async function refetchAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["catalog"] }),
      qc.invalidateQueries({ queryKey: ["expiring", 90] }),
      qc.invalidateQueries({ queryKey: ["product-categories", currentStoreId] }),
    ]);
    await refreshCatalog();
  }

  return (
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1fr_400px]">
      <div className="min-w-0 space-y-6">
        <ExpiringPanel data={expiring.data} loading={expiring.isLoading} />

        <CategoriesPanel
          storeId={currentStoreId}
          categories={categories.data ?? []}
          onChanged={refetchAll}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:py-3">
            <div className="mb-3 sm:mb-0">
              <h2 className="text-sm font-semibold sm:text-base">Produtos</h2>
              <p className="text-xs text-muted-foreground">
                {products.data?.length ?? 0} SKU(s) · clique para gerenciar lotes
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setAiOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm sm:min-h-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Foto+Voz</span>
              </button>
              <button
                onClick={() => setChatOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary sm:min-h-0"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Conversar</span>
              </button>
              <button
                onClick={() => setInvoiceOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary sm:min-h-0"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Nota fiscal</span>
              </button>
              <button
                onClick={() => setCsvOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium sm:min-h-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>CSV</span>
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setCreating(true);
                }}
                className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium sm:min-h-0"
              >
                + Manual
              </button>
              <label
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 sm:min-h-0"
                title="Ativa OCR local no navegador como fallback opcional. Não substitui a IA padrão."
              >
                <HardDrive className="h-3 w-3" />
                <input
                  type="checkbox"
                  checked={offlineOcrOn}
                  onChange={(e) => setOfflineOcrOn(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span>OCR offline</span>
              </label>
            </div>
          </div>

          <VirtualProductList
            items={products.data ?? []}
            isLoading={products.isLoading}
            categories={categories.data ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={(p) => { setEditing(p); setCreating(false); }}
            onDelete={async (p) => {
              if (!confirm(`Excluir "${p.name}" e todos os lotes?`)) return;
              await deleteProduct(p.id);
              if (selectedId === p.id) setSelectedId(null);
              await refetchAll();
            }}
          />
        </div>




        {selected && (
          <LotsPanel
            key={selected.id}
            product={selected}
            storeId={user.storeId ?? "00000000-0000-0000-0000-000000000001"}
            operatorUserId={user.userId}
            operator={user.displayName}
            onChanged={refetchAll}
          />
        )}
      </div>

      <div className="hidden xl:block">
        {(creating || editing) && (
          <ProductForm
            initial={editing}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSaved={async () => {
              setEditing(null);
              setCreating(false);
              await refetchAll();
            }}
          />
        )}
      </div>
      {aiOpen && (
        <AiProductWizard
          categories={categories.data ?? []}
          onClose={() => setAiOpen(false)}
          onSaved={async () => { setAiOpen(false); await refetchAll(); }}
        />
      )}
      {chatOpen && (
        <AiProductChat
          categories={categories.data ?? []}
          onClose={() => setChatOpen(false)}
          onSaved={async () => { setChatOpen(false); await refetchAll(); }}
        />
      )}
      {invoiceOpen && (
        <InvoiceImport
          categories={categories.data ?? []}
          onClose={() => setInvoiceOpen(false)}
          onSaved={async () => { setInvoiceOpen(false); await refetchAll(); }}
        />
      )}
      {csvOpen && (
        <CsvTools
          products={products.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setCsvOpen(false)}
          onImported={async () => { setCsvOpen(false); await refetchAll(); }}
        />
      )}
      {/* Mobile/Tablet Dialog Fallback */}
      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm xl:hidden">
          <div className="w-full max-w-lg overflow-auto max-h-[90vh]">
            <ProductForm
              initial={editing}
              onCancel={() => {
                setEditing(null);
                setCreating(false);
              }}
              onSaved={async () => {
                setEditing(null);
                setCreating(false);
                await refetchAll();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Categorias ---------- */
function CategoriesPanel({
  storeId,
  categories,
  onChanged,
}: {
  storeId: string | null;
  categories: Category[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (!storeId) return null;
  async function add() {
    if (!name.trim() || !storeId) return;
    setBusy(true);
    try {
      await upsertCategory({ store_id: storeId, name: name.trim() });
      setName("");
      await onChanged();
    } finally { setBusy(false); }
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm"
      >
        <span className="font-semibold">Categorias ({categories.length})</span>
        <span className="text-xs text-muted-foreground">{open ? "ocultar" : "gerenciar"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-4">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {c.name}
                <button
                  onClick={async () => {
                    if (!confirm(`Excluir categoria "${c.name}"?`)) return;
                    await deleteCategory(c.id);
                    await onChanged();
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >×</button>
              </span>
            ))}
            {categories.length === 0 && (
              <span className="text-xs text-muted-foreground">Nenhuma categoria ainda.</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nova categoria (ex.: Base facial)"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
            />
            <button
              onClick={add}
              disabled={busy || !name.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Alertas de vencimento ---------- */
function ExpiringPanel({ data, loading }: { data: ExpiringLot[] | undefined; loading: boolean }) {
  const groups = React.useMemo(() => {
    const out = { expired: [] as ExpiringLot[], critical: [] as ExpiringLot[], soon: [] as ExpiringLot[] };
    (data ?? []).forEach((l) => {
      if (l.days_left < 0) out.expired.push(l);
      else if (l.days_left <= 30) out.critical.push(l);
      else out.soon.push(l);
    });
    return out;
  }, [data]);
  const total = (data ?? []).length;
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        Verificando validades…
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <div className="font-medium text-emerald-700 dark:text-emerald-400">
          Nenhum lote vencendo nos próximos 90 dias
        </div>
        <div className="text-xs text-muted-foreground">Estoque saudável.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            ⚠ {total} lote(s) precisando de atenção
          </div>
          <div className="text-xs text-muted-foreground">
            {groups.expired.length} vencido(s) · {groups.critical.length} em ≤30 dias ·{" "}
            {groups.soon.length} em ≤90 dias
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        {[...groups.expired, ...groups.critical, ...groups.soon].slice(0, 8).map((l) => (
          <div
            key={l.lot_id}
            className="flex items-center justify-between rounded-md bg-background/60 px-3 py-2"
          >
            <div>
              <div className="font-medium">{l.product_name}</div>
              <div className="text-muted-foreground">
                Lote {l.lot_code} · valid. {dbDateToMMYYYY(l.validity)} · {l.qty} un.
              </div>
              <div className="mt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-[10px] px-2 gap-1.5 text-emerald-600 hover:text-emerald-700 border-emerald-200"
                  onClick={() => {
                    const phone = localStorage.getItem('store_whatsapp') || '5500000000000';
                    const text = encodeURIComponent(`Olá! Tenho interesse no ${l.product_name} por R$ ${l.unit_price}. Está disponível?`);
                    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
                  }}
                >
                  Vender (WhatsApp)
                </Button>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                l.days_left < 0
                  ? "bg-red-500/15 text-red-600"
                  : l.days_left <= 30
                  ? "bg-amber-500/20 text-amber-700"
                  : "bg-slate-500/15 text-slate-600"
              }`}
            >
              {l.days_left < 0
                ? `vencido há ${Math.abs(l.days_left)}d`
                : `${l.days_left}d`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Formulário de produto ---------- */
function ProductForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: CatalogProduct | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { currentStoreId } = useCurrentStore();
  const [sku, setSku] = React.useState(initial?.sku ?? "");
  const [ean, setEan] = React.useState(initial?.ean ?? "");
  const [name, setName] = React.useState(initial?.name ?? "");
  const [unit, setUnit] = React.useState(initial?.unit?.toString() ?? "");
  const [active, setActive] = React.useState(initial?.active ?? true);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(initial?.image_signed_url || null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const price = Number(unit.replace(",", "."));
    if (!sku.trim() || !name.trim() || !isFinite(price) || price < 0) {
      setErr("Preencha SKU, nome e preço válidos");
      return;
    }
    if (!initial?.id && !currentStoreId) {
      setErr("Selecione uma loja antes de criar produtos.");
      return;
    }
    setBusy(true);
    try {
      let imagePath = initial?.image_url || null;
      
      if (imageFile && currentStoreId) {
        imagePath = await uploadProductImage(currentStoreId, imageFile);
      }
      
      await upsertProduct({
        id: initial?.id,
        store_id: currentStoreId ?? "",
        sku: sku.trim(),
        ean: ean.trim() || null,
        name: name.trim(),
        unit_price: price,
        image_url: imagePath,
        active,
      });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="xl:sticky xl:top-4 rounded-xl border border-border bg-card p-4 space-y-3 shadow-lg xl:shadow-none"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{initial ? "Editar produto" : "Novo produto"}</h3>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          fechar
        </button>
      </div>
      <Field label="Foto do Produto">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden border">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] text-muted-foreground text-center px-1">sem foto</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
              }
            }}
            className="text-xs file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>
      </Field>
      <Field label="SKU">
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <Field label="EAN (opcional)">
        <input
          value={ean}
          onChange={(e) => setEan(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Nome">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Preço unitário (R$)">
        <input
          inputMode="decimal"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Ativo (disponível na venda)
      </label>
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Salvando…" : initial ? "Salvar alterações" : "Cadastrar produto"}
      </button>
    </form>
  );
}

/* ---------- Painel de lotes / entrada / ajuste ---------- */
function LotsPanel({
  product,
  storeId,
  operatorUserId,
  operator,
  onChanged,
}: {
  product: CatalogProduct;
  storeId: string;
  operatorUserId: string;
  operator: string;
  onChanged: () => Promise<void>;
}) {
  const [lotCode, setLotCode] = React.useState("");
  const [validity, setValidity] = React.useState(""); // MM/YYYY
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = Number(qty);
    if (!lotCode.trim() || !/^\d{2}\/\d{4}$/.test(validity) || !isFinite(n) || n <= 0) {
      setErr("Preencha lote, validade (MM/AAAA) e quantidade positiva");
      return;
    }
    setBusy(true);
    try {
      await stockEntry({
        product_id: product.id,
        store_id: storeId,
        operator_user_id: operatorUserId,
        lot_code: lotCode.trim(),
        validity_mmYYYY: validity,
        qty: n,
        note: note.trim() || undefined,
        operator,
      });
      setLotCode("");
      setValidity("");
      setQty("");
      setNote("");
      await onChanged();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao lançar entrada");
    } finally {
      setBusy(false);
    }
  }

  async function adjust(lotId: string, delta: number) {
    const reason = prompt(`Ajuste de ${delta > 0 ? "+" : ""}${delta} un. Motivo?`);
    if (reason === null) return;
    await stockAdjust({
      lot_id: lotId,
      store_id: storeId,
      operator_user_id: operatorUserId,
      qty: delta,
      note: reason || undefined,
      operator,
    });
    await onChanged();
  }

  return (
    <div id={`lots-panel-${product.id}`} className="rounded-xl border border-border bg-card">

      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Lotes de {product.name}</h3>
        <p className="text-xs text-muted-foreground">
          Total em estoque: {product.lots.reduce((s, l) => s + l.qty, 0)} un.
        </p>
      </div>

      <div className="divide-y divide-border">
        {product.lots.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">
            Nenhum lote cadastrado. Faça uma entrada abaixo.
          </div>
        )}
        {product.lots.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 text-sm">
            <div>
              <div className="font-medium">Lote {l.code ?? l.id.slice(0, 6)}</div>
              <div className="text-xs text-muted-foreground">
                validade {l.validity} · {l.qty} un.
              </div>
            </div>
            <button
              onClick={() => adjust(l.id, +1)}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              +1
            </button>
            <button
              onClick={() => adjust(l.id, -1)}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              -1
            </button>
            <button
              onClick={async () => {
                if (!confirm("Excluir lote?")) return;
                await deleteLot(l.id);
                await onChanged();
              }}
              className="rounded-md border border-border px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
            >
              excluir
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={addEntry} className="grid gap-2 border-t border-border p-4 sm:grid-cols-4">
        <input
          value={lotCode}
          onChange={(e) => setLotCode(e.target.value)}
          placeholder="Código do lote"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          value={validity}
          onChange={(e) => setValidity(e.target.value)}
          placeholder="MM/AAAA"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Qtd."
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "…" : "+ Entrada"}
        </button>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação (NF, fornecedor…)"
          className="sm:col-span-4 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {err && (
          <div className="sm:col-span-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ---------- Lista virtualizada de produtos (tanstack/react-virtual) ---------- */
function VirtualProductList({
  items, isLoading, categories, selectedId, onSelect, onEdit, onDelete,
}: {
  items: CatalogProduct[];
  isLoading: boolean;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (p: CatalogProduct) => void;
  onDelete: (p: CatalogProduct) => void;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 8,
  });

  if (isLoading) {
    return <div className="p-4 text-xs text-muted-foreground">Carregando…</div>;
  }
  if (items.length === 0) {
    return <div className="p-6 text-center text-xs text-muted-foreground">Nenhum produto cadastrado ainda.</div>;
  }

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-x-hidden overflow-y-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {rowVirtualizer.getVirtualItems().map((v) => {
          const p = items[v.index];
          const total = p.lots.reduce((s, l) => s + l.qty, 0);
          const isSel = p.id === selectedId;
          const cat = categories.find((c) => c.id === p.category_id);
          return (
            <div
              key={p.id}
              style={{
                position: "absolute", top: 0, left: 0, width: "100%",
                transform: `translateY(${v.start}px)`,
              }}
              className={`flex flex-col border-b border-border px-4 py-4 transition-colors sm:grid sm:grid-cols-[48px_1fr_auto_auto] sm:items-center sm:gap-4 sm:py-3 ${
                isSel ? "bg-muted/40" : "hover:bg-muted/30"
              }`}
            >
              {/* Product Info - Mobile: Description above image, Desktop: Grid */}
              <div className="flex flex-col gap-3 sm:contents">
                {/* Description (Name/Brand/Price) - Simplified for mobile and positioned ABOVE image */}
                <button 
                  onClick={() => onSelect(p.id)} 
                  className="text-left w-full sm:order-2"
                >
                  <div className="flex flex-wrap items-baseline gap-x-1.5 font-medium leading-tight">
                    <span className="text-sm sm:text-base">{p.name}</span>
                    {p.brand && <span className="text-[11px] text-muted-foreground">· {p.brand}</span>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground sm:mt-0.5">
                    {brl(p.unit)}
                    <span className="hidden sm:inline"> · SKU {p.sku} {p.ean ? `· EAN ${p.ean}` : ""} {cat && ` · ${cat.name}`}</span>
                  </div>
                </button>

                {/* Image - Placed after description in DOM but shown below on mobile via flex-col */}
                <div className="flex items-center justify-between sm:contents sm:order-1">
                  <div className="flex items-center gap-4">
                    {p.image_signed_url ? (
                      <img 
                        src={p.image_signed_url} 
                        alt="" 
                        className="h-14 w-14 shrink-0 rounded-md object-cover sm:h-12 sm:w-12" 
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground sm:h-12 sm:w-12">
                        sem foto
                      </div>
                    )}
                    
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold sm:hidden ${
                        total === 0
                          ? "bg-red-500/10 text-red-600"
                          : total < (p.min_stock ?? 5)
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {total} un.
                    </span>
                  </div>

                  <span
                    className={`hidden sm:inline-block rounded-full px-2 py-0.5 text-xs font-medium sm:order-3 ${
                      total === 0
                        ? "bg-red-500/10 text-red-600"
                        : total < (p.min_stock ?? 5)
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-emerald-500/10 text-emerald-600"
                    }`}
                  >
                    {total} un.
                  </span>

                  {/* Actions - Flex wrap for alignment without overlapping */}
                  <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-1 sm:order-4">
                    <button
                      onClick={() => onEdit(p)}
                      title="Editar dados do produto (SKU, nome, preço)"
                      className="inline-flex min-h-[44px] sm:min-h-[32px] items-center rounded-md border border-border px-3 py-1 text-[11px] font-medium hover:bg-muted sm:px-2 sm:text-xs sm:font-normal"
                    >
                      <span className="sm:hidden">Editar</span>
                      <span className="hidden sm:inline">editar produto</span>
                    </button>
                    <button
                      onClick={() => {
                        onSelect(p.id);
                        requestAnimationFrame(() => {
                          document
                            .getElementById(`lots-panel-${p.id}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        });
                      }}
                      title="Gerenciar lotes, entradas e ajustes de estoque"
                      className="inline-flex min-h-[44px] sm:min-h-[32px] items-center rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 sm:px-2 sm:text-xs sm:font-normal"
                    >
                      <span className="sm:hidden">Lotes</span>
                      <span className="hidden sm:inline">editar lote</span>
                    </button>
                    <button
                      onClick={() => onDelete(p)}
                      className="inline-flex min-h-[44px] sm:min-h-[32px] items-center rounded-md border border-border px-3 py-1 text-[11px] font-medium text-red-600 hover:bg-red-500/10 sm:px-2 sm:text-xs sm:font-normal"
                    >
                      excluir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
