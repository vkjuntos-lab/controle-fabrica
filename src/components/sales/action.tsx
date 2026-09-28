import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganization } from "@/lib/org/org-context";
import {
  useSalesWrite,
  text,
  type PickerKind,
  type Row,
} from "@/components/sales/shared";
import { ReferencePicker } from "@/components/sales/reference-picker";
import type { Json } from "@/integrations/supabase/types";
import type { SalesOperation } from "@/lib/sales/sales.functions";

/**
 * Botão de ação do módulo de vendas.
 *
 * A operação é sempre executada pelo gateway `sales_execute`, com a chave de
 * idempotência renovada ao abrir e ao terminar. A permissão exibida no botão é
 * apenas conveniência de interface: quem valida é o servidor, que pode recusar
 * mesmo com a permissão aparentemente concedida.
 */
export type ActionField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea";
  required?: boolean;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  picker?: PickerKind;
  hint?: string;
};

export type ActionItem = {
  id: string;
  label: string;
  pending?: number;
};

export type ActionProps = {
  organizationId: string;
  label: string;
  permission: string;
  operation: SalesOperation;
  id?: string;
  action?: string;
  fields?: ActionField[];
  items?: ActionItem[];
  /** Chave do item dentro de `items`; o padrão é o item do próprio pedido. */
  itemField?: string;
  /** Nome do campo de quantidade — conferência usa `confirmed_quantity`. */
  quantityField?: string;
  fixed?: Row;
  initial?: Row;
  description?: string;
  onSuccess?: () => void;
};

export function SalesAction({
  organizationId,
  label,
  permission,
  operation,
  id,
  action = "",
  fields = [],
  items,
  itemField = "sales_order_item_id",
  quantityField,
  fixed,
  initial,
  description,
  onSuccess,
}: ActionProps) {
  const { hasPermission } = useOrganization();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { key, renew } = useIdempotencyKey();
  const write = useSalesWrite(organizationId, {
    onSuccess: () => {
      toast.success(`${label} concluída`);
      setOpen(false);
      setValues({});
      setAmounts({});
      onSuccess?.();
    },
  });

  if (!hasPermission(permission)) return null;

  const selected = items?.filter((item) => Number(amounts[item.id] ?? 0) > 0) ?? [];
  const emptyForm = fields.length === 0 && !items;

  const submit = () => {
    const payload: Record<string, Json> = { ...(fixed ?? {}) } as Record<string, Json>;
    for (const field of fields) {
      const value = values[field.key] ?? text(initial?.[field.key]);
      if (value === "") continue;
      payload[field.key] = field.type === "number" ? Number(value) : value;
    }
    if (items) {
      payload.items = selected.map((item) => ({
        [itemField]: item.id,
        [quantityField ?? "quantity"]: Number(amounts[item.id]),
      }));
    }
    write.mutate({ operation, id, action, values: payload });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (write.isPending) return;
          if (next) renew();
          setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {fields.map((field) => (
              <ActionInput
                key={field.key}
                organizationId={organizationId}
                field={field}
                value={values[field.key] ?? text(initial?.[field.key])}
                onChange={(next) => setValues((current) => ({ ...current, [field.key]: next }))}
              />
            ))}
            {items?.map((item) => (
              <div key={item.id} className="space-y-1">
                <Label>
                  {item.label}
                  {item.pending === undefined ? null : ` — pendente: ${item.pending}`}
                </Label>
                <Input
                  aria-label={`Quantidade de ${item.label}`}
                  type="number"
                  min="0"
                  step="any"
                  value={amounts[item.id] ?? ""}
                  onChange={(event) =>
                    setAmounts((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                />
              </div>
            ))}
            {emptyForm ? (
              <p className="text-sm text-muted-foreground">
                Confirme a operação. O servidor revalida estado, permissão e estoque.
              </p>
            ) : null}
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
              <Button type="submit" disabled={write.isPending}>
                {write.isPending ? "Processando…" : "Confirmar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionInput({
  organizationId,
  field,
  value,
  onChange,
}: {
  organizationId: string;
  field: ActionField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.picker) {
    return (
      <ReferencePicker
        organizationId={organizationId}
        kind={field.picker}
        label={field.label}
        value={value}
        onChange={onChange}
      />
    );
  }
  return (
    <div className="space-y-1">
      <Label>{field.label}</Label>
      {field.options ? (
        <select
          aria-label={field.label}
          required={field.required}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Selecione</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {field.optionLabels?.[option] ?? option}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <Textarea
          aria-label={field.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          aria-label={field.label}
          type={field.type ?? "text"}
          step="any"
          min={field.type === "number" ? 0 : undefined}
          required={field.required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
    </div>
  );
}
