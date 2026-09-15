import * as React from "react";
import { Check, ChevronsUpDown, Store, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentStore } from "@/lib/pdv-current-store";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  cashier: "Caixa",
  stockist: "Estoque",
};

export function StoreSwitcher() {
  const { stores, currentStore, currentStoreId, isAdmin, viewingAll, setStore, loading } =
    useCurrentStore();

  if (loading) {
    return <span className="text-xs text-muted-foreground">Carregando lojas…</span>;
  }
  if (stores.length === 0 && !isAdmin) {
    return (
      <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        Sem loja
      </span>
    );
  }

  // Sem switcher: só uma loja e não é admin (não há alternativa útil)
  const showSwitcher = stores.length > 1 || isAdmin;
  const label = viewingAll ? "Todas as lojas" : currentStore?.name ?? "Selecionar loja";

  if (!showSwitcher) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs sm:inline-flex">
        <Store className="h-3 w-3 text-muted-foreground" />
        <span className="max-w-[10rem] truncate font-medium">{label}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          {viewingAll ? <Globe className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
          <span className="max-w-[12rem] truncate">{label}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Loja atual</DropdownMenuLabel>
        {isAdmin && (
          <DropdownMenuItem onClick={() => setStore(null)} className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="flex-1">Todas as lojas</span>
            <span className="text-[10px] text-muted-foreground">consolidado</span>
            {viewingAll && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        )}
        {isAdmin && stores.length > 0 && <DropdownMenuSeparator />}
        {stores.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => setStore(s.id)} className="gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{s.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {s.code} · {ROLE_LABEL[s.role] ?? s.role}
              </span>
            </div>
            {currentStoreId === s.id && !viewingAll && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
