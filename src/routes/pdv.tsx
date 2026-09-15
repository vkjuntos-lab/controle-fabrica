import { createFileRoute, Outlet, Navigate, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import * as React from "react";
import { PdvProvider, usePdv, brl, type PdvIdentity } from "@/lib/pdv-store";
import { ReceiptSettingsProvider } from "@/lib/pdv-settings";
import { AuthProvider, usePdvAuth } from "@/lib/pdv-auth";
import { CurrentStoreProvider, useCurrentStore } from "@/lib/pdv-current-store";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { StoreSwitcher } from "@/components/store-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { OfflineBanner } from "@/components/offline-banner";
import { InstallButton } from "@/lib/pwa/install-prompt";
import { registerPwa } from "@/lib/pwa/register";
import { Button } from "@/components/ui/button";
import { LogOut, PlayCircle, LayoutDashboard, Package, ShoppingCart, Users, Bot, User } from "lucide-react";

export const Route = createFileRoute("/pdv")({
  component: PdvLayoutRoute,
});

function PdvLayoutRoute() {
  return (
    <AuthProvider>
      <AuthGate>
        <CurrentStoreProvider>
          <PdvBoundary />
        </CurrentStoreProvider>
      </AuthGate>
    </AuthProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = usePdvAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PdvBoundary() {
  const { user } = usePdvAuth();
  const { currentStoreId, currentStore, loading: storeLoading } = useCurrentStore();
  if (!user) return null;
  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando lojas…
      </div>
    );
  }
  const identity: PdvIdentity = {
    userId: user.userId,
    storeId: currentStoreId,
    operatorName: user.displayName,
  };
  return (
    <PdvProvider identity={identity}>
      <ReceiptSettingsProvider>
        <PdvShell storeName={currentStore?.name ?? null} />
      </ReceiptSettingsProvider>
    </PdvProvider>
  );
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Caixa",
  stockist: "Estoquista",
};

function PdvShell({ storeName }: { storeName: string | null }) {
  const { state, hydrateOpenSession, openSessionRemote } = usePdv();
  const { user, signOut } = usePdvAuth();
  const { viewingAll } = useCurrentStore();
  const navigate = useNavigate();

  const role = (user?.role ?? "cashier") as "admin" | "manager" | "cashier" | "stockist";
  const canOpenSession = Boolean(storeName) && !viewingAll;
  const session = state.session;
  const active = session && !session.closedAt;

  const hydratedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!user) return;
    if (hydratedFor.current === user.userId) return;
    hydratedFor.current = user.userId;
    void hydrateOpenSession();
  }, [user, hydrateOpenSession]);

  React.useEffect(() => { void registerPwa(); }, []);


  async function handleLogout() {
    await signOut();
    navigate({ to: "/login" });
  }

  async function handleOpenSession() {
    try {
      await openSessionRemote({ opening: 200 });
    } catch {
      /* já logado */
    }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FBF8F5] text-foreground pb-16 sm:pb-0">
        <div className="hidden sm:flex">
          <AppSidebar role={role} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur sm:gap-3 sm:px-4">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <StoreSwitcher />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {active ? (
                <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 md:inline-flex dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Caixa aberto · {brl(session!.opening)}
                </span>
              ) : canOpenSession ? (
                <Button size="sm" onClick={handleOpenSession} className="h-8 gap-1.5 px-2 sm:px-3">
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Abrir caixa</span>
                </Button>
              ) : (
                <span className="hidden rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 md:inline-block dark:text-amber-400">
                  Sem loja
                </span>
              )}

              <div className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 text-xs sm:flex">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    role === "admin"
                      ? "bg-amber-500"
                      : role === "manager"
                      ? "bg-violet-500"
                      : "bg-sky-500"
                  }`}
                />
                <span className="hidden max-w-[10rem] truncate font-medium text-foreground md:block">
                  {user?.displayName}
                </span>
                <span className="hidden text-muted-foreground lg:block">
                  · {ROLE_LABEL[role]}
                </span>
              </div>

              <NotificationBell />
              <InstallButton />

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-8 w-8"
                title="Sair"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </header>

          <OfflineBanner />

          <main className="flex-1 min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[100rem] min-w-0">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      
      {/* Rodapé Mobile estilo WASeller */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-white/80 px-2 backdrop-blur-md sm:hidden">
        <MobileNavItem to="/pdv" icon={<LayoutDashboard className="h-5 w-5" />} label="Início" />
        <MobileNavItem to="/pdv/catalogo" icon={<Package className="h-5 w-5" />} label="Catálogo" />
        <MobileNavItem to="/pdv/vitrine" icon={<ShoppingCart className="h-5 w-5" />} label="Pedidos" />
        <MobileNavItem to="/pdv/clientes" icon={<Users className="h-5 w-5" />} label="Clientes" />
        <MobileNavItem to="/pdv/config" icon={<User className="h-5 w-5" />} label="Perfil" />
      </nav>
    </SidebarProvider>
  );
}

function MobileNavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = currentPath === to || (to !== "/pdv" && currentPath.startsWith(to));
  
  return (
    <Link 
      to={to} 
      className={`flex flex-col items-center justify-center gap-1 transition-colors ${
        isActive ? "text-[#D63351]" : "text-muted-foreground"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
