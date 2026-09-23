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
  partnersRead: "partners.read",
  partnersCreate: "partners.create",
  partnersUpdate: "partners.update",
  partnersBlock: "partners.block",
  partnerContactsManage: "partner_contacts.manage",
  partnerAddressesManage: "partner_addresses.manage",
  partnerShipmentsRead: "partner_shipments.read",
  partnerShipmentsCreate: "partner_shipments.create",
  partnerShipmentsApprove: "partner_shipments.approve",
  partnerShipmentsPick: "partner_shipments.pick",
  partnerShipmentsShip: "partner_shipments.ship",
  partnerShipmentsReceive: "partner_shipments.receive",
  partnerShipmentsCancel: "partner_shipments.cancel",
  partnerReturnsRead: "partner_returns.read",
  partnerReturnsCreate: "partner_returns.create",
  partnerReturnsReceive: "partner_returns.receive",
  partnerInventoryRead: "partner_inventory.read",
  partnerInventoryAdjust: "partner_inventory.adjust",
  partnerReconciliationRead: "partner_reconciliation.read",
  partnerReconciliationCreate: "partner_reconciliation.create",
  partnerReconciliationProcess: "partner_reconciliation.process",
  partnerReconciliationReview: "partner_reconciliation.review",
  partnerReconciliationResolveException: "partner_reconciliation.resolve_exception",
  partnerReconciliationClose: "partner_reconciliation.close",
  partnerReconciliationReopen: "partner_reconciliation.reopen",
  partnerReconciliationReverse: "partner_reconciliation.reverse",
  partnerPricingRead: "partner_pricing.read",
  partnerPricingManage: "partner_pricing.manage",

  organizationRead: "organization.read",
  organizationManage: "organization.manage",
  usersRead: "users.read",
  usersManage: "users.manage",
  permissionsRead: "permissions.read",
  permissionsManage: "permissions.manage",
  auditRead: "audit.read",
  productsRead: "products.read",
  productsManage: "products.manage",
  inventoryAllowNegative: "inventory.allow_negative",
  inventoryRead: "inventory.read",
  inventoryMovementsRead: "inventory.movements.read",
  inventoryMove: "inventory.move",
  inventoryAdjust: "inventory.adjust",
  inventoryTransfer: "inventory.transfer",
  inventoryCount: "inventory.count",
  inventoryOpeningBalance: "inventory.opening_balance",
  inventoryReverse: "inventory.reverse",
  inventoryManageLocations: "inventory.manage_locations",

  financeRead: "finance.read",
  financeDashboard: "finance.dashboard",
  financeExport: "finance.export",
  financeManage: "finance.manage",
  receivablesRead: "receivables.read",
  receivablesCreate: "receivables.create",
  receivablesUpdate: "receivables.update",
  receivablesCancel: "receivables.cancel",
  receivablesSettle: "receivables.settle",
  receivablesReverse: "receivables.reverse",
  receivablesWriteOff: "receivables.write_off",
  payablesRead: "payables.read",
  payablesCreate: "payables.create",
  payablesUpdate: "payables.update",
  payablesApprove: "payables.approve",
  payablesCancel: "payables.cancel",
  payablesSettle: "payables.settle",
  payablesReverse: "payables.reverse",
  financialAccountsRead: "financial_accounts.read",
  financialAccountsManage: "financial_accounts.manage",
  financialCategoriesRead: "financial_categories.read",
  financialCategoriesManage: "financial_categories.manage",
  costCentersRead: "cost_centers.read",
  costCentersManage: "cost_centers.manage",
  paymentMethodsRead: "payment_methods.read",
  paymentMethodsManage: "payment_methods.manage",
  financialTransfersCreate: "financial_transfers.create",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<string, string> = {
  "partners.read": "Ver empresas parceiras",
  "partners.create": "Cadastrar empresas",
  "partners.update": "Editar empresas",
  "partners.block": "Bloquear parceiros",
  "partner_contacts.manage": "Gerenciar contatos",
  "partner_addresses.manage": "Gerenciar endereços",
  "partner_shipments.read": "Ver remessas",
  "partner_shipments.create": "Criar remessas",
  "partner_shipments.approve": "Aprovar remessas",
  "partner_shipments.pick": "Separar itens",
  "partner_shipments.ship": "Expedir remessas",
  "partner_shipments.receive": "Confirmar entregas",
  "partner_shipments.cancel": "Cancelar remessas",
  "partner_returns.read": "Ver devoluções",
  "partner_returns.create": "Criar devoluções",
  "partner_returns.receive": "Receber devoluções",
  "partner_inventory.read": "Ver estoque de parceiros",
  "partner_inventory.adjust": "Ajustar estoque de parceiros",
  "partner_reconciliation.read": "Ver reconciliação de parceiros",
  "partner_reconciliation.create": "Criar períodos de reconciliação",
  "partner_reconciliation.process": "Processar reconciliação",
  "partner_reconciliation.review": "Revisar vendas do marketplace",
  "partner_reconciliation.resolve_exception": "Resolver exceções de reconciliação",
  "partner_reconciliation.close": "Fechar período com o parceiro",
  "partner_reconciliation.reopen": "Reabrir período fechado",
  "partner_reconciliation.reverse": "Estornar baixas reconciliadas",
  "partner_pricing.read": "Ver tabelas de preço",
  "partner_pricing.manage": "Gerenciar tabelas e regras de preço",

  "organization.read": "Ver organização",
  "organization.manage": "Editar organização",
  "users.read": "Ver participantes",
  "users.manage": "Gerenciar participantes",
  "permissions.read": "Ver permissões",
  "permissions.manage": "Editar permissões",
  "audit.read": "Ver auditoria",
  "products.read": "Ver catálogo de produtos",
  "products.manage": "Gerenciar catálogo de produtos",
  "inventory.allow_negative": "Autorizar saída com estoque negativo",
  "inventory.read": "Ver posição de estoque",
  "inventory.movements.read": "Ver movimentações de estoque",
  "inventory.move": "Movimentar estoque (entradas/saídas)",
  "inventory.adjust": "Ajustar estoque",
  "inventory.transfer": "Realizar transferências",
  "inventory.count": "Fazer inventário físico",
  "inventory.opening_balance": "Abrir saldo de estoque",
  "inventory.reverse": "Reverter movimentações",
  "inventory.manage_locations": "Gerenciar localizações",
  "finance.read": "Ver financeiro",
  "finance.dashboard": "Ver painel financeiro",
  "finance.export": "Exportar dados financeiros",
  "finance.manage": "Gerenciar configurações financeiras",
  "receivables.read": "Ver contas a receber",
  "receivables.create": "Criar contas a receber",
  "receivables.update": "Editar contas a receber",
  "receivables.cancel": "Cancelar contas a receber",
  "receivables.settle": "Registrar recebimentos",
  "receivables.reverse": "Estornar recebimentos",
  "receivables.write_off": "Baixar títulos incobráveis",
  "payables.read": "Ver contas a pagar",
  "payables.create": "Criar contas a pagar",
  "payables.update": "Editar contas a pagar",
  "payables.approve": "Aprovar contas a pagar",
  "payables.cancel": "Cancelar contas a pagar",
  "payables.settle": "Registrar pagamentos",
  "payables.reverse": "Estornar pagamentos",
  "financial_accounts.read": "Ver contas financeiras",
  "financial_accounts.manage": "Gerenciar contas financeiras",
  "financial_categories.read": "Ver categorias financeiras",
  "financial_categories.manage": "Gerenciar categorias financeiras",
  "cost_centers.read": "Ver centros de custo",
  "cost_centers.manage": "Gerenciar centros de custo",
  "payment_methods.read": "Ver formas de pagamento",
  "payment_methods.manage": "Gerenciar formas de pagamento",
  "financial_transfers.create": "Realizar transferências entre contas",
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
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Indicadores da operação.",
    status: "available",
  },
  {
    key: "comercial",
    label: "Comercial",
    description: "Clientes, pedidos e vendas B2B.",
    status: "coming_soon",
  },
  {
    key: "produtos",
    label: "Produtos",
    description: "Produtos, variantes e SKUs.",
    status: "available",
  },
  {
    key: "estoque",
    label: "Estoque",
    description: "Inventory ledger e posição por local.",
    status: "available",
  },
  {
    key: "producao",
    label: "Produção",
    description: "Matéria-prima e ordens de produção.",
    status: "coming_soon",
  },
  {
    key: "marketplaces",
    label: "Marketplaces",
    description: "Lojas, importações e reconciliação.",
    status: "coming_soon",
  },
  {
    key: "parceiros",
    label: "Parceiros",
    description: "Empresas, remessas, estoque em terceiros e devoluções.",
    status: "available",
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Cobrança, recebimento e resultado.",
    status: "coming_soon",
  },
  {
    key: "relatorios",
    label: "Relatórios",
    description: "Quantidade vendida e valores.",
    status: "coming_soon",
  },
  {
    key: "inteligencia",
    label: "Inteligência",
    description: "Análises e projeções.",
    status: "coming_soon",
  },
  {
    key: "administracao",
    label: "Administração",
    description: "Organização, usuários e permissões.",
    status: "available",
  },
];
