import { Link, useRouterState } from "@tanstack/react-router";
import ksLogo from "@/assets/ks-makeup-logo.jpg.asset.json";
import {
  LayoutDashboard,
  ShoppingCart,
  CreditCard,
  Wallet,
  Package,
  Users,
  Truck,
  BarChart3,
  DollarSign,
  FileText,
  Megaphone,
  UserCog,
  Receipt,
  Sparkles,
  ShieldCheck,
  Building2,
  Ticket,
  Bell,
  Gift,
  Target,
  Plug,
  BookOpen,
  Bot,
  Clock3,

} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { LucideIcon } from "lucide-react";

type Role = "admin" | "manager" | "cashier" | "stockist";

type Item = {
  title: string;
  url?: string;
  icon: LucideIcon;
  soon?: boolean;
  roles?: Role[];
};

type Group = { label: string; items: Item[] };

const groups: Group[] = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", url: "/pdv", icon: LayoutDashboard },
      { title: "Venda", url: "/pdv/venda", icon: ShoppingCart },
      { title: "Modo Caixa", url: "/pdv/caixa", icon: ShoppingCart, roles: ["admin", "manager", "cashier"] },
      { title: "Pagamento", url: "/pdv/pagamento", icon: CreditCard },
      { title: "PIX pendentes", url: "/pdv/pix", icon: Wallet, roles: ["admin", "manager", "cashier"] },
      { title: "Recebimentos", url: "/pdv/recebimentos", icon: Receipt, roles: ["admin", "manager", "cashier"] },
      { title: "Fechamento", url: "/pdv/fechamento", icon: Wallet },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Catálogo", url: "/pdv/catalogo", icon: Package, roles: ["admin", "manager", "stockist"] },
      { title: "Cadastro em Lote", url: "/pdv/produtos-lote", icon: Package, roles: ["admin", "manager", "stockist"] },
      { title: "Clientes", url: "/pdv/clientes", icon: Users, roles: ["admin", "manager", "cashier"] },
      { title: "Crediário", url: "/pdv/crediario", icon: Wallet, roles: ["admin", "manager", "cashier"] },
      { title: "Vales-presente", url: "/pdv/vales", icon: Ticket, roles: ["admin", "manager", "cashier"] },
      { title: "Fornecedores", icon: Truck, soon: true },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Relatórios", url: "/pdv/relatorios", icon: BarChart3, roles: ["admin", "manager"] },
      { title: "BI & Analytics", url: "/pdv/bi", icon: BarChart3, roles: ["admin", "manager"] },
      { title: "Auditoria", url: "/pdv/auditoria", icon: ShieldCheck, roles: ["admin", "manager"] },
      { title: "Antifraude", url: "/pdv/antifraude", icon: ShieldCheck, roles: ["admin", "manager"] },
      { title: "Financeiro", url: "/pdv/financeiro", icon: DollarSign, roles: ["admin", "manager"] },
      { title: "Fluxo de caixa", url: "/pdv/financeiro/fluxo", icon: DollarSign, roles: ["admin", "manager"] },
      { title: "DRE / ABC", url: "/pdv/financeiro/dre", icon: DollarSign, roles: ["admin", "manager"] },
      { title: "Fiscal — Config", url: "/pdv/fiscal/config", icon: FileText, roles: ["admin", "manager"] },
      { title: "Fiscal — Documentos", url: "/pdv/fiscal/documentos", icon: FileText, roles: ["admin", "manager", "cashier"] },
      { title: "Fiscal — SPED", url: "/pdv/fiscal/sped", icon: FileText, roles: ["admin", "manager"] },
      { title: "Fotos Marketing IA", url: "/pdv/marketing-fotos", icon: Sparkles, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "CRM & Fidelidade",
    items: [
      { title: "Fidelidade", url: "/pdv/fidelidade", icon: Gift, roles: ["admin", "manager", "cashier"] },
      { title: "Segmentos", url: "/pdv/crm", icon: Target, roles: ["admin", "manager"] },
      { title: "Campanhas", url: "/pdv/crm/campanhas", icon: Megaphone, roles: ["admin", "manager"] },
      { title: "Cupons", url: "/pdv/crm/cupons", icon: Ticket, roles: ["admin", "manager"] },
      { title: "Templates WA", url: "/pdv/crm/templates", icon: Megaphone, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "Integrações",
    items: [
      { title: "Marketplaces", url: "/pdv/marketplaces", icon: Plug, roles: ["admin", "manager"] },
      { title: "Inbox Omnichannel", url: "/pdv/inbox", icon: Bot, roles: ["admin", "manager", "cashier"] },
      { title: "Filas & SLA", url: "/pdv/filas", icon: Clock3, roles: ["admin", "manager"] },
      { title: "Pós-venda", url: "/pdv/pos-venda", icon: Truck, roles: ["admin", "manager", "cashier"] },
      { title: "Postador Omnichannel", url: "/pdv/social-manager", icon: Sparkles, roles: ["admin", "manager"] },
      { title: "Vitrine online", url: "/loja", icon: Sparkles },
      { title: "Vitrine — Pedidos", url: "/pdv/vitrine", icon: Sparkles, roles: ["admin", "manager", "cashier"] },
    ],
  },
  {
    label: "Configurações",
    items: [
      { title: "Lojas", url: "/pdv/lojas", icon: Building2, roles: ["admin"] },
      { title: "Usuários", url: "/pdv/usuarios", icon: UserCog, roles: ["admin"] },
      { title: "WhatsApp — Config", url: "/pdv/whatsapp", icon: Bot, roles: ["admin", "manager"] },
      { title: "Instagram — Config", url: "/pdv/instagram", icon: Bot, roles: ["admin", "manager"] },
      { title: "Facebook — Config", url: "/pdv/facebook", icon: Bot, roles: ["admin", "manager"] },
      { title: "Notificações", url: "/pdv/notificacoes", icon: Bell, roles: ["admin", "manager"] },
      { title: "Mercado Livre — Config", url: "/pdv/mercado-livre", icon: Bot, roles: ["admin", "manager"] },
      { title: "Cupom / Recibo", url: "/pdv/config", icon: Receipt },

      { title: "Manual do sistema", url: "/pdv/manual", icon: BookOpen },
    ],
  },
];

export function AppSidebar({ role }: { role: Role }) {
  const { state, isMobile, setOpenMobile, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const handleNavigate = () => {
    // Fecha sempre antes da navegação, em qualquer tamanho de tela
    setOpenMobile(false);
    if (!isMobile) setOpen(false);
  };

  const isActive = (url?: string) => {
    if (!url) return false;
    if (url === "/pdv") return currentPath === "/pdv" || currentPath === "/pdv/";
    return currentPath === url || currentPath.startsWith(url + "/");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/pdv" onClick={handleNavigate} className="flex items-center gap-2 px-2 py-1.5">
          <img
            src={ksLogo.url}
            alt="Estratégia"
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border bg-background"
          />
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold tracking-wide">Estratégia</span>
              <span className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Multistore
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => {
          const visible = g.items.filter((i) => !i.roles || i.roles.includes(role));
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const Icon = item.icon;
                    if (item.soon || !item.url) {
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            disabled
                            className="cursor-not-allowed opacity-60"
                            tooltip={collapsed ? `${item.title} · em breve` : undefined}
                          >
                            <Icon className="h-4 w-4" />
                            {!collapsed && (
                              <>
                                <span className="flex-1">{item.title}</span>
                                <Badge variant="secondary" className="text-[10px]">
                                  em breve
                                </Badge>
                              </>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.url)}
                          tooltip={collapsed ? item.title : undefined}
                        >
                          <Link to={item.url} onClick={handleNavigate}>
                            <Icon className="h-4 w-4" />
                            {!collapsed && <span>{item.title}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && (
          <p className="px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
            v0.1 · Fundação
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
