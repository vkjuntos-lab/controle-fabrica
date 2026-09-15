import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { resolvePaymentLink, ensurePublicPreference } from "@/lib/pdv-payment-links.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import * as React from "react";

export const Route = createFileRoute("/pay/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pagamento — KS MultiMake" },
      { name: "description", content: "Realize seu pagamento com segurança." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayPage,
});

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

function PayPage() {
  const { code } = useParams({ from: "/pay/$code" });
  const resolve = useServerFn(resolvePaymentLink);
  const ensure = useServerFn(ensurePublicPreference);

  const q = useQuery({
    queryKey: ["public-payment-link", code],
    queryFn: () => resolve({ data: { code } }),
    refetchInterval: 5000,
  });

  const m = useMutation({
    mutationFn: () => ensure({ data: { code } }),
    onSuccess: (r) => {
      if (r?.initPoint) window.location.href = r.initPoint;
    },
  });

  if (q.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Link inválido</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Este link de pagamento não foi encontrado ou já não está mais disponível.
          </CardContent>
        </Card>
      </div>
    );
  }

  const l = q.data;
  const expired = l.status === "expired" || (l.expires_at && new Date(l.expires_at) < new Date());
  const canceled = l.status === "canceled";
  const paid = l.status === "paid";

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-primary/5 via-background to-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground font-bold" aria-hidden="true">
            KS
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Pagamento seguro — {l.store_name}
          </h1>
          <CardTitle className="text-sm font-normal text-muted-foreground">
            Cobrança #{l.code.toUpperCase()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="text-xs uppercase text-muted-foreground">Total a pagar</div>
            <div className="mt-1 text-4xl font-bold tracking-tight">{brl(Number(l.amount))}</div>
            <div className="mt-1 text-sm text-muted-foreground">{l.description}</div>
            {l.customer_name && (
              <div className="mt-2 text-xs text-muted-foreground">Cliente: {l.customer_name}</div>
            )}
          </div>

          {paid && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
              <div className="font-medium">Pagamento confirmado!</div>
              <div className="text-xs text-muted-foreground">Você já pode fechar esta janela.</div>
            </div>
          )}

          {canceled && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-center">
              <XCircle className="mx-auto mb-2 h-8 w-8 text-rose-600" />
              <div className="font-medium">Cobrança cancelada</div>
              <div className="text-xs text-muted-foreground">Entre em contato com a loja.</div>
            </div>
          )}

          {expired && !paid && !canceled && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-center">
              <Clock className="mx-auto mb-2 h-8 w-8 text-amber-600" />
              <div className="font-medium">Link expirado</div>
              <div className="text-xs text-muted-foreground">Solicite um novo link à loja.</div>
            </div>
          )}

          {!paid && !canceled && !expired && (
            <>
              <div className="flex flex-wrap justify-center gap-1">
                {(l.methods ?? []).includes("pix") && <Badge variant="secondary">PIX</Badge>}
                {(l.methods ?? []).includes("credit") && (
                  <Badge variant="secondary">Cartão de crédito {l.max_installments > 1 ? `até ${l.max_installments}x` : ""}</Badge>
                )}
                {(l.methods ?? []).includes("debit") && <Badge variant="secondary">Cartão de débito</Badge>}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => (l.mp_init_point ? (window.location.href = l.mp_init_point) : m.mutate())}
                disabled={m.isPending}
              >
                {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Pagar agora
              </Button>

              <p className="text-center text-[10px] text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3 w-3" />
                Processado com segurança por {
                  l.provider === "asaas" ? "Asaas"
                  : l.provider === "pagbank" ? "PagBank"
                  : l.provider === "pagarme" ? "Pagar.me"
                  : "Mercado Pago"
                }
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
