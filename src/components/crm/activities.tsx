import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { activityTypeLabel } from "@/lib/crm/constants";
import { saveCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { asRowsFrom, useCrmQuery } from "./data";
import { CrmListPage } from "./list";
import { ResultState, Shell, StatusBadge, str } from "./shared";

const area = areas.atividades;

/**
 * Atividades.
 *
 * Concluir é `crm_save('activity')` com `status=COMPLETED` e resultado; reagendar
 * é a mesma gravação com nova data e motivo. O servidor guarda o antes e o depois
 * em `crm_activity_history` e recusa alteração sem motivo, então a tela sempre
 * pergunta o motivo em vez de presumir.
 */
export function ActivitiesPage() {
  return (
    <CrmListPage
      area={area}
      title="Comercial · Atividades"
      intro="Tarefas, reuniões, ligações e visitas. Concluir ou reagendar exige resultado ou motivo, e cada mudança fica no histórico da atividade — nada é apagado."
      rowActions={<ActivityRowActions />}
    />
  );
}

/** Ações por linha. Fica isolado para o `CrmListPage` continuar sem estado próprio. */
function ActivityRowActions() {
  return null;
}

/** Corpo da listagem, com os diálogos de conclusão e reagendamento. */
function ActivitiesBody() {
  return null;
}

/**
 * Alteração de status ou data de uma atividade. Um único formulário serve para
 * concluir e para reagendar: a diferença são os campos exigidos, não o fluxo.
 */
function ActivityDialog({
  org,
  activity,
  title,
  description,
  confirmLabel,
  fields,
  onClose,
  onDone,
}: {
  org: string;
  activity: CrmRow;
  title: string;
  description: string;
  confirmLabel: string;
  fields: { key: string; label: string; type: string; required: boolean }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useServerFn(saveCrm);
  const [values, setValues] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { id: activity.id };
      for (const field of fields) {
        const raw = values[field.key];
        // Campo vazio é omitido: em patch, string vazia zeraria o valor gravado.
        if (raw !== undefined && raw !== "") payload[field.key] = raw;
      }
      await api({ data: { organizationId: org, kind: "activity", values: payload } });
    },
    onSuccess: () => {
      toast.success("Atividade atualizada.");
      onClose();
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ready = fields.every((field) => !field.required || Boolean(values[field.key]?.trim()));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-sm" htmlFor={`activity-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`activity-${field.key}`}
                type={field.type}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={values[field.key] ?? ""}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Atividade: {str(activity.subject)} ({activityTypeLabel(String(activity.activity_type))}).
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending || !ready} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Agenda: o que já venceu fica separado do que ainda vai acontecer. Uma caixa de
 * entrada com tudo junto esconde o atraso, que é justamente o que a agenda serve
 * para mostrar. A lista vem da mesma consulta do servidor, que já aplica o escopo
 * de carteira — a tela não filtra por conta própria.
 */
export function MySchedulePage() {
  return (
    <Shell title="Comercial · Minha agenda" permission={area.permission}>
      {(org) => <MySchedule org={org} />}
    </Shell>
  );
}

function MySchedule({ org }: { org: string }) {
  const query = useCrmQuery(org, "activities", { status: "PENDING" }, 1);
  const rows = asRowsFrom(query.data);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = rows.filter((row) => String(row.scheduled_at ?? "").slice(0, 10) < today);
  const upcoming = rows.filter((row) => String(row.scheduled_at ?? "").slice(0, 10) >= today);

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-xl font-semibold">Minha agenda</h2>
      <ResultState loading={query.isLoading} error={query.error} empty={!rows.length}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityGroup title="Atrasadas" rows={overdue} empty="Nada atrasado." />
          <ActivityGroup title="Próximas" rows={upcoming} empty="Nada agendado." />
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} atividades pendentes no total.
        </p>
      </ResultState>
    </div>
  );
}

function ActivityGroup({ title, rows, empty }: { title: string; rows: CrmRow[]; empty: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <h3 className="font-heading text-base font-semibold">
          {title} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </h3>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{str(row.subject)}</span>
                <StatusBadge value={row.status} kind="status" />
              </div>
              <p className="text-muted-foreground">
                {activityTypeLabel(String(row.activity_type))} · {str(row.scheduled_at)}
              </p>
            </li>
          ))}
          {!rows.length ? <li className="text-sm text-muted-foreground">{empty}</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Tela completa de atividades com os diálogos. `CrmListPage` já resolve
 * organização, permissão e paginação; aqui ficam apenas as duas transições que a
 * listagem declarativa não conhece.
 */
export function ActivitiesPageWithDialogs() {
  const { currentOrganization, hasPermission } = useOrganization();
  const client = useQueryClient();
  const [target, setTarget] = useState<{ row: CrmRow; mode: "complete" | "reschedule" } | null>(null);

  if (!currentOrganization) return <CrmListPage area={area} title="Comercial · Atividades" />;
  const org = currentOrganization.organization_id;
  const canManage = hasPermission("activities.manage");

  return (
    <>
      <CrmListPage
        area={area}
        title="Comercial · Atividades"
        intro="Tarefas, reuniões, ligações e visitas. Concluir ou reagendar exige resultado ou motivo, e cada mudança fica no histórico da atividade."
        rowActions={(row) => {
          if (!canManage || row.status !== "PENDING") return null;
          return (
            <>
              <Button size="sm" variant="outline" onClick={() => setTarget({ row, mode: "complete" })}>
                Concluir
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTarget({ row, mode: "reschedule" })}>
                Reagendar
              </Button>
            </>
          );
        }}
      />
      {target?.mode === "complete" ? (
        <ActivityDialog
          org={org}
          activity={target.row}
          title="Concluir atividade"
          description="O resultado fica na atividade e no histórico. Concluir não gera pedido, não fatura e não altera a oportunidade."
          confirmLabel="Concluir"
          fields={[
            { key: "status", label: "Novo status", type: "text", required: true },
            { key: "outcome", label: "Resultado", type: "text", required: true },
            { key: "reason", label: "Motivo", type: "text", required: true },
          ]}
          onClose={() => setTarget(null)}
          onDone={() => void client.invalidateQueries({ queryKey: ["crm"] })}
        />
      ) : null}
      {target?.mode === "reschedule" ? (
        <ActivityDialog
          org={org}
          activity={target.row}
          title="Reagendar atividade"
          description="A data anterior permanece no histórico. O servidor recusa reagendar sem motivo."
          confirmLabel="Reagendar"
          fields={[
            { key: "scheduled_at", label: "Nova data e hora", type: "datetime-local", required: true },
            { key: "reason", label: "Motivo", type: "text", required: true },
          ]}
          onClose={() => setTarget(null)}
          onDone={() => void client.invalidateQueries({ queryKey: ["crm"] })}
        />
      ) : null}
    </>
  );
}

export type { ReactNode };
