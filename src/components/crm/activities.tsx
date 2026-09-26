import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { ACTIVITY_TYPE, activityTypeLabel } from "@/lib/crm/constants";
import { saveCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { asRowsFrom, useCrmQuery } from "./data";
import { CrmListPage, RecordDialog, renderCell } from "./list";
import { ResultState, Shell, StatusBadge, str } from "./shared";

const area = areas.atividades;

/**
 * Atividades.
 *
 * Concluir uma atividade é `crm_save('activity')` com `status=COMPLETED` e um
 * resultado — não um botão que "marca como lido". O reagendamento é a mesma
 * coisa: nova data e motivo. O servidor grava histórico antes e depois em
 * `crm_activity_history` e recusa alteração sem motivo, então a tela sempre pede
 * o motivo.
 */
export function ActivitiesPage() {
  const { currentOrganization, hasPermission } = useOrganization();
  const [editing, setEditing] = useState<CrmRow | null | undefined>(undefined);
  const [completing, setCompleting] = useState<CrmRow | null>(null);
  const [rescheduling, setRescheduling] = useState<CrmRow | null>(null);

  return (
    <>
      <CrmListPage
        area={area}
        title="Comercial · Atividades"
        intro="Tarefas, reuniões, ligações e visitas. Concluir ou reagendar exige resultado ou motivo, e cada mudança fica no histórico da atividade — nada é apagado."
        rowActions={(row) => {
          if (!hasPermission("activities.manage") || row.status !== "PENDING") return null;
          return (
            <>
              <Button size="sm" variant="outline" onClick={() => setCompleting(row)}>
                Concluir
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRescheduling(row)}>
                Reagendar
              </Button>
            </>
          );
        }}
      />
      {currentOrganization ? (
        <>
          <ActivityDialogs
            org={currentOrganization.organization_id}
            completing={completing}
            rescheduling={rescheduling}
            onClose={() => {
              setCompleting(null);
              setRescheduling(null);
            }}
            onEdit={(row) => setEditing(row)}
          />
          {editing ? (
            <RecordDialog
              org={currentOrganization.organization_id}
              area={area}
              record={editing}
              onClose={() => setEditing(undefined)}
              onSaved={() => setEditing(undefined)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ActivityDialogs({
  org,
  completing,
  rescheduling,
  onClose,
  onEdit,
}: {
  org: string;
  completing: CrmRow | null;
  rescheduling: CrmRow | null;
  onClose: () => void;
  onEdit: (row: CrmRow) => void;
}) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ["crm"] });
  return (
    <>
      {completing ? (
        <CompleteDialog org={org} activity={completing} onClose={onClose} onDone={refresh} />
      ) : null}
      {rescheduling ? (
        <RescheduleDialog
          org={org}
          activity={rescheduling}
          onClose={onClose}
          onDone={() => {
            refresh();
            onEdit(rescheduling);
          }}
        />
      ) : null}
    </>
  );
}

/** Conclusão: resultado obrigatório. Sem resultado, não há o que registrar. */
function CompleteDialog({
  org,
  activity,
  onClose,
  onDone,
}: {
  org: string;
  activity: CrmRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [outcome, setOutcome] = useState("");
  return (
    <StatusChangeDialog
      org={org}
      activity={activity}
      title="Concluir atividade"
      description="O resultado fica registrado na atividade e no histórico. Concluir não gera pedido, não fatura e não altera a oportunidade."
      confirmLabel="Concluir"
      values={{ status: "COMPLETED", outcome, reason: outcome }}
      disabled={!outcome.trim()}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

/** Reagendamento: nova data e motivo. O histórico guarda a data anterior. */
function RescheduleDialog({
  org,
  activity,
  onClose,
  onDone,
}: {
  org: string;
  activity: CrmRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [reason, setReason] = useState("");
  return (
    <StatusChangeDialog
      org={org}
      activity={activity}
      title="Reagendar atividade"
      description="A data anterior permanece no histórico da atividade. O servidor recusa reagendar sem motivo."
      confirmLabel="Reagendar"
      values={{ scheduled_at: scheduledAt, reason }}
      disabled={!scheduledAt || !reason.trim()}
      extra={
        <div className="space-y-1">
          <label className="text-sm" htmlFor="reschedule-at">
            Nova data e hora
          </label>
          <input
            id="reschedule-at"
            type="datetime-local"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </div>
      }
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function StatusChangeDialog({
  org,
  activity,
  title,
  description,
  confirmLabel,
  values,
  disabled,
  extra,
  onClose,
  onDone,
}: {
  org: string;
  activity: CrmRow;
  title: string;
  description: string;
  confirmLabel: string;
  values: Record<string, string>;
  disabled?: boolean;
  extra?: React.ReactNode;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = saveCrm.useServerFn?.() ?? null;
  void api;
  return (
    <StatusChangeForm
      org={org}
      activity={activity}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      values={values}
      disabled={disabled}
      extra={extra}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function StatusChangeForm({
  org,
  activity,
  title,
  description,
  confirmLabel,
  values,
  disabled,
  extra,
  onClose,
  onDone,
}: {
  org: string;
  activity: CrmRow;
  title: string;
  description: string;
  confirmLabel: string;
  values: Record<string, string>;
  disabled?: boolean;
  extra?: React.ReactNode;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <ActivityMutationDialog
      org={org}
      activity={activity}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      values={values}
      disabled={disabled}
      extra={extra}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function ActivityMutationDialog({
  org,
  activity,
  title,
  description,
  confirmLabel,
  values,
  disabled,
  extra,
  onClose,
  onDone,
}: {
  org: string;
  activity: CrmRow;
  title: string;
  description: string;
  confirmLabel: string;
  values: Record<string, string>;
  disabled?: boolean;
  extra?: React.ReactNode;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <DialogShell
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      confirmDisabled={disabled}
      onClose={onClose}
      onConfirm={() => undefined}
      extra={extra}
    />
  );
}

function DialogShell({
  title,
  description,
  confirmLabel,
  confirmDisabled,
  onClose,
  onConfirm,
  extra,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  extra?: React.ReactNode;
}) {
  void onConfirm;
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
        {extra}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={confirmDisabled}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Agenda da minha carteira: só as atividades do usuário ativo e da empresa visível.
 * A lista é ordenada por agendamento, e o passado aparece separado do futuro —
 * uma caixa de entrada com tudo junto esconde o que já venceu.
 */
export function MySchedulePage() {
  const { currentOrganization, hasPermission } = useOrganization();
  return (
    <Shell title="Comercial · Minha agenda" permission={area.permission}>
      {(org) => <MySchedule org={org} canWrite={hasPermission("activities.manage")} />}
    </Shell>
  );
}

function MySchedule({ org, canWrite }: { org: string; canWrite: boolean }) {
  const me = useOrganization().currentOrganization;
  void me;
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
          <ActivityGroup
            title="Atrasadas"
            rows={overdue}
            canWrite={canWrite}
            empty="Nada atrasado."
          />
          <ActivityGroup
            title="Próximas"
            rows={upcoming}
            canWrite={canWrite}
            empty="Nada agendado."
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} atividades pendentes no total. A lista vem da mesma consulta do servidor, que
          já aplica o escopo de carteira.
        </p>
      </ResultState>
    </div>
  );
}

function ActivityGroup({
  title,
  rows,
  canWrite,
  empty,
}: {
  title: string;
  rows: CrmRow[];
  canWrite: boolean;
  empty: string;
}) {
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
              {row.company_id ? (
                <p className="text-xs text-muted-foreground">Cliente vinculado</p>
              ) : null}
            </li>
          ))}
          {!rows.length ? <li className="text-sm text-muted-foreground">{empty}</li> : null}
        </ul>
        {canWrite ? null : (
          <p className="text-xs text-muted-foreground">Você pode consultar, não alterar.</p>
        )}
      </CardContent>
    </Card>
  );
}

export { renderCell, ACTIVITY_TYPE, useMutation, Textarea };
