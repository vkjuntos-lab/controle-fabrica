import * as React from "react";
import { usePdv, brl } from "@/lib/pdv-store";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  findCustomerByCpf,
  upsertCustomer,
  fetchCustomerHistory,
  toStoreCustomer,
  formatCpf,
  formatPhoneBR,
  isValidCpf,
  onlyDigits,
  type CustomerHistoryItem,
} from "@/lib/pdv-customers";

type Mode = "search" | "register" | "linked";

export function CustomerPanel() {
  const { state, dispatch } = usePdv();
  const { currentStoreId } = useCurrentStore();
  const customer = state.customer;
  const [mode, setMode] = React.useState<Mode>(customer?.id ? "linked" : "search");
  const [cpfInput, setCpfInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [regName, setRegName] = React.useState("");
  const [regPhone, setRegPhone] = React.useState("");
  const [history, setHistory] = React.useState<CustomerHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    setMode(customer?.id ? "linked" : "search");
  }, [customer?.id]);

  // Carrega histórico quando o cliente vinculado muda
  React.useEffect(() => {
    if (!customer?.id) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    fetchCustomerHistory(customer.id)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((e) => {
        console.error("[pdv] falha ao carregar histórico", e);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer?.id, state.sales.length]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    const digits = onlyDigits(cpfInput);
    if (!isValidCpf(digits)) {
      setError("CPF inválido.");
      return;
    }
    setBusy(true);
    try {
      const found = await findCustomerByCpf(digits, currentStoreId);
      if (found) {
        dispatch({ type: "SET_CUSTOMER", customer: toStoreCustomer(found) });
        setCpfInput("");
      } else {
        setMode("register");
        setRegName("");
        setRegPhone("");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao buscar cliente.");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!regName.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (!currentStoreId) {
      setError("Selecione uma loja para cadastrar o cliente.");
      return;
    }
    setBusy(true);
    try {
      const row = await upsertCustomer({
        cpf: cpfInput,
        name: regName,
        phone: regPhone || null,
        storeId: currentStoreId,
      });
      dispatch({ type: "SET_CUSTOMER", customer: toStoreCustomer(row) });
      setCpfInput("");
    } catch (err) {
      console.error(err);
      setError("Erro ao cadastrar cliente.");
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneChange = async (phone: string) => {
    if (!customer) return;
    const next = { ...customer, phone };
    dispatch({ type: "SET_CUSTOMER", customer: next });
    if (!customer.id || !currentStoreId) return;
    try {
      await upsertCustomer({
        id: customer.id,
        cpf: onlyDigits(customer.cpfMasked.replace(/\*/g, "")) || "",
        name: customer.name,
        phone,
        tier: customer.tier,
        cashback: customer.cashback,
        storeId: currentStoreId,
      }).catch(() => {
        // Se o CPF mascarado impediu upsert, cai só no update de telefone
      });
    } catch {
      /* ignore */
    }
  };

  const handleUnlink = () => {
    dispatch({ type: "SET_CUSTOMER", customer: null });
    setMode("search");
    setCpfInput("");
  };

  if (mode === "search" || !customer) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</div>
            <div className="text-sm font-medium">Identifique pelo CPF</div>
          </div>
          <button
            type="button"
            onClick={handleUnlink}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Venda sem cliente
          </button>
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            value={cpfInput}
            onChange={(e) => setCpfInput(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        {mode === "register" && (
          <form onSubmit={handleRegister} className="mt-4 space-y-2 border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              CPF <span className="font-mono">{formatCpf(cpfInput)}</span> não encontrado. Cadastrar novo cliente:
            </div>
            <input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="Nome completo"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              maxLength={120}
            />
            <input
              value={regPhone}
              onChange={(e) => setRegPhone(formatPhoneBR(e.target.value))}
              placeholder="WhatsApp (11) 91234-5678"
              inputMode="tel"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Salvando…" : "Cadastrar e vincular"}
              </button>
              <button
                type="button"
                onClick={() => setMode("search")}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  const waDigits = onlyDigits(customer.phone ?? "");
  const waHref = waDigits
    ? `https://wa.me/${waDigits.length <= 11 ? "55" + waDigits : waDigits}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</div>
          <div className="mt-1 truncate text-base font-semibold">{customer.name}</div>
          <div className="text-xs text-muted-foreground">
            CPF {customer.cpfMasked} · Nível {customer.tier}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            Cashback {brl(customer.cashback)}
          </span>
          <button
            type="button"
            onClick={handleUnlink}
            className="text-[11px] text-muted-foreground hover:text-destructive"
          >
            Trocar cliente
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-1">
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          WhatsApp do cliente
        </label>
        <div className="flex items-center gap-2">
          <input
            type="tel"
            inputMode="tel"
            value={formatPhoneBR(customer.phone ?? "")}
            onChange={(e) => handlePhoneChange(formatPhoneBR(e.target.value))}
            placeholder="(11) 91234-5678"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
            >
              Abrir WhatsApp
            </a>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ao confirmar a venda, abrimos o WhatsApp com uma mensagem pronta e o PDF baixa para
          anexar no chat.
        </p>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Histórico de compras
          </div>
          {historyLoading && <span className="text-[11px] text-muted-foreground">carregando…</span>}
        </div>
        {history.length === 0 && !historyLoading ? (
          <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
            Sem compras registradas ainda.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-medium text-foreground">{h.code}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("pt-BR")} · {h.itemsCount}{" "}
                    {h.itemsCount === 1 ? "item" : "itens"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums text-foreground">{brl(h.total)}</div>
                  {h.cashbackUsed > 0 && (
                    <div className="text-[11px] text-primary">
                      -{brl(h.cashbackUsed)} cashback
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
