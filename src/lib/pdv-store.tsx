import * as React from "react";

/* ============================================================
 * Tipos
 * ============================================================ */
export type Lot = {
  id: string;
  code?: string; // código do lote (ex.: L2503) — opcional para compat.
  validity: string; // MM/YYYY
  qty: number;
};

export type Product = {
  sku: string;
  ean?: string;
  name: string;
  unit: number;
  lots: Lot[];
};

export type SaleLine = {
  lineId: string;
  sku: string;
  name: string;
  lotId: string;
  validity: string;
  qty: number;
  unit: number;
};

export type PaymentMethod =
  | "pix"
  | "credit"
  | "debit"
  | "cash"
  | "cashback"
  | "gift_card"
  | "store_credit"
  | "credit_sale"
  | "boleto"
  | "payment_link";

export type PaymentMeta = {
  giftCardCode?: string;
  giftCardId?: string;
  installments?: number;
  firstDueDate?: string;
  boletoId?: string;
  linkCode?: string;
  linkUrl?: string;
  dueDate?: string;
};

export type Payment = {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: "pending" | "paid";
  ref?: string;
  meta?: PaymentMeta;
};

export type Customer = {
  id?: string;
  name: string;
  cpfMasked: string;
  tier: string;
  cashback: number;
  phone?: string;
};


export type Sale = {
  id: string;
  createdAt: string;
  lines: SaleLine[];
  payments: Payment[];
  cashbackUsed: number;
  total: number;
  customer?: Customer;
};

export type Session = {
  id: string;
  openedAt: string;
  operator: string;
  opening: number;
  closedAt?: string;
  closingCounted?: Record<PaymentMethod, number>;
};

/* ============================================================
 * Catálogo inicial (com lotes p/ FEFO)
 * ============================================================ */
const initialCatalog: Product[] = [
  {
    sku: "MLB-042-05",
    ean: "7891000000015",
    name: "Base Líquida Matte 30ml · Cor 05",
    unit: 89.9,
    lots: [
      { id: "L2503", validity: "03/2027", qty: 4 },
      { id: "L2508", validity: "08/2027", qty: 10 },
    ],
  },
  {
    sku: "BAT-LIQ-12",
    ean: "7891000000022",
    name: "Batom Líquido Long-Wear · Rouge",
    unit: 49.9,
    lots: [
      { id: "L2601", validity: "11/2027", qty: 20 },
    ],
  },
  {
    sku: "PRIMER-01",
    ean: "7891000000039",
    name: "Primer Hidratante 25ml",
    unit: 74.0,
    lots: [
      { id: "L2503", validity: "03/2027", qty: 6 },
      { id: "L2511", validity: "11/2027", qty: 12 },
    ],
  },
  {
    sku: "FIX-100",
    ean: "7891000000046",
    name: "Fixador de Maquiagem 100ml",
    unit: 59.9,
    lots: [{ id: "L2602", validity: "02/2028", qty: 15 }],
  },
];




/* ============================================================
 * Estado + reducer
 * ============================================================ */
type State = {
  catalog: Product[];
  session: Session | null;
  customer: Customer | null;
  cart: {
    lines: SaleLine[];
    payments: Payment[];
    cashbackUsed: number;
  };
  sales: Sale[];
};

type Action =
  | { type: "OPEN_SESSION"; operator: string; opening: number }
  | { type: "SET_SESSION"; session: Session | null }
  | { type: "CLOSE_SESSION"; counted: Record<PaymentMethod, number> }
  | { type: "SET_CUSTOMER"; customer: Customer | null }
  | { type: "ADD_ITEM"; skuOrEan: string; qty: number }
  | { type: "REMOVE_LINE"; lineId: string }
  | { type: "APPLY_CASHBACK"; amount: number }
  | { type: "ADD_PAYMENT"; payment: Omit<Payment, "id"> }
  | { type: "REMOVE_PAYMENT"; id: string }
  | { type: "MARK_PAYMENT_PAID"; id: string }
  | { type: "FINALIZE_SALE" }
  | { type: "RESET_CART" }
  | { type: "SET_CATALOG"; catalog: Product[] }
  | { type: "HYDRATE"; state: State };


