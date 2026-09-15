import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import * as React from "react";
import { getStorefrontProduct } from "@/lib/pdv-storefront.functions";
import { StorefrontHeader, StorefrontFooter, StockBadge } from "@/components/storefront/chrome";
import { useStorefrontCart, formatBRL } from "@/lib/pdv-storefront-cart";

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["storefront", "product", slug],
    queryFn: () => getStorefrontProduct({ data: { slug } }),
  });

export const Route = createFileRoute("/loja/$slug")({
  loader: async ({ params, context }: any) => {
    const detail = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!detail) throw notFound();
    const p = detail.product;
    const store = detail.store;
    return {
      name: p.name as string,
      brand: (p.brand as string | null) ?? null,
      description: (p.description || "") as string,
      image: (p.image as string | null) ?? null,
      storeName: (store?.name as string | null) ?? null,
    };
  },
  head: ({ params, loaderData }: any) => {
    const SITE = "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app";
    const name = loaderData?.name ?? params.slug.replace(/-/g, " ");
    const brand = loaderData?.brand ? ` — ${loaderData.brand}` : "";
    const storeBit = loaderData?.storeName ? ` · ${loaderData.storeName}` : " · KS MultiMake";
    const title = `${name}${brand}${storeBit}`;
    const description = (
      loaderData?.description ||
      `${name} disponível na vitrine KS MultiMake${loaderData?.storeName ? ` — ${loaderData.storeName}` : ""}.`
    ).slice(0, 158);
    const canonical = `${SITE}/loja/${params.slug}`;
    const rawImage = loaderData?.image as string | null | undefined;
    const image = rawImage
      ? (rawImage.startsWith("http") ? rawImage : `${SITE}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`)
      : null;
    const meta: any[] = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      { property: "og:url", content: canonical },
      { property: "og:site_name", content: "Estratégia" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (image) {
      meta.push({ property: "og:image", content: image });
      meta.push({ property: "og:image:secure_url", content: image });
      meta.push({ property: "og:image:width", content: "1200" });
      meta.push({ property: "og:image:height", content: "630" });
      meta.push({ property: "og:image:alt", content: name });
      meta.push({ name: "twitter:image", content: image });
      meta.push({ name: "twitter:image:alt", content: name });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: ProductPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-8 text-center text-sm text-muted-foreground">
      Erro ao abrir o produto. {String(error?.message ?? "")}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl p-8 text-center">
      <p className="text-sm text-muted-foreground">Produto não encontrado.</p>
      <Link to="/loja" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
        ← Voltar à vitrine
      </Link>
    </div>
  ),
});

function normalizeWa(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D+/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

function ProductPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productQuery(slug));
  const cart = useStorefrontCart();
  const [qty, setQty] = React.useState(1);
  const [msg, setMsg] = React.useState<string | null>(null);
  if (!data) return null;
  const p = data.product;
  const store = data.store;
  const outOfStock = !p.in_stock || p.stock <= 0;
  const cappedQty = Math.min(qty, Math.max(1, p.stock || 1));

  const waDigits = normalizeWa(store?.whatsapp);
  const total = p.price * cappedQty;
  const pageUrl = typeof window !== "undefined" ? window.location.href : `/loja/${slug}`;

  const waText = [
    `Olá${store?.name ? `, ${store.name}` : ""}! Gostaria de reservar:`,
    ``,
    `🛍️ *${p.name}*`,
    p.brand ? `Marca: ${p.brand}` : null,
    `SKU: ${p.sku}`,
    `Quantidade: ${cappedQty}`,
    `Preço unitário: ${formatBRL(p.price)}`,
    `Subtotal: *${formatBRL(total)}*`,
    ``,
    `Link: ${pageUrl}`,
    ``,
    `Podem confirmar disponibilidade e forma de retirada/entrega? Obrigado(a)! 💜`,
  ]
    .filter(Boolean)
    .join("\n");
  const waHref = waDigits && !outOfStock
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}`
    : null;

  const addToCart = () => {
    const res = cart.add(p, cappedQty);
    setMsg(res.ok ? `Adicionado ao carrinho (${cappedQty} un.).` : res.reason ?? "Não foi possível adicionar.");
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StorefrontHeader />
      <ProductJsonLd
        name={p.name}
        description={p.description}
        image={p.image}
        sku={p.sku}
        brand={p.brand}
        price={p.price}
        inStock={p.in_stock}
        slug={p.slug}
        categoryName={p.category_name}
      />
      

      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-6 pt-4 text-xs text-muted-foreground">
        <Link to="/loja" className="hover:text-foreground">Loja</Link>
        {p.category_slug && p.category_name && (
          <>
            <span>›</span>
            <Link to="/loja/categoria/$slug" params={{ slug: p.category_slug }} className="hover:text-foreground">
              {p.category_name}
            </Link>
          </>
        )}
        <span>›</span>
        <span className="text-foreground">{p.name}</span>
      </nav>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 md:grid-cols-2">
        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-muted to-background">
          {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover" /> : null}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{p.brand ?? "—"}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{p.name}</h1>
          {store && <div className="mt-1 text-xs text-muted-foreground">Vendido por {store.name}</div>}
          <div className="mt-3 flex items-center gap-2">
            <StockBadge stock={p.stock} />
            {p.stock > 0 && <span className="text-xs text-muted-foreground">{p.stock} un. disponíveis</span>}
          </div>
          <div className="mt-4 text-4xl font-bold tabular-nums">{formatBRL(p.price)}</div>
          <p className="mt-6 text-sm text-muted-foreground">{p.description || "Sem descrição adicional."}</p>

          <div className="mt-6 flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Quantidade</label>
            <div className="inline-flex items-center rounded-md border border-border">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={outOfStock}
                className="px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
                aria-label="Diminuir"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={Math.max(1, p.stock)}
                value={cappedQty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                disabled={outOfStock}
                className="w-14 border-x border-border bg-transparent py-2 text-center text-sm tabular-nums outline-none disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(p.stock || q + 1, q + 1))}
                disabled={outOfStock || cappedQty >= p.stock}
                className="px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
                aria-label="Aumentar"
              >
                +
              </button>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              Subtotal <span className="ml-1 font-semibold text-foreground tabular-nums">{formatBRL(total)}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={addToCart}
              disabled={outOfStock}
              className="rounded-xl bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {outOfStock ? "Esgotado" : "🛒 Adicionar ao carrinho"}
            </button>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500 bg-emerald-500/10 px-6 py-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                📱 Reservar {cappedQty > 1 ? `${cappedQty} un.` : ""} no WhatsApp
              </a>
            ) : (
              <button
                disabled
                className="rounded-xl bg-muted px-6 py-4 text-sm font-medium text-muted-foreground"
              >
                {outOfStock ? "Reserva indisponível" : "WhatsApp indisponível"}
              </button>
            )}
          </div>

          {msg && (
            <div className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              {msg}
            </div>
          )}

          <ul className="mt-6 space-y-1 text-xs text-muted-foreground">
            <li>✓ Retirada em loja disponível</li>
            <li>✓ Entrega expressa na região</li>
            <li>✓ Pagamento via PIX, cartão ou boleto</li>
          </ul>
        </div>
      </main>
      <StorefrontFooter />
    </div>
  );
}


function ProductJsonLd(props: {
  name: string; description: string; image: string | null; sku: string;
  brand: string | null; price: number; inStock: boolean; slug: string; categoryName: string | null;
}) {
  const SITE = "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app";
  const url = `${SITE}/loja/${props.slug}`;
  const absImage = props.image
    ? (props.image.startsWith("http") ? props.image : `${SITE}${props.image.startsWith("/") ? "" : "/"}${props.image}`)
    : null;
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: props.name,
    description: props.description,
    image: absImage ? [absImage] : undefined,
    sku: props.sku,
    brand: props.brand ? { "@type": "Brand", name: props.brand } : undefined,
    category: props.categoryName ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: props.price.toFixed(2),
      availability: props.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Loja", item: `${SITE}/loja` },
      ...(props.categoryName
        ? [{ "@type": "ListItem", position: 2, name: props.categoryName, item: `${SITE}/loja` }]
        : []),
      { "@type": "ListItem", position: props.categoryName ? 3 : 2, name: props.name, item: url },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
