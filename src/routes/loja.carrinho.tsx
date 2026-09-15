import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createStorefrontOrder,
  validateStorefrontCart,
  markStorefrontWhatsapp,
} from "@/lib/pdv-storefront.functions";
import { useStorefrontCart, formatBRL } from "@/lib/pdv-storefront-cart";
import { StorefrontHeader, StorefrontFooter } from "@/components/storefront/chrome";

export const Route = createFileRoute("/loja/carrinho")({
  head: () => ({
    meta: [
      { title: "Meu carrinho — Loja KS MultiMake" },
      { name: "description", content: "Resumo do seu pedido. Finalize pelo WhatsApp com a loja ou envie ao PDV para retirar." },
      { property: "og:title", content: "Meu carrinho — KS MultiMake" },
      { property: "og:description", content: "Resumo do pedido e finalização por WhatsApp ou retirada no PDV." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/loja/carrinho" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "/loja/carrinho" }],
  }),
  component: CartPage,
});

function CartPage() {
  const cart = useStorefrontCart();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [code, setCode] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const createFn = useServerFn(createStorefrontOrder);
  const validateFn = useServerFn(validateStorefrontCart);
  const markWaFn = useServerFn(markStorefrontWhatsapp);

  const createOrder = useMutation({
    mutationFn: (channel: "whatsapp" | "pdv") => createFn({ data: {
      store_slug: cart.storeSlug,
      channel,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      notes: notes || null,
      items: cart.toOrderItems(),
    }}),
  });

  const items = cart.items;
  const empty = items.length === 0;
  const total = cart.totalPrice;

  // Revalida estoque server-side. Se algum item ficou indisponível,
  // ajusta o carrinho ao máximo permitido e retorna false.
  const revalidate = async (): Promise<{ ok: boolean; issues: string[] }> => {
    if (empty) return { ok: false, issues: ["Carrinho vazio."] };
    const rows = await validateFn({ data: { items: cart.toOrderItems() } });
    const issues: string[] = [];
    let ok = true;
    for (const r of rows) {
      if (!r.ok) {
        ok = false;
        const it = items.find((i) => i.product_id === r.product_id);
        const name = it?.name ?? r.product_id;
        if (r.available <= 0) {
          issues.push(`${name} está esgotado — removido do carrinho.`);
          cart.remove(r.product_id);
        } else {
          issues.push(`${name}: disponíveis apenas ${r.available} un. — ajustado.`);
          cart.setQty(r.product_id, r.available);
        }
      }
    }
    return { ok, issues };
  };

  const handleWhatsApp = async () => {
    setError(null);
    const v = await revalidate();
    if (!v.ok) { setError(v.issues.join(" ")); return; }
    const res = await createOrder.mutateAsync("whatsapp");
    if (!res.ok) { setError(res.error); return; }
    setCode(res.code);
    const pageUrl = typeof window !== "undefined" ? window.location.origin : "";
    const lines: string[] = [];
    lines.push(`Olá! Gostaria de fazer o pedido *${res.code}*:`);
    lines.push("");
    for (const it of items) {
      lines.push(`• ${it.qty}x ${it.name} — ${formatBRL(it.qty * it.unit_price)}`);
    }
    lines.push("");
    lines.push(`*Total: ${formatBRL(res.total)}*`);
    if (customerName) lines.push(`Cliente: ${customerName}`);
    if (notes) lines.push(`Obs: ${notes}`);
    lines.push("");
    lines.push(`Código do pedido: ${res.code}`);
    if (pageUrl) lines.push(`${pageUrl}/loja/pedido/${res.code}`);
    const text = encodeURIComponent(lines.join("\n"));
    const url = `https://wa.me/?text=${text}`;
    // registra o clique (não confirma envio ainda)
    markWaFn({ data: { code: res.code, confirmed: false } }).catch(() => {});
    window.open(url, "_blank", "noopener,noreferrer");
    cart.clear();
    setTimeout(() => navigate({ to: "/loja/pedido/$code", params: { code: res.code } }), 400);
  };

  const handlePDV = async () => {
    setError(null);
    const v = await revalidate();
    if (!v.ok) { setError(v.issues.join(" ")); return; }
    const res = await createOrder.mutateAsync("pdv");
    if (!res.ok) { setError(res.error); return; }
    setCode(res.code);
    cart.clear();
    setTimeout(() => navigate({ to: "/loja/pedido/$code", params: { code: res.code } }), 300);
  };


  if (code && !empty) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <StorefrontHeader />
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="text-3xl">✅</div>
            <h1 className="mt-4 text-xl font-semibold">Pedido criado!</h1>
            <p className="mt-2 text-sm text-muted-foreground">Guarde este código:</p>
            <div className="mx-auto mt-4 inline-block rounded-lg bg-muted px-4 py-2 font-mono text-2xl font-bold tracking-widest">{code}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StorefrontHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Meu carrinho</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Revise seu pedido e escolha como quer finalizar.
        </p>

        {empty ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            <Link to="/loja" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
              ← Continuar comprando
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.product_id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {it.image ? <img src={it.image} alt={it.name} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to="/loja/$slug" params={{ slug: it.slug }} className="line-clamp-1 text-sm font-medium hover:text-primary">
                      {it.name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">SKU {it.sku} · máx. {it.max_stock} un.</div>
                    <div className="mt-1 text-sm tabular-nums">{formatBRL(it.unit_price)}</div>
                  </div>
                  <div className="inline-flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => cart.setQty(it.product_id, it.qty - 1)}
                      className="px-2 py-1 text-sm hover:bg-muted"
                    >−</button>
                    <span className="w-8 text-center text-sm tabular-nums">{it.qty}</span>
                    <button
                      type="button"
                      onClick={() => cart.setQty(it.product_id, it.qty + 1)}
                      disabled={it.qty >= it.max_stock}
                      className="px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
                    >+</button>
                  </div>
                  <div className="w-24 text-right text-sm font-semibold tabular-nums">
                    {formatBRL(it.qty * it.unit_price)}
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.remove(it.product_id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >✕</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => cart.clear()}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Esvaziar carrinho
              </button>
            </div>

            <aside className="h-fit rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">Resumo do pedido</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Itens</span><span>{cart.totalItems}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                  <span>Total</span><span className="tabular-nums">{formatBRL(total)}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="block text-[11px] font-medium text-muted-foreground">Seu nome</label>
                <input
                  type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Nome completo"
                />
                <label className="block text-[11px] font-medium text-muted-foreground">WhatsApp</label>
                <input
                  type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="(00) 00000-0000"
                />
                <label className="block text-[11px] font-medium text-muted-foreground">Observações</label>
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Ex.: cor específica, entrega, etc."
                />
              </div>

              {error && (
                <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  disabled={createOrder.isPending}
                  className="rounded-md bg-emerald-500 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                >
                  📱 Finalizar por WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handlePDV}
                  disabled={createOrder.isPending}
                  className="rounded-md bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  🏬 Finalizar no PDV (retirar na loja)
                </button>
                <Link to="/loja" className="text-center text-xs text-muted-foreground hover:text-foreground">
                  ← Continuar comprando
                </Link>
              </div>
            </aside>
          </div>
        )}
      </main>
      <StorefrontFooter />
    </div>
  );
}