const STORAGE_KEY = "ks-pdv-state-v1";

function initState(): State {
  return {
    catalog: initialCatalog,
    session: null,
    customer: null,
    cart: { lines: [], payments: [], cashbackUsed: 0 },
    sales: [],
  };
}


function parseValidity(mmYYYY: string) {
  const [m, y] = mmYYYY.split("/").map(Number);
  return y * 100 + m;
}

/** Quantidade já reservada no carrinho para um SKU+lote específico. */
function reservedInCart(lines: SaleLine[], sku: string, lotId: string) {
  return lines
    .filter((l) => l.sku === sku && l.lotId === lotId)
    .reduce((s, l) => s + l.qty, 0);
}

/**
 * Escolhe o próximo lote seguindo FEFO, descontando o que já está
 * reservado no carrinho. Retorna null quando não há saldo suficiente.
 */
function fefoPick(
  product: Product,
  qty: number,
  cartLines: SaleLine[],
): { lotId: string; validity: string } | null {
  const sorted = [...product.lots].sort(
    (a, b) => parseValidity(a.validity) - parseValidity(b.validity),
  );
  for (const lot of sorted) {
    const free = lot.qty - reservedInCart(cartLines, product.sku, lot.id);
    if (free >= qty) return { lotId: lot.id, validity: lot.validity };
  }
  return null;
}

/**
 * Ajusta o carrinho ao catálogo atual: reduz a qty de cada linha ao
 * saldo real do seu lote e remove linhas cujo lote ficou sem estoque
 * ou deixou de existir. Executada após toda ação do reducer.
 */
function reconcileCart(state: State): State {
  const nextLines: SaleLine[] = [];
  let changed = false;
  for (const line of state.cart.lines) {
    const product = state.catalog.find((p) => p.sku === line.sku);
    const lot = product?.lots.find((l) => l.id === line.lotId);
    if (!product || !lot || lot.qty <= 0) {
      changed = true;
      continue; // remove linha sem lote/saldo
    }
    if (line.qty > lot.qty) {
      changed = true;
      nextLines.push({ ...line, qty: lot.qty });
    } else {
      nextLines.push(line);
    }
  }
  if (!changed) return state;
  return { ...state, cart: { ...state.cart, lines: nextLines } };
}

