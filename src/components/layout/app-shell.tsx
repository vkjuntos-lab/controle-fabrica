import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Building2,
  ChevronsUpDown,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Scale,
  ScrollText,
  ShieldCheck,
  User,
  Users,
  Warehouse,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/rbac";

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  permission?: string;
};

const OPERATION_ITEMS: NavItem[] = [
  { label: "Parceiros", to: "/parceiros", icon: Handshake, permission: PERMISSIONS.partnersRead },
  {
    label: "Remessas de parceiros",
    to: "/parceiros/remessas",
    icon: Package,
    permission: PERMISSIONS.partnerShipmentsRead,
  },
  {
    label: "Devoluções de parceiros",
    to: "/parceiros/devolucoes",
    icon: ArrowLeftRight,
    permission: PERMISSIONS.partnerReturnsRead,
  },
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Produtos", to: "/produtos", icon: Package, permission: PERMISSIONS.productsRead },
  {
    label: "Estoque",
    to: "/estoque",
    icon: Warehouse,
    permission: PERMISSIONS.inventoryRead,
  },
  {
    label: "Movimentações",
    to: "/estoque/movimentacoes",
    icon: ArrowLeftRight,
    permission: PERMISSIONS.inventoryMovementsRead,
  },
  {
    label: "Transferências",
    to: "/estoque/transferencias",
    icon: Handshake,
    permission: PERMISSIONS.inventoryRead,
  },
  {
    label: "Localizações",
    to: "/estoque/locations",
    icon: MapPin,
    permission: PERMISSIONS.inventoryRead,
  },
  {
    label: "Em terceiros",
    to: "/estoque/terceiros",
    icon: Building2,
    permission: PERMISSIONS.inventoryRead,
  },
  {
    label: "Inventário",
    to: "/estoque/inventarios",
    icon: ClipboardList,
    permission: PERMISSIONS.inventoryCount,
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    label: "Organização",
    to: "/admin/organizacao",
    icon: Building2,
    permission: PERMISSIONS.organizationRead,
  },
  { label: "Usuários", to: "/admin/usuarios", icon: Users, permission: PERMISSIONS.usersRead },
  {
    label: "Permissões",
    to: "/admin/permissoes",
    icon: ShieldCheck,
    permission: PERMISSIONS.permissionsRead,
  },
  {
    label: "Auditoria",
    to: "/admin/auditoria",
    icon: ScrollText,
    permission: PERMISSIONS.auditRead,
  },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        E
      </div>
      <div className="leading-tight">
        <p className="font-heading text-sm font-semibold text-sidebar-foreground">Estratégia</p>
        <p className="text-xs text-muted-foreground">Gestão industrial</p>
      </div>
    </div>
  );
}

function OrgSwitcher() {
  const { organizations, currentOrganization, setCurrentOrganization } = useOrganization();
  if (!currentOrganization) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-[240px] justify-between gap-2">
          <span className="truncate">{currentOrganization.name}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizações</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.organization_id}
            onClick={() => setCurrentOrganization(org.organization_id)}
          >
            <span className="truncate">{org.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{ROLE_LABELS[org.role]}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding">Criar nova organização</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu do usuário">
          <User className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link to="/perfil">Meu perfil</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavSection({ label, items }: { label: string; items: NavItem[] }) {
  const { hasPermission } = useOrganization();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visible = items.filter((item) => !item.permission || hasPermission(item.permission));
  if (!visible.length) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
              >
                <Link to={item.to}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { currentOrganization, role } = useOrganization();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <BrandMark />
        </SidebarHeader>
        <SidebarContent>
          <NavSection label="Operação" items={OPERATION_ITEMS} />
          <NavSection label="Administração" items={ADMIN_ITEMS} />
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-2 text-xs text-muted-foreground">
            {currentOrganization ? (
              <>
                <p className="truncate font-medium text-sidebar-foreground">
                  {currentOrganization.name}
                </p>
                <p>{role ? ROLE_LABELS[role] : ""}</p>
              </>
            ) : null}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <h1 className="font-heading text-sm font-semibold sm:text-base">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <OrgSwitcher />
            </div>
            <UserMenu />
          </div>
        </header>
        <main className="page-container flex-1 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
