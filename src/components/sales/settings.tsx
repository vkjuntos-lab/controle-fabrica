import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganization } from "@/lib/org/org-context";
import { SETTING_FLAGS, SETTING_OPTIONS, settingLabel } from "@/lib/sales/constants";
import { numeric, text, truthy, useSalesRead, useSalesWrite } from "@/components/sales/shared";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import type { Json } from "@/integrations/supabase/types";

/**
 * Políticas operacionais de vendas.
 *
 * São as doze colunas que `sales_order_settings` guarda e que
 * `sales_settings_save` valida. Cada política é escrita pelo servidor: um valor
 * fora da lista é recusado, e a tela só oferece valores aceitos.
 */
export function SalesSettings({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useOrganization();
  const [open, setOpen] = useState(false);
  const query = useSalesRead(organizationId, "settings");
  const [values, setValues] = useState<Record<string, string>>({});

  const write = useSalesWrite(organizationId, {
    onSuccess: () => {
      toast.success("Políticas atualizadas");
      setOpen(false);
      setValues({});
    },
  });

  if (!hasPermission("sales.configure")) return null;
  if (query.isPending) return <LoadingState label="Carregando políticas" />;
  if (query.error) {
    return <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />;
  }

  const data = (query.data ?? {}) as Record<string, Json>;

  const submit = () => {
    const payload: Record<string, Json> = {};
    for (const [key, value] of Object.entries(values)) {
      payload[key] =
        key.endsWith("_hours") || key === "max_discount_percent" ? Number(value) : value;
    }
    write.mutate({ operation: "settings", values: payload });
  };

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Políticas de vendas</h1>
        <p className="text-sm text-muted-foreground">
          Reserva não movimenta estoque. A obrigação financeira segue o gatilho configurado e nunca
          nasce de uma reserva. Pedido aprovado não é venda recebida.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(SETTING_OPTIONS).map(([key, option]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base">{option.label}</CardTitle>
              <CardDescription>{option.hint}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{settingLabel(key, data[key])}</p>
            </CardContent>
          </Card>
        ))}
        {Object.entries(SETTING_FLAGS).map(([key, option]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base">{option.label}</CardTitle>
              <CardDescription>{option.hint}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{truthy(data[key]) ? "Sim" : "Não"}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validade da reserva</CardTitle>
            <CardDescription>
              Horas em que uma reserva prende disponibilidade antes de expirar sozinha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{numeric(data.reservation_expiry_hours)} horas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desconto máximo</CardTitle>
            <CardDescription>
              Em branco, vale a alçada de desconto do CRM. Nunca é o preço do item: o desconto é
              aplicado sobre a tabela oficial.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {text(data.max_discount_percent) === "" || data.max_discount_percent === null
                ? "Alçada do CRM"
                : `${numeric(data.max_discount_percent)}%`}
            </p>
          </CardContent>
        </Card>
      </div>
      <Button onClick={() => setOpen(true)}>Alterar políticas</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alterar políticas</DialogTitle>
            <DialogDescription>
              Deixe em branco o que não quiser mudar. O servidor valida cada valor antes de gravar.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {Object.entries(SETTING_OPTIONS).map(([key, option]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`policy-${key}`}>{option.label}</Label>
                <select
                  id={`policy-${key}`}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={values[key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [key]: event.target.value }))
                  }
                >
                  <option value="">Manter ({settingLabel(key, data[key])})</option>
                  {option.options.map((option_) => (
                    <option key={option_} value={option_}>
                      {(option.labels as Record<string, string>)[option_] ?? option_}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{option.hint}</p>
              </div>
            ))}
            {Object.entries(SETTING_FLAGS).map(([key, option]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`flag-${key}`}>{option.label}</Label>
                <select
                  id={`flag-${key}`}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={values[key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [key]: event.target.value }))
                  }
                >
                  <option value="">Manter ({truthy(data[key]) ? "Sim" : "Não"})</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
                <p className="text-xs text-muted-foreground">{option.hint}</p>
              </div>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="policy-expiry">Validade da reserva (horas)</Label>
                <Input
                  id="policy-expiry"
                  type="number"
                  min="1"
                  max="8760"
                  placeholder={`Manter (${numeric(data.reservation_expiry_hours)})`}
                  value={values.reservation_expiry_hours ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      reservation_expiry_hours: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="policy-discount">Desconto máximo (%)</Label>
                <Input
                  id="policy-discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Em branco usa a alçada do CRM"
                  value={values.max_discount_percent ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      max_discount_percent: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {write.error ? (
              <p role="alert" className="text-sm text-destructive">
                {write.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={write.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={write.isPending || Object.keys(values).length === 0}>
                {write.isPending ? "Gravando…" : "Gravar políticas"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Estados padrão reaproveitados quando a área ainda não tem nada a exibir. */
export function SalesEmpty({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}
