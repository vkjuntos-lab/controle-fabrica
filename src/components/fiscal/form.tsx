import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readFiscal, mutateFiscal } from "@/lib/fiscal/fiscal.functions";
import { type Field, type FormDefinition } from "./config";
import type { Json } from "@/integrations/supabase/types";

export type Row = Record<string, Json | undefined>;
export function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
export function label(row: Row) {
  return String(
    row.label ??
      row.legal_name ??
      row.fiscal_nature ??
      row.sku ??
      row.name ??
      row.version ??
      row.id ??
      "—",
  );
}
const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
export function Reference({
  org,
  kind,
  value,
  onChange,
}: {
  org: string;
  kind: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [search, setSearch] = useState("");
  const result = useQuery({
    queryKey: ["fiscal", org, kind, search],
    queryFn: () =>
      readFiscal({ data: { organizationId: org, kind, filters: search ? { search } : {} } }),
  });
  const options = rows(result.data);
  // A opção escolhida só existe no resultado quando a pesquisa atual a traz.
  // Sem esta linha, digitar no campo de pesquisa some a escolha do `<select>`
  // e o formulário passa a enviar vazio onde havia um registro válido.
  const current = options.find((r) => String(r.id) === value);
  return (
    <div className="space-y-1">
      <input
        aria-label="Pesquisar opções"
        className={inputClass}
        placeholder="Pesquisar…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {current && (
          <option value={value}>
            {label(current)}
            {current.status ? ` · ${String(current.status)}` : ""}
          </option>
        )}
        {options
          .filter((r) => String(r.id) !== value)
          .map((r) => (
            <option key={String(r.id)} value={String(r.id)}>
              {label(r)}
              {r.status ? ` · ${String(r.status)}` : ""}
            </option>
          ))}
      </select>
      {result.error && <p role="alert">{result.error.message}</p>}
      <small>Até 50 resultados; use a pesquisa para localizar.</small>
    </div>
  );
}
export function InputField({
  field,
  org,
  value,
  onChange,
}: {
  field: Field;
  org: string;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {field.label}
      {field.optional ? " (opcional)" : ""}
      {field.reference ? (
        <Reference
          org={org}
          kind={field.reference}
          value={String(value ?? "")}
          onChange={onChange}
        />
      ) : field.options ? (
        <select
          required={!field.optional}
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecione…</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : (
        <input
          className={inputClass}
          required={!field.optional}
          type={field.type ?? "text"}
          step="any"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
export function FiscalForm({
  org,
  definition,
  onSaved,
}: {
  org: string;
  definition: FormDefinition;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [taxes, setTaxes] = useState<Record<string, string | boolean>[]>([{}]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const taxFields: Field[] = [
    { key: "tax_id", label: "Tributo", reference: "taxes" },
    { key: "rate", label: "Alíquota em fração (ex.: 0,01 = 1%)", type: "number" },
    {
      key: "base_mode",
      label: "Base aprovada",
      options: ["BASE_CALCULO", "VALOR_LIQUIDO", "ISOLATED"],
    },
    { key: "reduction", label: "Redução de base em valor", type: "number", optional: true },
    { key: "fixed_amount", label: "Valor fixo por item", type: "number", optional: true },
    { key: "treatment_code", label: "Código de tratamento aprovado" },
    { key: "is_withheld", label: "Retenção", type: "checkbox" },
    { key: "is_recoverable", label: "Recuperável", type: "checkbox" },
  ];
  // O `required` do HTML só vale para `<input>` e `<select>` nativos. Campo de
  // referência é um `<select>` dentro de um `<div>`, então o navegador não
  // bloqueia o envio e o servidor recebia a chave omitida — erro cru, sem
  // dizer qual campo faltou.
  function missing(fields: Field[], source: Record<string, string | boolean>): string[] {
    return fields
      .filter((f) => !f.optional)
      .filter((f) => f.type !== "checkbox")
      .filter((f) => String(source[f.key] ?? "").trim() === "")
      .map((f) => f.label);
  }
  const requiredRule = [...definition.fields, ...(definition.operation === "rule" ? taxFields : [])];
  return (
    <form
      className="space-y-4 rounded-xl border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const absent = [...missing(definition.fields, values)];
        if (definition.operation === "rule")
          for (const [index, row] of taxes.entries())
            absent.push(...missing(taxFields, row).map((label) => `Tratamento ${index + 1}: ${label}`));
        if (absent.length) {
          setError(`Preencha antes de salvar: ${absent.join(", ")}.`);
          return;
        }
        setPending(true);
        setError("");
        try {
          const data: Record<string, Json> = {};
          for (const [k, v] of Object.entries(values)) if (v !== "") data[k] = v;
          if (definition.operation === "prepare") data.source_type = "SHIPMENT";
          if (definition.operation === "rule")
            data.taxes = taxes.map((t) =>
              Object.fromEntries(Object.entries(t).filter(([, v]) => v !== "")),
            );
          if (definition.operation === "layout")
            data.required_fields = [
              "establishment.tax_registration",
              "issuer_address.street",
              "issuer_address.city",
              "recipient.tax_registration",
              "recipient_address.street",
              "recipient_address.city",
            ];
          await mutateFiscal({
            data: { organizationId: org, operation: definition.operation, values: data },
          });
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha ao salvar");
        } finally {
          setPending(false);
        }
      }}
    >

      <h2 className="text-lg font-semibold">{definition.title}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {definition.fields.map((f) => (
          <InputField
            key={f.key}
            field={f}
            org={org}
            value={values[f.key] ?? ""}
            onChange={(v) => setValues({ ...values, [f.key]: v })}
          />
        ))}
      </div>
      {definition.operation === "rule" && (
        <div className="space-y-4">
          {taxes.map((t, index) => (
            <fieldset key={index} className="grid gap-3 rounded border p-4 md:grid-cols-2">
              <legend>Tratamento {index + 1}</legend>
              {taxFields.map((f) => (
                <InputField
                  key={f.key}
                  field={f}
                  org={org}
                  value={t[f.key] ?? ""}
                  onChange={(v) =>
                    setTaxes(taxes.map((r, n) => (n === index ? { ...r, [f.key]: v } : r)))
                  }
                />
              ))}
            </fieldset>
          ))}
          <Button type="button" variant="outline" onClick={() => setTaxes([...taxes, {}])}>
            Adicionar tributo
          </Button>
          <p className="text-sm text-muted-foreground">
            Regra só vira vigente com pelo menos um tratamento explícito, inclusive isenção. O banco
            recusa regra sem item; a tela não aceita envio incompleto.
          </p>
        </div>
      )}
      {definition.operation === "layout" && (
        <p className="text-sm text-muted-foreground">
          O cadastro nasce em rascunho. A lista mínima de conferência contempla cadastro e endereço
          de emitente e destinatário. A validação técnica integral depende do esquema e do adaptador
          homologados.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
    </form>
  );
}
