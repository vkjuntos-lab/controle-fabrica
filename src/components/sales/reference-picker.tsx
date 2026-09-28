import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { queryCrm } from "@/lib/crm/crm.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/states";
import { PICKER_LABEL, text, type PickerKind, type Row } from "@/components/sales/shared";

/**
 * Seletor de referência das telas de vendas.
 *
 * Consulta `crm_query` — a mesma fonte do CRM, respeitando `organization_id` e
 * a permissão de leitura do kind — e mostra o texto de cada tipo corretamente.
 * O `Picker` do CRM não serve aqui: uma proposta tem `quote_number` e
 * `version`, e não tem `name`, `legal_name` nem `sku`; sem rótulo próprio o
 * usuário veria uma lista de "—" indistinguíveis e não saberia o que está
 * escolhendo.
 */
/**
 * Filtros fixos por tipo.
 *
 * Só a proposta aceita vira pedido: converter uma proposta em rascunho ou
 * recusada não é conversão, é um desvio do fluxo comercial. O filtro vai no
 * servidor porque a tela não pode decidir quem é elegível.
 */
const PICKER_FILTERS: Partial<Record<PickerKind, Record<string, string>>> = {
  quotes: { status: "ACCEPTED" },
};

export function ReferencePicker({
  organizationId,
  kind,
  value,
  onChange,
  label,
  required,
  disabled,
  emptyHint,
}: {
  organizationId: string;
  kind: PickerKind;
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const api = useServerFn(queryCrm);
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  // Rótulo da escolha corrente: quando a opção sai da busca, o valor continua
  // selecionado e precisa continuar legível — o UUID não ajuda ninguém.
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => setPage(1), [term]);

  const fixed = PICKER_FILTERS[kind] ?? {};
  const options = useQuery({
    queryKey: ["sales", organizationId, "picker", kind, term, page, fixed],
    queryFn: async () => {
      const response = await api({
        data: {
          organizationId,
          kind,
          filters: { ...fixed, ...(term ? { q: term } : {}) },
          page,
        },
      });
      return { rows: (response.rows ?? []) as Row[], total: Number(response.total ?? 0) };
    },
    enabled: Boolean(organizationId) && !disabled,
  });

  const describe = PICKER_LABEL[kind];
  const options_ = options.data?.rows ?? [];
  const current = options_.find((row) => text(row.id) === value);
  const currentLabel = current ? describe(current) : chosen?.id === value ? chosen.label : "";
  const total = options.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));

  return (
      <div className="space-y-1">
        <Label>{label}</Label>
        {value && currentLabel ? (
          <p className="text-sm">
            Selecionado: <span className="font-medium">{currentLabel}</span>
          </p>
        ) : null}
        <Input
          placeholder="Buscar"
          aria-label={`${label}: buscar`}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          disabled={disabled}
        />
      <div className="max-h-64 overflow-y-auto rounded-md border" role="listbox" aria-label={label}>
        {options.isPending ? (
          <LoadingState rows={2} label="Carregando opções" />
        ) : options_.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {emptyHint ?? `Nenhum registro encontrado para "${term}".`}
          </p>
        ) : (
          options_.map((row) => {
            const id = text(row.id);
            const active = id === value;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                className={`block w-full truncate border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                  active ? "bg-accent font-medium" : "hover:bg-muted"
                }`}
                onClick={() => onChange(active && !required ? "" : id)}
              >
                {describe(row)}
              </button>
            );
          })
        )}
      </div>
      {value && !selected ? (
        <p className="text-xs text-muted-foreground">
          Registro selecionado fora da busca atual: {describe({ id: value })}
        </p>
      ) : null}
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Próxima
          </Button>
        </div>
      ) : null}
      {options.error ? (
        <p role="alert" className="text-sm text-destructive">
          {options.error.message}
        </p>
      ) : null}
    </div>
  );
}
