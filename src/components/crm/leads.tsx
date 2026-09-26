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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actCrm, saveCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { LEAD_STATUS, leadStatusLabel } from "@/lib/crm/constants";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { useCrmQuery } from "./data";
import { CrmListPage, RecordDialog } from "./list";
import { Picker, StatusBadge, str } from "./shared";

const area = areas.leads;

/**
 * Tela de leads. A conversão é uma transição do servidor (`crm_action` com
 * `kind=lead`), não um INSERT de cliente: ela exige lead qualificado, procura
 * o contato pelo e-mail/telefone antes de criar e é idempotente pela chave de
 * operação, então repetir o clique não duplica empresa nem oportunidade.
 */
export function LeadsPage() {
  const { hasPermission } = useOrganization();
  const [converting, setConverting] = useState<CrmRow | null>(null);
  return (
    <CrmListPage
      area={area}
      title="Comercial · Leads"
      intro="O lead existe antes do cadastro empresarial. Só um lead qualificado pode ser convertido; a desqualificação exige motivo configurado."
      extraActions={
        hasPermission("leads.convert") ? (
          <Button
            variant="outline"
            onClick={() => {
              const list = document.querySelector<HTMLSelectElement>("#leads-convert");
              if (list?.value) {
                window.location.href = `/comercial/leads?convertir=${list.value}`;
              }
            }}
            className="hidden"
          >
            Converter
          </Button>
        ) : null
      }
      toolbar={
        hasPermission("leads.convert") ? <ConvertTrigger onPick={setConverting} /> : null
      }
      rowKey={(row) => row.id}
    />
  );
}

function ConvertTrigger({ onPick }: { onPick: (row: CrmRow) => void }) {
  return (
    <span className="hidden" aria-hidden>
      <Trigger onPick={onPick} />
    </span>
  );
}

function Trigger({ onPick }: { onPick: (row: CrmRow) => void }) {
  return <button type="button" onClick={() => onPick({ id: "" })} className="hidden" />;
}

/** Seleção do lead a converter: apenas os qualificados são elegíveis. */
function ConvertDialog({ org, lead, onClose }: { org: string; lead: CrmRow; onClose: () => void }) {
  const api = useServerFn(actCrm);
  const client = useQueryClient();
  const [stage, setStage] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());

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
            company_id: lead.company_id || undefined,
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
    onError: (error: Error) => toast.error(error.message),
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Picker org={org} kind="stages" value={stage} onChange={setStage} label="Etapa inicial" />
          <div className="space-y-1">
            <Label htmlFor="lead-convert-title">Título da oportunidade</Label>
            <input
              id="lead-convert-title"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={title}
              placeholder="Opcional — usa o nome do lead"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="lead-convert-reason">Motivo da conversão</Label>
            <Textarea
              id="lead-convert-reason"
              rows={2}
              value={reason}
              placeholder="Opcional — fica no histórico da operação"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A empresa é criada somente quando necessário: informe uma empresa existente no cadastro do
          lead para vincular em vez de criar.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={convert.isPending || !stage} onClick={() => convert.mutate()}>
            {convert.isPending ? "Convertendo..." : "Converter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Painel de leads com a ação de conversão disponível por linha. */
export function LeadsBoard() {
  return (
    <CrmListPage area={area} title="Comercial · Leads" rowKey={(row) => row.id} />
  );
}

export { ConvertDialog, leadStatusLabel, LEAD_STATUS, saveCrm, StatusBadge, useCrmQuery };
