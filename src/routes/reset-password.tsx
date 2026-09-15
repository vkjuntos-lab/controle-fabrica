import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Redefinir senha · KS MultiMake" },
      { name: "description", content: "Defina uma nova senha para sua conta administradora." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    // Supabase envia o token no hash (#access_token=...&type=recovery)
    // O client SDK detecta e emite PASSWORD_RECOVERY em onAuthStateChange.
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        done = true;
        setStatus("ready");
      }
    });
    // Verifica se já há sessão de recovery
    supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const isRecovery = hash.includes("type=recovery") || hash.includes("access_token");
      if (data.session && isRecovery) setStatus("ready");
      else if (data.session) setStatus("ready");
      else setStatus("invalid");
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErr("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setStatus("done");
    // Desloga para forçar novo login com a senha nova
    await supabase.auth.signOut();
    setTimeout(() => navigate({ to: "/login" }), 2000);
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

        <h1 className="text-2xl font-semibold tracking-tight">Redefinir senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha uma nova senha forte para sua conta administradora.
        </p>

        {status === "checking" && (
          <div className="mt-6 text-sm text-muted-foreground">Verificando link…</div>
        )}

        {status === "invalid" && (
          <div className="mt-6 space-y-3">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Link inválido ou expirado. Solicite um novo e-mail de recuperação.
            </div>
            <Link
              to="/login"
              className="block w-full rounded-md border border-border px-4 py-2 text-center text-sm"
            >
              Voltar ao login
            </Link>
          </div>
        )}

        {status === "done" && (
          <div className="mt-6 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            Senha atualizada. Redirecionando para o login…
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nova senha</label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirmar senha</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