function reducer(state: State, action: Action): State {
  return reconcileCart(reduce(state, action));
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "SET_CATALOG":
      return { ...state, catalog: action.catalog };


    case "OPEN_SESSION":
      if (state.session && !state.session.closedAt) return state;
      return {
        ...state,
        session: {
          id: "S" + Date.now().toString().slice(-6),
          openedAt: new Date().toISOString(),
          operator: action.operator,
          opening: action.opening,
        },
        sales: [],
      };

    case "SET_SESSION":
      return {
        ...state,
        session: action.session,
        sales: action.session && (!state.session || state.session.id !== action.session.id)
          ? []
          : state.sales,
      };

    case "CLOSE_SESSION":
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          closedAt: new Date().toISOString(),
          closingCounted: action.counted,
        },
      };


    case "SET_CUSTOMER":
      return { ...state, customer: action.customer };

    case "ADD_ITEM": {
      const q = action.skuOrEan.trim().toLowerCase();
      const p = state.catalog.find(
        (c) => c.sku.toLowerCase() === q || c.ean?.toLowerCase() === q,
      );
      if (!p) return state;
      const pick = fefoPick(p, action.qty, state.cart.lines);
      if (!pick) return state;

      // Merge se já existir linha do mesmo sku+lote
      const existing = state.cart.lines.find(
        (l) => l.sku === p.sku && l.lotId === pick.lotId,
      );
      let lines: SaleLine[];
      if (existing) {
        lines = state.cart.lines.map((l) =>
          l.lineId === existing.lineId ? { ...l, qty: l.qty + action.qty } : l,
        );
      } else {
        lines = [
          ...state.cart.lines,
          {
            lineId: "LN" + Date.now() + Math.random().toString(36).slice(2, 6),
            sku: p.sku,
            name: p.name,
            lotId: pick.lotId,
            validity: pick.validity,
            qty: action.qty,
            unit: p.unit,
          },
        ];
      }
      return { ...state, cart: { ...state.cart, lines } };
    }

    case "REMOVE_LINE":
      return {
        ...state,
        cart: {
          ...state.cart,
          lines: state.cart.lines.filter((l) => l.lineId !== action.lineId),
        },
      };

    case "APPLY_CASHBACK": {
      const max = state.customer?.cashback ?? 0;
      const amount = Math.max(0, Math.min(action.amount, max));
      return { ...state, cart: { ...state.cart, cashbackUsed: amount } };
    }

    case "ADD_PAYMENT":
      return {
        ...state,
        cart: {
          ...state.cart,
          payments: [
            ...state.cart.payments,
            { ...action.payment, id: "P" + Date.now() + Math.random().toString(36).slice(2, 5) },
          ],
        },
      };

    case "REMOVE_PAYMENT":
      return {
        ...state,
        cart: {
          ...state.cart,
          payments: state.cart.payments.filter((p) => p.id !== action.id),
        },
      };

    case "MARK_PAYMENT_PAID":
      return {
        ...state,
        cart: {
          ...state.cart,
          payments: state.cart.payments.map((p) =>
            p.id === action.id ? { ...p, status: "paid" } : p,
          ),
        },
      };

    case "FINALIZE_SALE": {
      if (!state.session || state.session.closedAt) return state;
      const subtotal = state.cart.lines.reduce((s, l) => s + l.qty * l.unit, 0);
      const total = Math.max(0, subtotal - state.cart.cashbackUsed);
      const paid = state.cart.payments
        .filter((p) => p.status === "paid")
        .reduce((s, p) => s + p.amount, 0);
      if (state.cart.lines.length === 0) return state;
      if (paid + 0.001 < total) return state;

      // Baixa estoque por lote
      const catalog = state.catalog.map((p) => {
        const affected = state.cart.lines.filter((l) => l.sku === p.sku);
        if (!affected.length) return p;
        const lots = p.lots.map((lot) => {
          const dec = affected
            .filter((l) => l.lotId === lot.id)
            .reduce((s, l) => s + l.qty, 0);
          return dec ? { ...lot, qty: Math.max(0, lot.qty - dec) } : lot;
        });
        return { ...p, lots };
      });

      const sale: Sale = {
        id: "V" + Date.now().toString().slice(-6),
        createdAt: new Date().toISOString(),
        lines: state.cart.lines,
        payments: state.cart.payments,
        cashbackUsed: state.cart.cashbackUsed,
        total,
        customer: state.customer ?? undefined,
      };

      const customer = state.customer
        ? {
            ...state.customer,
            cashback:
              state.customer.cashback - state.cart.cashbackUsed + Math.round(total * 0.02 * 100) / 100,
          }
        : null;

      return {
        ...state,
        catalog,
        customer,
        sales: [...state.sales, sale],
        cart: { lines: [], payments: [], cashbackUsed: 0 },
      };
    }

    case "RESET_CART":
      return { ...state, cart: { lines: [], payments: [], cashbackUsed: 0 } };

    default:
      return state;
  }
}

/* ============================================================
 * Selectors
 * ============================================================ */
export function selectTotals(state: State) {
  const subtotal = state.cart.lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const cashback = state.cart.cashbackUsed;
  const total = Math.max(0, subtotal - cashback);
  const paid = state.cart.payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const pending = state.cart.payments
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid - pending);
  return { subtotal, cashback, total, paid, pending, remaining };
}

/**
 * Saldo disponível de um SKU considerando o que já foi reservado
 * no carrinho, além do próximo lote FEFO com saldo livre.
 */
export function selectSkuAvailability(state: State, sku: string) {
  const product = state.catalog.find((p) => p.sku === sku);
  if (!product) return { total: 0, free: 0, nextLot: null as Lot | null };
  const total = product.lots.reduce((s, l) => s + l.qty, 0);
  const reserved = state.cart.lines
    .filter((l) => l.sku === sku)
    .reduce((s, l) => s + l.qty, 0);
  const sorted = [...product.lots].sort(
    (a, b) => parseValidity(a.validity) - parseValidity(b.validity),
  );
  const nextLot =
    sorted.find(
      (l) => l.qty - reservedInCart(state.cart.lines, sku, l.id) > 0,
    ) ?? null;
  return { total, free: Math.max(0, total - reserved), nextLot };
}

