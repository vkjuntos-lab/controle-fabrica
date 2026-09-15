import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  getStorefrontCategory,
  listStorefrontProducts,
  type StorefrontProduct,
} from "@/lib/pdv-storefront.functions";
import { StorefrontHeader, StorefrontFooter, StockBadge } from "@/components/storefront/chrome";
import { useStorefrontCart, formatBRL } from "@/lib/pdv-storefront-cart";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["storefront", "category", slug],
    queryFn: () => getStorefrontCategory({ data: { slug } }),
  });
const productsInCategoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["storefront", "list", { category: slug }],
    queryFn: () => listStorefrontProducts({ data: { category_slug: slug } }),
  });

export const Route = createFileRoute("/loja/categoria/$slug")({
  loader: async ({ params, context }: any) => {
    const cat = await context.queryClient.ensureQueryData(categoryQuery(params.slug));
    if (!cat) throw notFound();
    const products = await context.queryClient.ensureQueryData(productsInCategoryQuery(params.slug));
    const firstImage = (products as StorefrontProduct[]).find((p) => !!p.image)?.image ?? null;
    return {
      name: (cat as any).name as string,
      description: ((cat as any).description as string | null) ?? null,
      storeName: ((cat as any).store_name as string | null) ?? null,
      image: firstImage as string | null,
      count: (products as StorefrontProduct[]).length,
    };
  },
  head: ({ params, loaderData }: any) => {
    const SITE = "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app";
    const name = loaderData?.name ?? params.slug.replace(/-/g, " ");
    const storeBit = loaderData?.storeName ? ` · ${loaderData.storeName}` : " · KS MultiMake";
    const title = `${name}${storeBit}`;
    const description = (
      loaderData?.description ||
      `Explore produtos de ${name}${loaderData?.storeName ? ` na loja ${loaderData.storeName}` : " na vitrine KS MultiMake"}.`
    ).slice(0, 158);
    const canonical = `${SITE}/loja/categoria/${params.slug}`;
    const rawImage = loaderData?.image as string | null | undefined;
    const image = rawImage
      ? (rawImage.startsWith("http") ? rawImage : `${SITE}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`)
      : null;
    const meta: any[] = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { property: "og:site_name", content: "Estratégia" },
      { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
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
  component: CategoryPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl p-8 text-center text-sm text-muted-foreground">
      Erro ao abrir a categoria. {String(error?.message ?? "")}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl p-8 text-center">
      <p className="text-sm text-muted-foreground">Categoria não encontrada.</p>
      <Link to="/loja" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
        ← Voltar à vitrine
      </Link>
    </div>
  ),
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { data: category } = useSuspenseQuery(categoryQuery(slug));
  const { data: products } = useSuspenseQuery(productsInCategoryQuery(slug));
  const cart = useStorefrontCart();
  if (!category) return null;


  const SITE = "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app";
  const catUrl = `${SITE}/loja/categoria/${slug}`;
  const absImg = (img: string | null) =>
    img ? (img.startsWith("http") ? img : `${SITE}${img.startsWith("/") ? "" : "/"}${img}`) : undefined;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${category.name} — KS MultiMake`,
    url: catUrl,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map((p: StorefrontProduct, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE}/loja/${p.slug}`,
      item: {
        "@type": "Product",
        name: p.name,
        sku: p.sku,
        image: absImg(p.image),
        url: `${SITE}/loja/${p.slug}`,
        offers: {
          "@type": "Offer",
          priceCurrency: "BRL",
          price: p.price.toFixed(2),
          availability: p.in_stock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      },
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Loja", item: `${SITE}/loja` },
      { "@type": "ListItem", position: 2, name: category.name, item: catUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StorefrontHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />


      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-6 pt-6 text-xs text-muted-foreground">
        <Link to="/loja" className="hover:text-foreground">Loja</Link>
        <span>›</span>
        <span className="text-foreground">{category.name}</span>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {products.length} {products.length === 1 ? "produto" : "produtos"} nesta categoria.
        </p>

        {products.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum produto publicado nesta categoria.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p: StorefrontProduct) => (
              <div key={p.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg">
                <Link to="/loja/$slug" params={{ slug: p.slug }} className="block">
                  <div className="aspect-square w-full bg-gradient-to-br from-primary/10 via-muted to-background">
                    {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" /> : null}
                  </div>
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.brand ?? "—"}</div>
                  <Link to="/loja/$slug" params={{ slug: p.slug }} className="mt-1 line-clamp-2 text-sm font-medium group-hover:text-primary">
                    {p.name}
                  </Link>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-semibold tabular-nums">{formatBRL(p.price)}</span>
                    <StockBadge stock={p.stock} />
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.add(p, 1)}
                    disabled={!p.in_stock}
                    className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {p.in_stock ? "＋ Adicionar ao carrinho" : "Indisponível"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <StorefrontFooter />
    </div>
  );
}

