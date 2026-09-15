import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "./pdv-audit";
import { pinToPassword } from "./pdv-pin";

/* ============================================================
 * Autenticação com papéis + multi-loja
 *  - Admin: email/senha (padrão admin/admin, mapeado para email técnico)
 *  - Gerente/Caixa/Estoquista: login por PIN
 *      internamente cada operador tem um email técnico op-<uuid>@ksmultimake.local
 *      e a senha é o próprio PIN (mín. 6 dígitos, exigência do backend).
 * ============================================================ */

export type Role = "admin" | "manager" | "cashier" | "stockist";

export type PdvUser = {
  userId: string;
  loginEmail: string;
  displayName: string;
  role: Role;
  storeId: string | null;
  storeName: string | null;
};

export type LoginStore = { id: string; name: string; code: string };
export type LoginOperator = {
  user_id: string;
  display_name: string;
  role: Role;
  login_email: string;
};

type Ctx = {
  user: PdvUser | null;
  loading: boolean;
  listStores: () => Promise<LoginStore[]>;
  listOperators: (storeId: string) => Promise<LoginOperator[]>;
  signInWithPin: (loginEmail: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  signInAdmin: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

// Nenhuma credencial de admin é embutida no cliente. O login administrativo
// exige e-mail + senha reais definidos pelo próprio administrador.

const AuthContext = React.createContext<Ctx | null>(null);

type UserRoleRow = {
  user_id: string;
  role: Role;
  store_id: string | null;
  display_name: string;
  login_email: string | null;
  active: boolean;
  stores: { name: string } | null;
};

async function loadPdvUser(): Promise<PdvUser | null> {
  const { data: session } = await supabase.auth.getSession();
  const authUser = session.session?.user;
  if (!authUser) return null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role, store_id, display_name, login_email, active, stores(name)")
    .eq("user_id", authUser.id)
    .eq("active", true)
    .order("role", { ascending: true }); // admin < cashier < manager por ordem alfabética
  if (error) {
    console.error("[pdv-auth] falha ao carregar papel:", error);
    return null;
  }
  const rows = ((data ?? []) as unknown) as UserRoleRow[];
  if (rows.length === 0) {
    // sem papel = sem acesso (força signOut para não travar)
    await supabase.auth.signOut();
    return null;
  }
  // prioridade: admin > manager > cashier
  const priority: Record<Role, number> = { admin: 0, manager: 1, cashier: 2, stockist: 3 };
  rows.sort((a, b) => priority[a.role] - priority[b.role]);
  const primary = rows[0];

  return {
    userId: primary.user_id,
    loginEmail: primary.login_email ?? authUser.email ?? "",
    displayName: primary.display_name,
    role: primary.role,
    storeId: primary.store_id,
    storeName: primary.stores?.name ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<PdvUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function refresh() {
      const u = await loadPdvUser();
      if (!mounted) return;
      setUser(u);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void refresh();
      }
    });

    void refresh();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const listStores = React.useCallback(async () => {
    const { data, error } = await supabase.rpc("list_login_stores");
    if (error) throw error;
    return (data ?? []) as LoginStore[];
  }, []);

  const listOperators = React.useCallback(async (storeId: string) => {
    const { data, error } = await supabase.rpc("list_login_operators", { _store_id: storeId });
    if (error) throw error;
    return (data ?? []) as LoginOperator[];
  }, []);

  const signInWithPin = React.useCallback(
    async (loginEmail: string, pin: string) => {
      // Tenta a senha derivada (padrão atual) e, em seguida, o PIN puro (contas antigas).
      let { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: pinToPassword(pin),
      });
      if (error) {
        const legacy = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: pin,
        });
        error = legacy.error;
      }
      if (error) {
        void logAudit("auth.login_failed", {
          entity: "user",
          details: { method: "pin", email: loginEmail, reason: error.message },
        });
        return { ok: false, error: "PIN inválido" };
      }
      void logAudit("auth.login", { entity: "user", details: { method: "pin" } });
      return { ok: true };
    },
    [],
  );


  const signInAdmin = React.useCallback(
    async (username: string, password: string) => {
      const email = username.trim();
      const pwd = password;
      if (!email || !pwd) {
        return { ok: false, error: "Informe e-mail e senha do administrador." };
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
      
      if (error) {
        const errorMsg = error.message || "Credenciais inválidas";
        void logAudit("auth.login_failed", {
          entity: "user",
          details: { method: "admin", email, reason: errorMsg },
        });
        return { ok: false, error: errorMsg };
      }
      void logAudit("auth.login", { entity: "user", details: { method: "admin" } });
      return { ok: true };
    },
    [],
  );

  const signOut = React.useCallback(async () => {
    await logAudit("auth.logout", { entity: "user" });
    try {
      // limpa qualquer estado local do PDV para não vazar entre operadores
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("ks-pdv-state-v1");
      }
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, listStores, listOperators, signInWithPin, signInAdmin, signOut }),
    [user, loading, listStores, listOperators, signInWithPin, signInAdmin, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePdvAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("usePdvAuth must be used inside <AuthProvider>");
  return ctx;
}
