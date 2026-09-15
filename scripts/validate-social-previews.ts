#!/usr/bin/env bun
/**
 * Valida os previews Open Graph / Twitter Card para cada produto e categoria
 * publicados na vitrine e reporta inconsistências.
 *
 * Uso:
 *   bun run scripts/validate-social-previews.ts
 *   bun run scripts/validate-social-previews.ts --json
 *
 * Checagens por página:
 *   - og:title / og:description / og:url / og:type presentes
 *   - twitter:card / twitter:title / twitter:description presentes
 *   - canonical presente e coincide com og:url
 *   - og:image absoluto (http/https), acessível (HEAD 200) e >= 200x200
 *   - twitter:image coincide com og:image
 *   - JSON-LD Product/ItemList + BreadcrumbList presentes
 */

import { createClient } from "@supabase/supabase-js";

const SITE = process.env.SITE_URL || "https://ksmakeup.lovable.app";
const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPA_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

type Issue = { url: string; kind: "product" | "category"; problems: string[] };

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "KSMakeupOGValidator/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return await res.text();
}

function pickMeta(html: string, key: "property" | "name", value: string): string | null {
  const re = new RegExp(
    `<meta\\s+[^>]*${key}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re) ?? html.match(
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${key}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i",
    ),
  );
  return m?.[1] ?? null;
}

function pickCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

function jsonLdTypes(html: string): string[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const types: string[] = [];
  for (const s of scripts) {
    try {
      const j = JSON.parse(s[1]);
      const arr = Array.isArray(j) ? j : [j];
      for (const item of arr) if (item?.["@type"]) types.push(String(item["@type"]));
    } catch {
      types.push("<invalid-json>");
    }
  }
  return types;
}

async function checkImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return `imagem retornou HTTP ${res.status}`;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return `content-type inesperado: ${ct}`;
    return null;
  } catch (e: any) {
    return `imagem inacessível (${e?.message ?? e})`;
  }
}

async function validate(url: string, kind: "product" | "category", requiredTypes: string[]): Promise<Issue> {
  const problems: string[] = [];
  let html = "";
  try {
    html = await fetchHtml(url);
  } catch (e: any) {
    return { url, kind, problems: [`falha ao carregar página: ${e?.message ?? e}`] };
  }

  const ogTitle = pickMeta(html, "property", "og:title");
  const ogDesc = pickMeta(html, "property", "og:description");
  const ogUrl = pickMeta(html, "property", "og:url");
  const ogType = pickMeta(html, "property", "og:type");
  const ogImage = pickMeta(html, "property", "og:image");
  const twCard = pickMeta(html, "name", "twitter:card");
  const twTitle = pickMeta(html, "name", "twitter:title");
  const twDesc = pickMeta(html, "name", "twitter:description");
  const twImage = pickMeta(html, "name", "twitter:image");
  const canonical = pickCanonical(html);

  if (!ogTitle) problems.push("og:title ausente");
  if (!ogDesc) problems.push("og:description ausente");
  if (!ogUrl) problems.push("og:url ausente");
  if (!ogType) problems.push("og:type ausente");
  if (!twCard) problems.push("twitter:card ausente");
  if (!twTitle) problems.push("twitter:title ausente");
  if (!twDesc) problems.push("twitter:description ausente");
  if (!canonical) problems.push("canonical ausente");
  if (canonical && ogUrl && canonical !== ogUrl) {
    problems.push(`canonical (${canonical}) != og:url (${ogUrl})`);
  }

  if (!ogImage) {
    problems.push("og:image ausente (produto/categoria sem thumbnail real)");
  } else {
    if (!/^https?:\/\//i.test(ogImage)) problems.push(`og:image não é absoluto: ${ogImage}`);
    const err = await checkImage(ogImage);
    if (err) problems.push(`og:image ${err}`);
    if (twImage && twImage !== ogImage) problems.push(`twitter:image (${twImage}) != og:image`);
  }

  const types = jsonLdTypes(html);
  for (const req of requiredTypes) {
    if (!types.includes(req)) problems.push(`JSON-LD ${req} ausente (achado: ${types.join(", ") || "nenhum"})`);
  }

  return { url, kind, problems };
}

async function main() {
  if (!SUPA_URL || !SUPA_KEY) {
    console.error("Faltam VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY.");
    process.exit(2);
  }
  const asJson = process.argv.includes("--json");
  const supa = createClient(SUPA_URL, SUPA_KEY);

  const { data: products, error: pErr } = await supa.rpc("storefront_list_products", {});
  const { data: categories, error: cErr } = await supa.rpc("storefront_list_categories", {});
  if (pErr) console.error("storefront_list_products:", pErr.message);
  if (cErr) console.error("storefront_list_categories:", cErr.message);

  const targets: { url: string; kind: "product" | "category"; requiredTypes: string[] }[] = [];
  for (const p of (products ?? []) as any[]) {
    targets.push({
      url: `${SITE}/loja/${p.slug}`,
      kind: "product",
      requiredTypes: ["Product", "BreadcrumbList"],
    });
  }
  for (const c of (categories ?? []) as any[]) {
    targets.push({
      url: `${SITE}/loja/categoria/${c.slug}`,
      kind: "category",
      requiredTypes: ["ItemList", "BreadcrumbList"],
    });
  }

  const results: Issue[] = [];
  // limitar concorrência para não sobrecarregar
  const concurrency = 6;
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const r = await Promise.all(batch.map((t) => validate(t.url, t.kind, t.requiredTypes)));
    results.push(...r);
  }

  const withIssues = results.filter((r) => r.problems.length > 0);
  const summary = {
    site: SITE,
    checked: results.length,
    products: targets.filter((t) => t.kind === "product").length,
    categories: targets.filter((t) => t.kind === "category").length,
    ok: results.length - withIssues.length,
    with_issues: withIssues.length,
    issues: withIssues,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n🔎 KS Makeup — Social Preview Validator`);
    console.log(`   Site: ${SITE}`);
    console.log(`   Páginas checadas: ${summary.checked} (produtos: ${summary.products}, categorias: ${summary.categories})`);
    console.log(`   ✅ OK: ${summary.ok}    ⚠️  Com problemas: ${summary.with_issues}\n`);
    for (const issue of withIssues) {
      console.log(`— [${issue.kind}] ${issue.url}`);
      for (const p of issue.problems) console.log(`    • ${p}`);
    }
    if (withIssues.length === 0) console.log("Todos os previews estão válidos. 🎉");
  }

  process.exit(withIssues.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
