/**
 * RBAC central — papéis, permissões e módulos.
 *
 * As permissões vivem no banco (public.role_permissions) e são a fonte de
 * verdade para autorização. Este arquivo apenas descreve as chaves conhecidas
 * pelo frontend e os rótulos exibidos ao usuário. Nunca use e-mail ou nome
 * de usuário para decidir permissão.
 */

export const APP_ROLES = [
  "admin",
  "gestor",
  "financeiro",
  "estoque",
  "producao",
  "comercial",
  "marketplace",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  financeiro: "Financeiro",
  estoque: "Estoque",
  producao: "Produção",
  comercial: "Comercial",
  marketplace: "Marketplace",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Acesso total, incluindo permissões e remoção de participantes.",
  gestor: "Gestão da organização e dos participantes.",
  financeiro: "Cobrança, recebimento e resultados financeiros.",
  estoque: "Movimentações e posição de estoque.",
  producao: "Ordens de produção e consumo de matéria-prima.",
  comercial: "Clientes, pedidos e vendas B2B.",
  marketplace: "Lojas, importações e reconciliação de marketplaces.",
};

/** Permissões atualmente reconhecidas pela aplicação. */
export const PERMISSIONS = {
  organizationRead: "organization.read",
  organizationManage: "organization.manage",
  usersRead: "users.read",
  usersManage: "users.manage",
  permissionsRead: "permissions.read",
  permissionsManage: "permissions.manage",
  auditRead: "audit.read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<string, string> = {
  "organization.read": "Ver organização",
  "organization.manage": "Editar organização",
  "users.read": "Ver participantes",
  "users.manage": "Gerenciar participantes",
  "permissions.read": "Ver permissões",
  "permissions.manage": "Editar permissões",
  "audit.read": "Ver auditoria",
};

/**
 * Módulos previstos para a plataforma. `status` reflete o que existe de fato
 * no código — nada aqui deve simular funcionalidade inexistente.
 */
export type ModuleStatus = "available" | "coming_soon";

export type ModuleDefinition = {
  key: string;
  label: string;
  description: string;
  status: ModuleStatus;
};

export const PLATFORM_MODULES: ModuleDefinition[] = [
  { key: "dashboard", label: "Dashboard", description: "Indicadores da operação.", status: "available" },
  { key: "comercial", label: "Comercial", description: "Clientes, pedidos e vendas B2B.", status: "coming_soon" },
  { key: "produtos", label: "Produtos", description: "Produtos, variantes e SKUs.", status: "coming_soon" },
  { key: "estoque", label: "Estoque", description: "Inventory ledger e posição por local.", status: "coming_soon" },
  { key: "producao", label: "Produção", description: "Matéria-prima e ordens de produção.", status: "coming_soon" },
  { key: "marketplaces", label: "Marketplaces", description: "Lojas, importações e reconciliação.", status: "coming_soon" },
  { key: "parceiros", label: "Parceiros", description: "Remessas, posição em posse e fechamento.", status: "coming_soon" },
  { key: "financeiro", label: "Financeiro", description: "Cobrança, recebimento e resultado.", status: "coming_soon" },
  { key: "relatorios", label: "Relatórios", description: "Quantidade vendida e valores.", status: "coming_soon" },
  { key: "inteligencia", label: "Inteligência", description: "Análises e projeções.", status: "coming_soon" },
  { key: "administracao", label: "Administração", description: "Organização, usuários e permissões.", status: "available" },
];
