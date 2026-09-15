import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, X, Send, Loader2, Check } from "lucide-react";
import {
  chatProductAssistant,
  type ChatMessage,
  type ChatFields,
} from "@/lib/pdv-ai-invoice.functions";
import { upsertProduct, type Category } from "@/lib/pdv-catalog";
import { useCurrentStore } from "@/lib/pdv-current-store";

const emptyFields: ChatFields = {
  nome: null, marca: null, categoria: null, descricao: null, volume: null,
  cor: null, codigo_barras: null, preco_custo: null, preco_venda: null,
  estoque_inicial: null, estoque_minimo: null, fornecedor: null, tags: [],
};

export function AiProductChat({
  onClose,
  onSaved,
  categories,
}: {
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
}) {
  const chat = useServerFn(chatProductAssistant);
  const { currentStoreId } = useCurrentStore();
  const [msgs, setMsgs] = React.useState<ChatMessage[]>([
    { role: "assistant", content: "Oi! Vamos cadastrar um produto. Qual é o nome ou marca dele?" },
  ]);
  const [fields, setFields] = React.useState<ChatFields>(emptyFields);
  const [done, setDone] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    if (!input.trim() || busy) return;
    const next: ChatMessage[] = [...msgs, { role: "user", content: input.trim() }];
    setMsgs(next); setInput(""); setBusy(true); setErr(null);
    try {
      const out = await chat({ data: { messages: next, fields } });
      if (!out.ok) { setErr(out.error); return; }
      setFields(out.data.fields);
      setDone(out.data.done);
      setMsgs((m) => [...m, { role: "assistant", content: out.data.reply }]);
    } finally { setBusy(false); }
  }

  async function save() {
    if (!currentStoreId || !fields.nome) return;
    setSaving(true); setErr(null);
    try {
      const cat = categories.find(
        (c) => c.name.toLowerCase() === (fields.categoria ?? "").toLowerCase(),
      );
      await upsertProduct({
        store_id: currentStoreId,
        sku: (fields.codigo_barras ?? crypto.randomUUID().slice(0, 8)).toUpperCase(),
        ean: fields.codigo_barras,
        name: fields.nome,
        unit_price: fields.preco_venda ?? 0,
        cost_price: fields.preco_custo,
        brand: fields.marca,
        description: fields.descricao,
        category_id: cat?.id ?? null,
        min_stock: fields.estoque_minimo ?? 0,
        volume: fields.volume,
        color: fields.cor,
        supplier: fields.fornecedor,
        tags: fields.tags,
        ai_generated: true,
        active: true,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="grid max-h-[92vh] w-full max-w-3xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:grid-cols-[1fr_260px] md:grid-rows-[auto_1fr_auto]">
        <div className="col-span-full flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Cadastro conversacional</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">IA</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto p-4 space-y-2 md:max-h-none">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="inline h-3 w-3 animate-spin" /> pensando…
              </div>
            </div>
          )}
        </div>

        <aside className="hidden border-l border-border bg-muted/20 p-3 text-xs md:block">
          <div className="mb-2 font-semibold uppercase text-muted-foreground">Coletado</div>
          <ul className="space-y-1">
            {(
              [
                ["Nome", fields.nome], ["Marca", fields.marca],
                ["Categoria", fields.categoria], ["Cód. barras", fields.codigo_barras],
                ["Preço venda", fields.preco_venda], ["Preço custo", fields.preco_custo],
                ["Estoque", fields.estoque_inicial], ["Volume", fields.volume],
                ["Cor", fields.cor], ["Fornecedor", fields.fornecedor],
              ] as const
            ).map(([k, v]) => (
              <li key={k} className="flex items-center gap-1">
                {v ? <Check className="h-3 w-3 text-emerald-500" /> : <span className="inline-block h-3 w-3" />}
                <span className="text-muted-foreground">{k}:</span>
                <span className="truncate font-medium">{v ?? "—"}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="col-span-full border-t border-border p-3">
          {err && <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
              placeholder="Digite sua resposta…"
              disabled={busy || saving}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            <button onClick={send} disabled={busy || saving || !input.trim()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
              <Send className="h-4 w-4" />
            </button>
            {done && (
              <button onClick={save} disabled={saving || !fields.nome}
                className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Salvando…" : "Salvar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