export const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  "pix", "credit", "debit", "cash", "cashback",
  "gift_card", "store_credit", "credit_sale", "boleto", "payment_link",
];

export function emptyMethodRecord<T>(fill: T): Record<PaymentMethod, T> {
  return Object.fromEntries(ALL_PAYMENT_METHODS.map((m) => [m, fill])) as Record<PaymentMethod, T>;
}

export function selectSessionSummary(state: State) {
  const totals: Record<PaymentMethod, number> = emptyMethodRecord(0);
  let revenue = 0;
  let count = 0;
  for (const sale of state.sales) {
    revenue += sale.total;
    count += 1;
    for (const p of sale.payments) {
      if (p.status === "paid") totals[p.method] += p.amount;
    }
  }
  return { totals, revenue, count, ticket: count ? revenue / count : 0 };
}

/* ============================================================
 * Context
 * ============================================================ */
export type PdvIdentity = {
  userId: string | null;
  storeId: string | null;
  operatorName: string;
};

type Ctx = {
  state: State;
  dispatch: React.Dispatch<Action>;
  refreshCatalog: () => Promise<void>;
  catalogLoading: boolean;
  hydrateOpenSession: () => Promise<void>;
  openSessionRemote: (input: { opening: number }) => Promise<void>;
  closeSessionRemote: (counted: Record<PaymentMethod, number>) => Promise<void>;
};

const PdvContext = React.createContext<Ctx | null>(null);

