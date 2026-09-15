import { createFileRoute, Navigate } from "@tanstack/react-router";
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePdvAuth } from "@/lib/pdv-auth";
import {
  createOperator,
  resetOperatorPin,
  setOperatorActive,
  deleteOperator,
} from "@/lib/pdv-admin.functions";
import { linkOperatorToStore } from "@/lib/pdv-stores.functions";
import { inviteAdmin } from "@/lib/pdv-admin-account.functions";

export const Route = createFileRoute("/pdv/usuarios")({
  component: UsuariosRoute,
});

function UsuariosRoute() {
  const { user, loading } = usePdvAuth();
  if (loading) return null;
  if (!user || user.role !== "admin") return <Navigate to="/pdv/venda" replace />;
  return <UsuariosPage />;
}

type StoreRow = { id: string; name: string; code: string; active: boolean };
type OperatorRow = {
  id: string;
  user_id: string;
  role: "admin" | "manager" | "cashier" | "stockist";
  display_name: string;
  login_email: string | null;
  active: boolean;
  store_id: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  cashier: "Caixa",
  stockist: "Estoquista",
};

function UsuariosPage() {
  const qc = useQueryClient();
  const [selectedStore, setSelectedStore] = React.useState<string>("");
  const [creatingStore, setCreatingStore] = React.useState(false);

  const stores = useQuery<StoreRow[]>({
    queryKey: ["admin", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, code, active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  React.useEffect(() => {
    if (!selectedStore && stores.data && stores.data.length > 0) {
      setSelectedStore(stores.data[0].id);
    }
  }, [stores.data, selectedStore]);

  const operators = useQuery<OperatorRow[]>({
    enabled: !!selectedStore,
    queryKey: ["admin", "operators", selectedStore],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, display_name, login_email, active, store_id")
        .eq("store_id", selectedStore)
        .order("role")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as OperatorRow[];
    },
  });

  const [invitingAdmin, setInvitingAdmin] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuários e lojas</h1>
          <p className="text-xs text-muted-foreground">
            Gerencie lojas, operadores e administradores do sistema.
          </p>
        </div>
        <button
          onClick={() => setInvitingAdmin(true)}
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
        >
          + Novo administrador
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <StoresPanel
        stores={stores.data ?? []}
        loading={stores.isLoading}
        selected={selectedStore}
        onSelect={setSelectedStore}
        onCreateClick={() => setCreatingStore(true)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["admin", "stores"] })}
      />
      <OperatorsPanel
        storeId={selectedStore}
        storeName={stores.data?.find((s) => s.id === selectedStore)?.name ?? ""}
        rows={operators.data ?? []}
        loading={operators.isLoading}
        stores={stores.data ?? []}
        onChanged={() =>
          qc.invalidateQueries({ queryKey: ["admin", "operators", selectedStore] })
        }
      />

      {creatingStore && (
        <StoreForm
          onCancel={() => setCreatingStore(false)}
          onSaved={() => {
            setCreatingStore(false);
            qc.invalidateQueries({ queryKey: ["admin", "stores"] });
          }}
        />
      )}
      </div>
      {invitingAdmin && (
        <InviteAdminDialog
          onClose={() => setInvitingAdmin(false)}
          onSaved={() => {
            setInvitingAdmin(false);
            qc.invalidateQueries({ queryKey: ["admin", "operators"] });
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Lojas --------------------------------- */
function StoresPanel({
  stores,
  loading,
  selected,
  onSelect,
  onCreateClick,
  onChanged,
}: {
  stores: StoreRow[];
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
  onChanged: () => void;
}) {
  async function toggleActive(store: StoreRow) {
    const { error } = await supabase
      .from("stores")
      .update({ active: !store.active })
      .eq("id", store.id);
    if (error) alert(error.message);
    else onChanged();
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Lojas</h2>
          <p className="text-xs text-muted-foreground">{stores.length} loja(s)</p>
        </div>
        <button
          onClick={onCreateClick}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + Nova loja
        </button>
      </div>
      <div className="divide-y divide-border">
        {loading && <div className="p-4 text-xs text-muted-foreground">Carregando…</div>}
        {stores.map((s) => {
          const isSel = s.id === selected;
          return (
            <div
              key={s.id}
              className={`flex items-center justify-between gap-2 px-4 py-3 text-sm ${
                isSel ? "bg-muted/40" : "hover:bg-muted/30"
              }`}
            >
              <button onClick={() => onSelect(s.id)} className="flex-1 text-left">
                <div className={`font-medium ${!s.active && "text-muted-foreground line-through"}`}>
                  {s.name}
                </div>
                <div className="text-xs text-muted-foreground">código {s.code}</div>
              </button>
              <button
                onClick={() => toggleActive(s)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  s.active
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-slate-500/15 text-slate-600"
                }`}
              >
                {s.active ? "ativa" : "inativa"}
              </button>
            </div>
          );
        })}
        {!loading && stores.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhuma loja cadastrada.
          </div>
        )}
      </div>
    </div>
  );
}

function StoreForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !code.trim()) {
      setErr("Preencha nome e código");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("stores")
      .insert({ name: name.trim(), code: code.trim().toUpperCase() });
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h3 className="text-base font-semibold">Nova loja</h3>
          <p className="text-xs text-muted-foreground">
            Cada loja tem seu próprio estoque, sessões e vendas isoladas.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Código</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex.: MATRIZ, FILIAL-01"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono uppercase"
          />
        </div>
        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-border px-3 py-2 text-xs"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Salvando…" : "Criar"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ Operadores ------------------------------ */
function OperatorsPanel({
  storeId,
  storeName,
  rows,
  loading,
  stores,
  onChanged,
}: {
  storeId: string;
  storeName: string;
  rows: OperatorRow[];
  loading: boolean;
  stores: StoreRow[];
  onChanged: () => void;
}) {
  const [creating, setCreating] = React.useState(false);
  const [linking, setLinking] = React.useState<OperatorRow | null>(null);
  const resetPin = useServerFn(resetOperatorPin);
  const toggleActive = useServerFn(setOperatorActive);
  const del = useServerFn(deleteOperator);
  const link = useServerFn(linkOperatorToStore);

  async function handleReset(op: OperatorRow) {
    const pin = prompt(`Novo PIN para ${op.display_name} (6 a 12 dígitos):`);
    if (!pin) return;
    if (!/^\d{6,12}$/.test(pin)) {
      alert("PIN inválido");
      return;
    }
    try {
      await resetPin({ data: { userId: op.user_id, pin } });
      alert(`PIN de ${op.display_name} alterado com sucesso e registrado na auditoria.`);
    } catch (e) {
      alert(e instanceof Error ? (e.message === "{}" ? "Credenciais inválidas ou erro de permissão (Admin API)" : e.message) : "Falha ao atualizar PIN");
    }
  }

  async function handleToggle(op: OperatorRow) {
    try {
      await toggleActive({ data: { roleRowId: op.id, active: !op.active } });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao alterar");
    }
  }

  async function handleDelete(op: OperatorRow) {
    if (!confirm(`Excluir ${op.display_name}? Todas as sessões e vendas dele continuarão registradas.`)) return;
    try {
      await del({ data: { userId: op.user_id } });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Operadores {storeName && `· ${storeName}`}</h2>
            <p className="text-xs text-muted-foreground">
              Gerentes veem tudo da loja. Caixas veem só as próprias sessões.
            </p>
          </div>
          <button
            disabled={!storeId}
            onClick={() => setCreating(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            + Novo operador
          </button>
        </div>
        <div className="divide-y divide-border">
          {loading && <div className="p-4 text-xs text-muted-foreground">Carregando…</div>}
          {rows.map((op) => (
            <div
              key={op.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm"
            >
              <div>
                <div className={`font-medium ${!op.active && "text-muted-foreground line-through"}`}>
                  {op.display_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {ROLE_LABEL[op.role] ?? op.role} · {op.login_email ?? "sem login"}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  op.active
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-slate-500/15 text-slate-600"
                }`}
              >
                {op.active ? "ativo" : "inativo"}
              </span>
              <button
                onClick={() => handleReset(op)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                novo PIN
              </button>
              <button
                onClick={() => setLinking(op)}
                disabled={op.role === "admin" || stores.length < 2}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                title={
                  op.role === "admin"
                    ? "Admin já tem acesso global"
                    : stores.length < 2
                    ? "Cadastre outra loja para vincular"
                    : "Vincular a outra loja"
                }
              >
                vincular loja
              </button>
              <button
                onClick={() => handleToggle(op)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                {op.active ? "desativar" : "ativar"}
              </button>
              <button
                onClick={() => handleDelete(op)}
                className="rounded-md border border-border px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
              >
                excluir
              </button>
            </div>
          ))}
          {!loading && rows.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum operador cadastrado nesta loja.
            </div>
          )}
        </div>
      </div>

      {creating && storeId && (
        <OperatorForm
          storeId={storeId}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChanged();
          }}
        />
      )}

      {linking && (
        <LinkStoreDialog
          operator={linking}
          stores={stores.filter((s) => s.active && s.id !== storeId)}
          onCancel={() => setLinking(null)}
          onSaved={async () => {
            setLinking(null);
            onChanged();
          }}
          submit={async (payload) => {
            await link({ data: payload });
          }}
        />
      )}
    </div>
  );
}

function LinkStoreDialog({
  operator,
  stores,
  onCancel,
  onSaved,
  submit,
}: {
  operator: OperatorRow;
  stores: StoreRow[];
  onCancel: () => void;
  onSaved: () => void;
  submit: (p: { userId: string; storeId: string; role: "manager" | "cashier" | "stockist" }) => Promise<void>;
}) {
  const [target, setTarget] = React.useState<string>(stores[0]?.id ?? "");
  const [role, setRole] = React.useState<"manager" | "cashier" | "stockist">(
    operator.role === "admin" ? "manager" : (operator.role as any),
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (!target) return;
          setBusy(true);
          try {
            await submit({ userId: operator.user_id, storeId: target, role });
            onSaved();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Falha");
          } finally {
            setBusy(false);
          }
        }}
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 text-sm"
      >
        <div>
          <h3 className="text-base font-semibold">Vincular {operator.display_name} a outra loja</h3>
          <p className="text-xs text-muted-foreground">
            O operador mantém o mesmo login/PIN e passa a acessar as duas lojas.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Loja destino</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {stores.length === 0 && <option value="">Sem lojas disponíveis</option>}
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.code}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Papel na loja destino</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="cashier">Caixa</option>
            <option value="manager">Gerente</option>
            <option value="stockist">Estoquista</option>
          </select>
        </div>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-border px-3 py-2 text-xs"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !target}
            className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Vinculando…" : "Vincular"}
          </button>
        </div>
      </form>
    </div>
  );
}

function OperatorForm({
  storeId,
  onCancel,
  onSaved,
}: {
  storeId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"manager" | "cashier" | "stockist">("cashier");
  const [pin, setPin] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const create = useServerFn(createOperator);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (name.trim().length < 2) {
      setErr("Nome obrigatório");
      return;
    }
    if (!/^\d{6,12}$/.test(pin)) {
      setErr("PIN precisa ter 6 a 12 dígitos");
      return;
    }
    setBusy(true);
    try {
      await create({ data: { storeId, displayName: name.trim(), role, pin } });
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h3 className="text-base font-semibold">Novo operador</h3>
          <p className="text-xs text-muted-foreground">
            O operador entra pela tela de login escolhendo esta loja, seu nome e o PIN.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Marina Silva"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Papel</label>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-md border border-border p-1 text-xs">
            {(["cashier", "stockist", "manager"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded px-3 py-1.5 font-medium ${
                  role === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {r === "cashier" ? "Caixa" : r === "stockist" ? "Estoquista" : "Gerente"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">PIN inicial</label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D+/g, "").slice(0, 12))}
            placeholder="6 a 12 dígitos"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest"
          />
        </div>
        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-border px-3 py-2 text-xs"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Criando…" : "Criar operador"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------------------------- Novo administrador -------------------------- */
function InviteAdminDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const invite = useServerFn(inviteAdmin);
  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Informe um e-mail válido.");
      return;
    }
    if (displayName.trim().length < 2) {
      setErr("Informe um nome (mín. 2 caracteres).");
      return;
    }
    setBusy(true);
    try {
      const r = await invite({
        data: {
          email: email.trim(),
          displayName: displayName.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      setDone(r.email);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao enviar convite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h3 className="text-base font-semibold">Convidar novo administrador</h3>
          <p className="text-xs text-muted-foreground">
            Enviamos um e-mail de convite. O novo admin define a própria senha ao aceitar.
          </p>
        </div>

        {done ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            Convite enviado para <span className="font-medium">{done}</span>. Assim que aceito, o
            acesso administrativo é ativado.
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input
                value={displayName}
                onChange={(ev) => setDisplayName(ev.target.value)}
                autoFocus
                maxLength={80}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </>
        )}

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={done ? onSaved : onClose}
            className="flex-1 rounded-md border border-border px-3 py-2 text-xs"
          >
            {done ? "Fechar" : "Cancelar"}
          </button>
          {!done && (
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Enviando…" : "Enviar convite"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
