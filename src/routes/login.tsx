import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthProvider, usePdvAuth, type LoginStore, type LoginOperator } from "@/lib/pdv-auth";
import { requestAdminPasswordReset } from "@/lib/pdv-admin-account.functions";

export const Route = createFileRoute("/login")({
  component: () => (
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  ),
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Caixa",
};

function LoginPage() {
  const navigate = useNavigate();
  const { user, listStores, listOperators, signInWithPin, signInAdmin } = usePdvAuth();
  const [tab, setTab] = React.useState<"pin" | "admin">("pin");

  const [stores, setStores] = React.useState<LoginStore[]>([]);
  const [storeId, setStoreId] = React.useState<string>("");
  const [operators, setOperators] = React.useState<LoginOperator[]>([]);
  const [operatorEmail, setOperatorEmail] = React.useState<string>("");
  const [pin, setPin] = React.useState("");

  const [adminUser, setAdminUser] = React.useState("admin");
  const [adminPass, setAdminPass] = React.useState("admin");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    if (user) navigate({ to: "/pdv" });
  }, [user, navigate]);

  React.useEffect(() => {
    (async () => {
      try {
        const list = await listStores();
        setStores(list);
        if (list.length > 0) setStoreId(list[0].id);
      } catch (e) {
        console.error("[login] falha ao listar lojas", e);
      } finally {
        setLoadingStores(false);
      }
    })();
  }, [listStores]);

  React.useEffect(() => {
    if (!storeId) {
      setOperators([]);
      setOperatorEmail("");
      return;
    }
    (async () => {
      try {
        const list = await listOperators(storeId);
        setOperators(list);
        setOperatorEmail(list[0]?.login_email ?? "");
      } catch (e) {
        console.error("[login] falha ao listar operadores", e);
      }
    })();
  }, [storeId, listOperators]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (tab === "pin") {
        if (!operatorEmail) {
          setErr("Selecione um operador");
          return;
        }
        if (pin.length < 6) {
          setErr("O PIN precisa ter ao menos 6 dígitos");
          return;
        }
        const r = await signInWithPin(operatorEmail, pin);
        if (!r.ok) {
          setErr(r.error ?? "Falha ao entrar");
          return;
        }
      } else {
        const r = await signInAdmin(adminUser, adminPass);
        if (!r.ok) {
          setErr(r.error || "Falha ao entrar");
          return;
        }
      }
      navigate({ to: "/pdv" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            KS
          </div>
          <span className="text-sm font-semibold tracking-tight">KS MultiMake · PDV</span>
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha como você quer acessar o caixa.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-border p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("pin")}
            className={`rounded-md px-3 py-2 font-medium transition-colors ${
              tab === "pin"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Operador (PIN)
          </button>
          <button
            type="button"
            onClick={() => setTab("admin")}
            className={`rounded-md px-3 py-2 font-medium transition-colors ${
              tab === "admin"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Administrador
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {tab === "pin" ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Loja</label>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  disabled={loadingStores || stores.length === 0}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {loadingStores && <option>Carregando…</option>}
                  {!loadingStores && stores.length === 0 && <option>Nenhuma loja</option>}
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Operador</label>
                <select
                  value={operatorEmail}
                  onChange={(e) => setOperatorEmail(e.target.value)}
                  disabled={operators.length === 0}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {operators.length === 0 && <option value="">Nenhum operador cadastrado nesta loja</option>}
                  {operators.map((o) => (
                    <option key={o.user_id} value={o.login_email}>
                      {o.display_name} · {ROLE_LABEL[o.role] ?? o.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D+/g, "").slice(0, 12))}
                  placeholder="Mín. 6 dígitos"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary tracking-widest"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Se ainda não existem operadores, entre como Administrador e cadastre em <span className="font-medium">👥 Usuários</span>.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Usuário / e-mail</label>
                <input
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  autoComplete="username"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-muted-foreground">Senha</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Conta de administrador.</p>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>
            </>
          )}

          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="error-message">Credenciais inválidas ou erro de conexão</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
      {forgotOpen && <ForgotPasswordDialog onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function ForgotPasswordDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const reset = useServerFn(requestAdminPasswordReset);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim()) {
      setErr("Informe o e-mail do administrador.");
      return;
    }
    setBusy(true);
    try {
      await reset({
        data: {
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      setSent(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao solicitar recuperação.");
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
          <h3 className="text-base font-semibold">Recuperar senha de administrador</h3>
          <p className="text-xs text-muted-foreground">
            Informe o e-mail cadastrado. Se pertencer a um administrador ativo, enviaremos um link
            de redefinição.
          </p>
        </div>

        {sent ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            Se o e-mail existir na base, um link de recuperação foi enviado. Verifique sua caixa de
            entrada (e a pasta de spam).
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-muted-foreground">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoComplete="email"
              autoFocus
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-border px-3 py-2 text-xs"
          >
            {sent ? "Fechar" : "Cancelar"}
          </button>
          {!sent && (
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Enviando…" : "Enviar link"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