export function PdvProvider({
  identity,
  children,
}: {
  identity: PdvIdentity;
  children: React.ReactNode;
}) {
  const [state, dispatch] = React.useReducer(reducer, undefined, initState);
  const hydrated = React.useRef(false);
  const [catalogLoading, setCatalogLoading] = React.useState(true);
  const lastSalesLen = React.useRef(0);

  // Mantém identidade atual acessível dentro dos efeitos assíncronos
  const identityRef = React.useRef(identity);
  React.useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const refreshCatalog = React.useCallback(async () => {
    const { fetchCatalog } = await import("./pdv-catalog");
    setCatalogLoading(true);
    try {
      const catalog = await fetchCatalog();
      dispatch({ type: "SET_CATALOG", catalog });
      // Persist para cache offline (best-effort)
      try {
        const { cacheCatalog } = await import("./pdv-offline-queue");
        await cacheCatalog(catalog);
      } catch { /* ignore */ }
      // Hidrata top-500 clientes para lookup offline por CPF (best-effort)
      try {
        const { hydrateTopCustomers } = await import("./pdv-customers");
        void hydrateTopCustomers(500);
      } catch { /* ignore */ }
    } catch (e) {
      // Fallback offline: tenta hidratar do IndexedDB
      try {
        const { getCachedCatalog } = await import("./pdv-offline-queue");
        const cached = await getCachedCatalog();
        if (cached.length > 0) {
          dispatch({ type: "SET_CATALOG", catalog: cached as Product[] });
          console.warn("[pdv] catálogo carregado do cache offline", cached.length);
        } else {
          throw e;
        }
      } catch {
        console.error("[pdv] falha ao carregar catálogo (online e cache)", e);
      }
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const hydrateOpenSession = React.useCallback(async () => {
    const id = identityRef.current;
    if (!id.userId) return;
    try {
      const { fetchOpenSessionForUser, toStoreSession } = await import("./pdv-sessions");
      const row = await fetchOpenSessionForUser(id.userId);
      if (row) {
        dispatch({ type: "SET_SESSION", session: toStoreSession(row) });
      }
    } catch (e) {
      console.error("[pdv] falha ao hidratar sessão de caixa", e);
    }
  }, []);

  const openSessionRemote = React.useCallback(
    async (input: { opening: number }) => {
      const id = identityRef.current;
      if (!id.userId || !id.storeId) {
        throw new Error("Sem loja/usuário para abrir sessão");
      }
      try {
        const { openSession, toStoreSession } = await import("./pdv-sessions");
        const row = await openSession({
          storeId: id.storeId,
          operatorUserId: id.userId,
          operatorName: id.operatorName,
          opening: input.opening,
        });
        dispatch({ type: "SET_SESSION", session: toStoreSession(row) });
      } catch (e) {
        console.error("[pdv] falha ao abrir sessão de caixa", e);
        throw e;
      }
    },
    [],
  );

  const closeSessionRemote = React.useCallback(
    async (counted: Record<PaymentMethod, number>) => {
      const id = state.session?.id;
      if (!id) return;
      try {
        const { closeSession } = await import("./pdv-sessions");
        await closeSession({ id, counted });
        dispatch({ type: "CLOSE_SESSION", counted });
      } catch (e) {
        console.error("[pdv] falha ao fechar sessão de caixa", e);
        throw e;
      }
    },
    [state.session?.id],
  );

  React.useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        dispatch({ type: "HYDRATE", state: parsed });
        lastSalesLen.current = parsed.sales?.length ?? 0;
      }
    } catch {
      /* ignore */
    }
    hydrated.current = true;
    void refreshCatalog();
  }, [refreshCatalog]);

  React.useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  React.useEffect(() => {
    if (!hydrated.current) return;
    if (state.sales.length <= lastSalesLen.current) {
      lastSalesLen.current = state.sales.length;
      return;
    }
    const lastSale = state.sales[state.sales.length - 1];
    lastSalesLen.current = state.sales.length;
    const sessionId = state.session?.id ?? null;
    const id = identityRef.current;
    if (!id.storeId) {
      console.warn("[pdv] venda finalizada sem loja definida — pulando persistência");
      return;
    }
    const operator = state.session?.operator ?? id.operatorName;
    (async () => {
      try {
        const { recordSaleMovements } = await import("./pdv-catalog");
        await recordSaleMovements(lastSale.lines, {
          storeId: id.storeId as string,
          operatorUserId: id.userId,
          operatorName: operator,
        });
      } catch (e) {
        console.error("[pdv] falha ao registrar baixa de estoque no backend", e);
      }
      try {
        const { recordSale, updateCustomerCashback } = await import("./pdv-customers");
        const customerId = lastSale.customer?.id ?? null;
        await recordSale({
          sale: lastSale,
          customerId,
          operator,
          operatorUserId: id.userId,
          sessionId,
          storeId: id.storeId as string,
        });
        if (customerId && lastSale.customer) {
          await updateCustomerCashback(customerId, lastSale.customer.cashback);
        }
      } catch (e) {
        console.error("[pdv] falha ao persistir venda/cliente", e);
      }
      try {
        await refreshCatalog();
      } catch {
        /* ignore */
      }
    })();
  }, [state.sales, state.session?.id, state.session?.operator, refreshCatalog]);

  const value = React.useMemo(
    () => ({
      state,
      dispatch,
      refreshCatalog,
      catalogLoading,
      hydrateOpenSession,
      openSessionRemote,
      closeSessionRemote,
    }),
    [state, refreshCatalog, catalogLoading, hydrateOpenSession, openSessionRemote, closeSessionRemote],
  );
  return <PdvContext.Provider value={value}>{children}</PdvContext.Provider>;
}

export function usePdv() {
  const ctx = React.useContext(PdvContext);
  if (!ctx) throw new Error("usePdv must be used inside <PdvProvider>");
  return ctx;
}


export const paymentLabels: Record<PaymentMethod, string> = {
  pix: "PIX (Mercado Pago)",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  cash: "Dinheiro",
  cashback: "Cashback",
  gift_card: "Vale-presente",
  store_credit: "Crédito da Loja",
  credit_sale: "Fiado (Crediário)",
  boleto: "Boleto Bancário",
  payment_link: "Link de Pagamento",
};

export const paymentIcons: Record<PaymentMethod, string> = {
  pix: "📱", credit: "💳", debit: "💳", cash: "💵", cashback: "🎁",
  gift_card: "🎫", store_credit: "🏦", credit_sale: "📒", boleto: "🧾", payment_link: "🔗",
};

export function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
