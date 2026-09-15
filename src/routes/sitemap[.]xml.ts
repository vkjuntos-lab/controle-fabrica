import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://ksmakeup.lovable.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/loja", changefreq: "daily", priority: "0.9" },
          { path: "/loja/carrinho", changefreq: "monthly", priority: "0.3" },
        ];

        // Load the admin client inside the handler so the service role key
        // never ships to the client bundle.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          const { data: categories } = await supabaseAdmin.rpc("storefront_list_categories", {
            _store_slug: undefined,
          });
          for (const c of categories ?? []) {
            if (c.slug) {
              entries.push({
                path: `/loja/categoria/${c.slug}`,
                changefreq: "weekly",
                priority: "0.7",
              });
            }
          }
        } catch {
          // ignore sitemap enrichment errors
        }

        try {
          const { data: products } = await supabaseAdmin.rpc("storefront_list_products", {
            _store_slug: undefined,
            _category_slug: undefined,
            _search: undefined,
            _limit: 10000,
          });
          for (const p of products ?? []) {
            if (p.slug) {
              entries.push({
                path: `/loja/${p.slug}`,
                changefreq: "weekly",
                priority: "0.8",
              });
            }
          }
        } catch {
          // ignore sitemap enrichment errors
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
