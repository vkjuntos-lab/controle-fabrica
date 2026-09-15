// Busca fuzzy client-side via Fuse.js — usada em modo offline e para autocompletes rápidos.
// Instância cacheada por lista (weak-map).
import Fuse from "fuse.js";
import type { Product } from "./pdv-store";

type Indexable = Pick<Product, "sku" | "name"> & { ean?: string | null };

const cache = new WeakMap<object, Fuse<any>>();

function makeFuse<T extends Indexable>(items: T[]): Fuse<T> {
  return new Fuse(items, {
    keys: [
      { name: "sku", weight: 0.4 },
      { name: "ean", weight: 0.3 },
      { name: "name", weight: 0.3 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

/** Retorna até `limit` sugestões ordenadas por relevância. Se `q` vazio, retorna vazio. */
export function fuzzySearchProducts<T extends Indexable>(items: T[], q: string, limit = 8): T[] {
  const query = q.trim();
  if (!query) return [];
  let fuse = cache.get(items as object) as Fuse<T> | undefined;
  if (!fuse) {
    fuse = makeFuse(items);
    cache.set(items as object, fuse);
  }
  return fuse.search(query, { limit }).map((r) => r.item);
}
