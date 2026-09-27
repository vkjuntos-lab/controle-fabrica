import {
  CompanyChoice,
  companyChoicePayload,
  companyChoiceReady,
  type CompanyChoiceValue,
} from "./company-choice";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { LEAD_STATUS } from "@/lib/crm/constants";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { CrmListPage } from "./list";
import { Picker, str } from "./shared";

const area = areas.leads;

/**
 * Tela de leads.
 *
 * A conversão é uma transição do servidor (`crm_action` com `kind=lead`), não
 * um INSERT de cliente: exige lead qualificado, procura contato existente pelo
 * e-mail/telefone antes de criar e é idempotente pela chave de operação — repetir
 * o clique não duplica empresa nem oportunidade.
 */
export function LeadsPage() {
  const { currentOrganization, hasPermission } = useOrganization();
  const [converting, setConverting] = useState<CrmRow | null>(null);
  const org = currentOrganization?.organization_id ?? "";

  return (
    <>
      <CrmListPage
        area={area}
        title="Comercial · Leads"
        intro="O lead existe antes do cadastro empresarial. Só um lead qualificado pode ser convertido, e a desqualificação exige um motivo configurado."
        rowActions={(row) => {
          if (!hasPermission("leads.convert")) return null;
          if (String(row.status) !== "QUALIFIED") return null;
          return (
            <Button size="sm" variant="outline" onClick={() => setConverting(row)}>
              Converter
            </Button>
          );
        }}
      />
      {converting ? (
        <ConvertDialog org={org} lead={converting} onClose={() => setConverting(null)} />
      ) : null}
    </>
  );
}

function ConvertDialog({ org, lead, onClose }: { org: string; lead: CrmRow; onClose: () => void }) {
  const api = useServerFn(actCrm);
  const client = useQueryClient();
  const [stage, setStage] = useState("");
  const [title, setTitle] = useState("");
  const [operationKey] = useState(() => newOperationKey());
  const [companyChoice, setCompanyChoice] = useState<CompanyChoiceValue>({
    id: String(lead.company_id || ""),
    create: false,
    code: "",
    name: String(lead.company_name || ""),
    documentType: "",
    documentNumber: "",
  });

  const convert = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "lead",
          id: lead.id,
          action: "convert",
          values: {
            stage_id: stage,
            title: title || undefined,
            ...companyChoicePayload(companyChoice),
          },
          key: operationKey,
        },
      });
    },
    onSuccess: () => {
      toast.success("Lead convertido. Empresa, contato e oportunidade foram vinculados.");
      void client.invalidateQueries({ queryKey: ["crm"] });
      onClose();
    },
    onError: (error: Error) => {
      // Uma nova chave só é sorteada quando a tentativa falha: repetir a mesma
      // requisição devolve o mesmo resultado, uma falha pode ser corrigida.

      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Converter lead {str(lead.name)}</DialogTitle>
          <DialogDescription>
            A conversão é transacional e idempotente. Se já existir contato com o mesmo e-mail ou
            telefone na empresa, ele será reaproveitado em vez de duplicado.
          </DialogDescription>
        </DialogHeader>
        <CompanyChoice
          org={org}
          value={companyChoice}
          onChange={setCompanyChoice}
          search={String(lead.company_name || "")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker org={org} kind="stages" value={stage} onChange={setStage} label="Etapa inicial" />
          <div className="space-y-1">
            <Label htmlFor="lead-convert-title">Título da oportunidade</Label>
            <Input
              id="lead-convert-title"
              value={title}
              placeholder="Opcional — usa o nome do lead"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Status atual: {LEAD_STATUS[str(lead.status)] ?? str(lead.status)}. A empresa é criada
          somente quando necessário; se o lead já estiver vinculado a uma empresa, ela é
          reaproveitada.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={convert.isPending || !stage || !companyChoiceReady(companyChoice)}
            onClick={() => convert.mutate()}
          >
            {convert.isPending ? "Convertendo..." : "Converter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Chave de idempotência da operação de conversão. */
export const newOperationKey = () => crypto.randomUUID();
