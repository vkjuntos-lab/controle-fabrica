import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Picker, str } from "./shared";
import { useCrmQuery } from "./data";
export type CompanyChoiceValue = {
  id: string;
  create: boolean;
  code: string;
  name: string;
  documentType: string;
  documentNumber: string;
};
export function CompanyChoice({
  org,
  value,
  onChange,
  search = "",
}: {
  org: string;
  value: CompanyChoiceValue;
  onChange: (v: CompanyChoiceValue) => void;
  search?: string;
}) {
  const matches = useCrmQuery(org, "companies", { q: search }, 1, !!search);
  return (
    <div className="space-y-3 rounded border p-3">
      <p className="text-sm">
        Pesquise antes de criar: fornecedores, parceiros e clientes usam a mesma empresa.
      </p>
      {!!search && !!matches.data?.rows?.length && (
        <div>
          <p className="text-sm">Possíveis correspondências (nenhuma mesclagem automática):</p>
          {matches.data.rows.slice(0, 5).map((r) => (
            <Button
              variant="link"
              key={r.id}
              onClick={() => onChange({ ...value, id: r.id, create: false })}
            >
              {str(r.legal_name)} · {str(r.document_number)}
            </Button>
          ))}
        </div>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.create}
          onChange={(e) => onChange({ ...value, create: e.target.checked })}
        />
        Não encontrei a empresa; cadastrar uma nova
      </label>
      {!value.create ? (
        <Picker
          org={org}
          kind="companies"
          value={value.id}
          onChange={(id) => onChange({ ...value, id })}
          label="Empresa existente"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            Código
            <Input
              value={value.code}
              onChange={(e) => onChange({ ...value, code: e.target.value })}
              required
            />
          </label>
          <label>
            Razão social
            <Input
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              required
            />
          </label>
          <label>
            Tipo de documento
            <select
              className="w-full rounded border bg-background p-2"
              value={value.documentType}
              onChange={(e) => onChange({ ...value, documentType: e.target.value })}
            >
              <option value="">Não informado</option>
              <option>CNPJ</option>
              <option>CPF</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>
            Documento
            <Input
              value={value.documentNumber}
              onChange={(e) => onChange({ ...value, documentNumber: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
export function companyChoicePayload(v: CompanyChoiceValue) {
  return v.create
    ? {
        company: {
          code: v.code,
          legal_name: v.name,
          ...(v.documentType
            ? { document_type: v.documentType, document_number: v.documentNumber }
            : {}),
        },
      }
    : { company_id: v.id };
}
export const companyChoiceReady = (v: CompanyChoiceValue) =>
  v.create ? !!(v.code.trim() && v.name.trim()) : !!v.id;
