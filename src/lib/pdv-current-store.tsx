import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePdvAuth, type Role } from "@/lib/pdv-auth";

export type MyStore = { id: string; name: string; code: string; role: Role };

type Ctx = {
  stores: MyStore[];
  currentStoreId: string | null;
  currentStore: MyStore | null;
  isAdmin: boolean;
  /** true quando admin escolheu "Todas as lojas" (dashboards) */
  viewingAll: boolean;
  setStore: (storeId: string | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const CurrentStoreContext = React.createContext<Ctx | null>(null);
const STORAGE_KEY = "ks-pdv-current-store";

export function CurrentStoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = usePdvAuth();
  const [stores, setStores] = React.useState<MyStore[]>([]);
  const [currentStoreId, setCurrentStoreId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const isAdmin = user?.role === "admin";

  const refresh = React.useCallback(async () => {
    if (!user) {
      setStores([]);
      setCurrentStoreId(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("my_stores");
    if (error) {
      console.error("[current-store]", error);
      setStores([]);
    } else {
      setStores((data ?? []) as MyStore[]);
    }
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Resolve store atual: localStorage > user.storeId > primeira disponível
  React.useEffect(() => {
    if (loading || !user) return;
    const persisted = typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;

    // "__all__" = admin escolheu ver todas
    if (persisted === "__all__" && isAdmin) {
      setCurrentStoreId(null);
      return;
    }

    const valid = persisted && stores.some((s) => s.id === persisted);
    if (valid) {
      setCurrentStoreId(persisted);
    } else if (user.storeId && stores.some((s) => s.id === user.storeId)) {
      setCurrentStoreId(user.storeId);
    } else if (stores[0]) {
      setCurrentStoreId(stores[0].id);
    } else {
      setCurrentStoreId(null);
    }
  }, [loading, user, stores, isAdmin]);

  const setStore = React.useCallback((storeId: string | null) => {
    if (typeof window !== "undefined") {
      if (storeId === null) window.localStorage.setItem(STORAGE_KEY, "__all__");
      else window.localStorage.setItem(STORAGE_KEY, storeId);
      // limpa carrinho ao trocar de loja (evita cruzar catálogo)
      window.localStorage.removeItem("ks-pdv-state-v1");
    }
    setCurrentStoreId(storeId);
    // recarrega para reidratar todo o PdvProvider com a nova loja
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const value = React.useMemo<Ctx>(() => {
    const currentStore = stores.find((s) => s.id === currentStoreId) ?? null;
    return {
      stores,
      currentStoreId,
      currentStore,
      isAdmin: Boolean(isAdmin),
      viewingAll: isAdmin === true && currentStoreId === null,
      setStore,
      loading,
      refresh,
    };
  }, [stores, currentStoreId, isAdmin, setStore, loading, refresh]);

  return <CurrentStoreContext.Provider value={value}>{children}</CurrentStoreContext.Provider>;
}

export function useCurrentStore() {
  const ctx = React.useContext(CurrentStoreContext);
  if (!ctx) throw new Error("useCurrentStore must be used inside <CurrentStoreProvider>");
  return ctx;
}
