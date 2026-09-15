// Cliente-side cart persistido em localStorage para a vitrine pública.
import * as React from "react";
import type { StorefrontProduct, StorefrontOrderItem } from "@/lib/pdv-storefront.functions";

const STORAGE_KEY = "ks-storefront-cart-v1";

export type CartItem = StorefrontOrderItem & { max_stock: number; store_slug: string | null };

type CartState = {
  items: CartItem[];
  storeSlug: string | null;
};

type CartCtx = {
  items: CartItem[];
  storeSlug: string | null;
  totalItems: number;
  totalPrice: number;
  add: (p: StorefrontProduct, qty?: number) => { ok: boolean; reason?: string };
  setQty: (product_id: string, qty: number) => void;
  remove: (product_id: string) => void;
  clear: () => void;
  toOrderItems: () => StorefrontOrderItem[];
};

const Ctx = React.createContext<CartCtx | null>(null);

function readInitial(): CartState {
  if (typeof window === "undefined") return { items: [], storeSlug: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], storeSlug: null };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [], storeSlug: null };
    return { items: parsed.items, storeSlug: parsed.storeSlug ?? null };
  } catch {
    return { items: [], storeSlug: null };
  }
}

export function StorefrontCartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<CartState>({ items: [], storeSlug: null });
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setState(readInitial());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state, hydrated]);

  const add: CartCtx["add"] = React.useCallback((p, qty = 1) => {
    if (!p.in_stock || p.stock <= 0) return { ok: false, reason: "Produto sem estoque." };
    const wantQty = Math.max(1, qty);
    let result: { ok: boolean; reason?: string } = { ok: true };
    setState((prev) => {
      // Cart é single-store — se produto vem de outra loja, resetamos
      const newStoreSlug = p.store_slug ?? prev.storeSlug;
      let items = prev.items;
      if (prev.storeSlug && p.store_slug && prev.storeSlug !== p.store_slug) {
        items = [];
      }
      const existing = items.find((i) => i.product_id === p.id);
      const currentQty = existing?.qty ?? 0;
      const nextQty = Math.min(p.stock, currentQty + wantQty);
      if (nextQty <= currentQty) {
        result = { ok: false, reason: `Máximo disponível: ${p.stock} un.` };
        return prev;
      }
      const nextItem: CartItem = {
        product_id: p.id,
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        qty: nextQty,
        unit_price: p.price,
        image: p.image,
        max_stock: p.stock,
        store_slug: p.store_slug,
      };
      const nextItems = existing
        ? items.map((i) => (i.product_id === p.id ? nextItem : i))
        : [...items, nextItem];
      return { items: nextItems, storeSlug: newStoreSlug };
    });
    return result;
  }, []);

  const setQty: CartCtx["setQty"] = React.useCallback((product_id, qty) => {
    setState((prev) => {
      const items = prev.items
        .map((i) => (i.product_id === product_id
          ? { ...i, qty: Math.min(Math.max(1, qty), i.max_stock || qty) } : i))
        .filter((i) => i.qty > 0);
      return { ...prev, items, storeSlug: items.length ? prev.storeSlug : null };
    });
  }, []);

  const remove: CartCtx["remove"] = React.useCallback((product_id) => {
    setState((prev) => {
      const items = prev.items.filter((i) => i.product_id !== product_id);
      return { items, storeSlug: items.length ? prev.storeSlug : null };
    });
  }, []);

  const clear = React.useCallback(() => setState({ items: [], storeSlug: null }), []);

  const totalItems = state.items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = state.items.reduce((s, i) => s + i.qty * i.unit_price, 0);

  const toOrderItems = React.useCallback<CartCtx["toOrderItems"]>(
    () => state.items.map(({ max_stock, store_slug, ...rest }) => rest),
    [state.items],
  );

  const value: CartCtx = {
    items: state.items,
    storeSlug: state.storeSlug,
    totalItems,
    totalPrice,
    add,
    setQty,
    remove,
    clear,
    toOrderItems,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStorefrontCart(): CartCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    // Safe no-op durante SSR fora do provider
    return {
      items: [], storeSlug: null, totalItems: 0, totalPrice: 0,
      add: () => ({ ok: false, reason: "Cart indisponível" }),
      setQty: () => {}, remove: () => {}, clear: () => {}, toOrderItems: () => [],
    };
  }
  return ctx;
}

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
