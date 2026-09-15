import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  listStorefrontProducts,
  listStorefrontCategories,
  type StorefrontProduct,
  type StorefrontCategory,
} from "@/lib/pdv-storefront.functions";
import { StorefrontHeader, StorefrontFooter, StockBadge } from "@/components/storefront/chrome";
import { useStorefrontCart, formatBRL } from "@/lib/pdv-storefront-cart";

const productsQuery = () =>
  queryOptions({
    queryKey: ["storefront", "list"],
    queryFn: () => listStorefrontProducts({ data: {} }),
  });
const categoriesQuery = () =>
  queryOptions({
    queryKey: ["storefront", "categories"],
    queryFn: () => listStorefrontCategories({ data: {} }),
  });

export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: "Loja KS MultiMake — Maquiagem, cosméticos e perfumaria" },
      { name: "description", content: "Vitrine online da KS MultiMake: batons, bases, paletas, perfumes e mais das melhores marcas com retirada em loja e entrega expressa." },
      { property: "og:title", content: "Loja KS MultiMake — Beleza & cuidado" },
      { property: "og:description", content: "Compre online produtos de beleza com estoque em tempo real, reserva pelo WhatsApp e retirada em loja." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/loja" },
      { name: "twitter:title", content: "Loja KS MultiMake" },
      { name: "twitter:description", content: "Vitrine online com estoque em tempo real e reserva pelo WhatsApp." },
    ],
    links: [{ rel: "canonical", href: "/loja" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Store",
        name: "KS MultiMake",
        description: "Loja de maquiagem, cosméticos e perfumaria.",
        url: "/loja",
      }),
    }],
  }),
  loader: async ({ context }: any) => {
    await Promise.all([
      context.queryClient.ensureQueryData(productsQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
    ]);
    return null;
  },
  component: LojaIndex,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-8 text-center text-sm text-muted-foreground">
      Não foi possível carregar a vitrine agora. {String(error?.message ?? "")}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-sm">Vitrine indisponível.</div>,
});

function LojaIndex() {
  const { data: products } = useSuspenseQuery(productsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const cart = useStorefrontCart();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StorefrontHeader />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Nossos produtos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estoque atualizado em tempo real. Adicione ao carrinho e finalize pelo WhatsApp ou retire na loja.
        </p>

        {categories.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Categorias:
            </span>
            {categories.map((c: StorefrontCategory) => (
              <Link
                key={c.id}
                to="/loja/categoria/$slug"
                params={{ slug: c.slug }}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
              >
                {c.name} <span className="ml-1 text-muted-foreground">({c.product_count})</span>
              </Link>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum produto publicado na vitrine ainda. Marque produtos como <b>públicos</b> no catálogo e ative a vitrine da loja.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p: StorefrontProduct) => (
              <ProductCard key={p.id} p={p} onAdd={() => cart.add(p, 1)} />
            ))}
          </div>
        )}
      </main>

      <StorefrontFooter />
    </div>
  );
}

function ProductCard({ p, onAdd }: { p: StorefrontProduct; onAdd: () => { ok: boolean; reason?: string } }) {
  const disabled = !p.in_stock;
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg">
      <Link to="/loja/$slug" params={{ slug: p.slug }} className="block">
        <div className="aspect-square w-full bg-gradient-to-br from-primary/10 via-muted to-background">
          {p.image ? (
            <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
          ) : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.brand ?? "—"}</div>
        <Link
          to="/loja/$slug"
          params={{ slug: p.slug }}
          className="mt-1 line-clamp-2 text-sm font-medium group-hover:text-primary"
        >
          {p.name}
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-semibold tabular-nums">{formatBRL(p.price)}</span>
          <StockBadge stock={p.stock} />
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {disabled ? "Indisponível" : "＋ Adicionar ao carrinho"}
        </button>
      </div>
    </div>
  );
}
