import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Estado de carregamento padrão da aplicação. */
export function LoadingState({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Estado vazio: nada foi cadastrado/movimentado ainda. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Estado de erro com possibilidade de nova tentativa. */
export function ErrorState({
  title = "Não foi possível carregar",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {description ?? "Tente novamente em alguns instantes."}
      </p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

/** Acesso negado: o papel do usuário não possui a permissão exigida. */
export function PermissionDenied({ permission }: { permission?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-foreground">Acesso não autorizado</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Seu papel nesta organização não permite acessar este conteúdo.
        {permission ? ` Permissão necessária: ${permission}.` : ""}
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/dashboard">Voltar ao dashboard</Link>
      </Button>
    </div>
  );
}

/** Módulo previsto, ainda não implementado. Nunca simula funcionalidade. */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <EmptyState
      title={`${title} — ainda não implementado`}
      description={
        description ??
        "Este módulo faz parte do roadmap e será liberado em uma próxima etapa. Nada aqui é simulado."
      }
    />
  );
}
