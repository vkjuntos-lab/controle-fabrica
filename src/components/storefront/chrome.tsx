import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useStorefrontCart } from "@/lib/pdv-storefront-cart";

export function StorefrontHeader({ subtitle }: { subtitle?: string }) {
  const { totalItems } = useStorefrontCart();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/loja" className="text-xl font-bold tracking-tight">
          KS MultiMake<span className="text-primary">.</span>
        </Link>
        <div className="hidden text-xs text-muted-foreground sm:block">
          {subtitle ?? "Beleza & cuidado — vitrine online"}
        </div>
        <Link
          to="/loja/carrinho"
          className="relative inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary/60"
        >
          🛒 Carrinho
          {totalItems > 0 && (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="mt-16 border-t border-border py-6 text-center text-xs text-muted-foreground">
      © KS MultiMake — Vitrine online · Todos os direitos reservados.
    </footer>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        Esgotado
      </span>
    );
  }
  if (stock <= 3) {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600">
        Últimas {stock} un.
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
      Em estoque
    </span>
  );
}
