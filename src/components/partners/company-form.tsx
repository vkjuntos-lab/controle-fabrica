import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { savePartnerCompany, savePartnerDetail } from "@/lib/partners/partners.functions";
import type { PartnerDetail, DetailValues } from "@/lib/partners/types";
import { useOrganization } from "@/lib/org/org-context";

const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
export function CompanyForm({
  organizationId,
  company,
  onClose,
  onSaved,
}: {
  organizationId: string;
  company?: PartnerDetail;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const save = useServerFn(savePartnerCompany);
  const { hasPermission } = useOrganization();
  const [roles, setRoles] = useState(company?.roles ?? ["PARTNER"]);
  const [status, setStatus] = useState(company?.status ?? "ACTIVE");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return save({
        data: {
          organizationId,
          id: company?.id,
          company: {
            code: String(f.code),
            legal_name: String(f.legal_name),
            trade_name: String(f.trade_name),
            document_type: f.document_type as "CNPJ" | "CPF" | "OTHER",
            document_number: String(f.document_number),
            state_registration: String(f.state_registration),
            email: String(f.email),
            phone: String(f.phone),
            website: String(f.website),
            status,
            blocked_reason: String(f.blocked_reason ?? ""),
            roles: roles as ("PARTNER" | "CUSTOMER" | "SUPPLIER" | "RESELLER")[],
            settlement_frequency: f.settlement_frequency as "MONTHLY",
            notes: String(f.notes),
          },
        },
      });
    },
    onSuccess: (id) => {
      toast.success("Empresa salva");
      onSaved(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? "Editar empresa" : "Nova empresa parceira"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <h3 className="font-semibold">Identificação e contato</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["code", "Código", true],
              ["legal_name", "Razão social", true],
              ["trade_name", "Nome fantasia"],
              ["document_number", "Documento"],
              ["state_registration", "Inscrição estadual"],
              ["email", "Email"],
              ["phone", "Telefone"],
              ["website", "Website"],
            ].map(([name, label, required]) => (
              <div key={String(name)}>
                <Label htmlFor={String(name)}>
                  {label}
                  {required ? " *" : ""}
                </Label>
                <Input
                  id={String(name)}
                  name={String(name)}
                  type={name === "email" ? "email" : name === "website" ? "url" : "text"}
                  defaultValue={String(company?.[name as keyof PartnerDetail] ?? "")}
                  required={Boolean(required)}
                  maxLength={180}
                />
              </div>
            ))}
            <div>
              <Label>Tipo de documento</Label>
              <select
                className={inputClass}
                name="document_type"
                defaultValue={company?.document_type ?? "CNPJ"}
              >
                <option>CNPJ</option>
                <option>CPF</option>
                <option value="OTHER">Outro</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                disabled={company?.status === "BLOCKED" && !hasPermission("partners.block")}
              >
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
                {hasPermission("partners.block") ? (
                  <option value="BLOCKED">Bloqueado</option>
                ) : null}
              </select>
            </div>
          </div>
          {status === "BLOCKED" ? (
            <div>
              <Label>Motivo do bloqueio *</Label>
              <Textarea
                name="blocked_reason"
                required
                defaultValue={company?.blocked_reason ?? ""}
              />
            </div>
          ) : null}
          <h3 className="font-semibold">Operação</h3>
          <div className="flex flex-wrap gap-4">
            {["PARTNER", "CUSTOMER", "SUPPLIER", "RESELLER"].map((r, i) => (
              <label key={r} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  disabled={company?.roles.includes(r)}
                  onChange={(e) =>
                    setRoles((old) => (e.target.checked ? [...old, r] : old.filter((x) => x !== r)))
                  }
                />
                {["Parceiro", "Cliente", "Fornecedor", "Revendedor"][i]}
              </label>
            ))}
          </div>
          <div>
            <Label>Frequência prevista de fechamento (somente cadastro)</Label>
            <select
              name="settlement_frequency"
              className={inputClass}
              defaultValue={company?.profile?.settlement_frequency ?? "MONTHLY"}
            >
              {[
                ["WEEKLY", "Semanal"],
                ["BIWEEKLY", "Quinzenal"],
                ["MONTHLY", "Mensal"],
                ["CUSTOM", "Personalizada"],
              ].map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            O perfil de parceiro cria uma localização própria no Inventory Ledger. Contatos e
            endereços são cadastrados na página da empresa após salvar.
          </p>
          <div>
            <Label>Observações</Label>
            <Textarea name="notes" defaultValue={company?.notes ?? ""} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending || !roles.length}>
              {mutation.isPending ? "Salvando..." : "Salvar empresa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ContactAddressForm({
  organizationId,
  companyId,
  kind,
  record,
  onClose,
}: {
  organizationId: string;
  companyId: string;
  kind: "contact" | "address";
  record?: DetailValues;
  onClose: () => void;
}) {
  const save = useServerFn(savePartnerDetail);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return save({
        data: {
          organizationId,
          companyId,
          kind,
          id: record?.id,
          values: {
            ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)])),
            is_primary: f.is_primary === "on",
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Cadastro salvo");
      void cache.invalidateQueries({ queryKey: ["partners"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fields =
    kind === "contact"
      ? [
          ["name", "Nome", true],
          ["title", "Cargo / área"],
          ["email", "Email"],
          ["phone", "Telefone"],
          ["whatsapp", "WhatsApp"],
          ["notes", "Observações"],
        ]
      : [
          ["postal_code", "CEP"],
          ["street", "Logradouro", true],
          ["number", "Número"],
          ["complement", "Complemento"],
          ["district", "Bairro"],
          ["city", "Cidade", true],
          ["state", "UF / Estado"],
          ["country", "País", true],
        ];
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === "contact" ? "Contato" : "Endereço"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          {fields.map(([name, label, required]) => (
            <div key={String(name)}>
              <Label>{label}</Label>
              <Input
                name={String(name)}
                required={Boolean(required)}
                defaultValue={String(record?.[String(name)] ?? (name === "country" ? "BR" : ""))}
              />
            </div>
          ))}
          {kind === "contact" ? (
            <select
              aria-label="Status"
              name="status"
              className={inputClass}
              defaultValue={String(record?.status ?? "ACTIVE")}
            >
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          ) : (
            <select
              aria-label="Tipo de endereço"
              name="type"
              className={inputClass}
              defaultValue={String(record?.type ?? "SHIPPING")}
            >
              {[
                ["HEADQUARTERS", "Sede"],
                ["SHIPPING", "Entrega"],
                ["BILLING", "Cobrança"],
                ["OTHER", "Outro"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <label className="flex gap-2">
            <input name="is_primary" type="checkbox" defaultChecked={record?.is_primary} />
            Principal
          </label>
          <Button disabled={mutation.isPending}>Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
