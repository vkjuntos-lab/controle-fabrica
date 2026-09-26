import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { actCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { OPPORTUNITY_STATUS, opportunityStatusLabel } from "@/lib/crm/constants";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { asNumber, useCrmQuery } from "./data";
import { CrmListPage, RecordDialog } from "./list";
import { Picker, ResultState, Shell, StatusBadge, money, percent, str } from "./shared";

const area = areas.oportunidades;

/**
 * Pipeline.
 *
 * A visualização padrão é o Kanban por etapa, porque é assim que a operação lê o
 * funil. A lista completa continua disponível, porque o quadro não mostra
 * contato, valor ponderado nem histórico — omitir isso perderia informação, não
 * seria uma escolha de visual.
 */
export function OpportunitiesPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  return (
    <Shell title="Comercial · Pipeline" permission={area.permission}>
      {(org) => (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Pipeline</h2>
            <Tabs value={view} onValueChange={(next) => setView(next as "kanban" | "list")}>
              <TabsList>
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
                <TabsTrigger value="list">Lista</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {view === "kanban" ? <Kanban org={org} /> : <OpportunityTable org={org} />}
        </div>
      )}
    </Shell>
  );
}

type Stage = CrmRow & { id: string };

/**
 * Kanban. Os cartões são as oportunidades abertas do pipeline escolhido; a
 * contagem e o total de cada coluna vêm da consulta, não de um cálculo local, e
 * arrastar cartão não é permitido: a mudança de etapa é uma transição de
 * servidor que grava histórico e recalcula probabilidade.
 */
function Kanban({ org }: { org: string }) {
  const { hasPermission } = useOrganization();
  const client = useQueryClient();
  const [pipelineId, setPipelineId] = useState("");
  const [editing, setEditing] = useState<CrmRow | null | undefined>(undefined);
  const [dragging, setDragging] = useState<CrmRow | null>(null);

  const pipelines = useCrmQuery(org, "pipelines", { status: "ACTIVE" }, 1);
  const activePipeline =
    pipelineId || (((pipelines.data?.rows ?? [])[0] as CrmRow | undefined)?.id ?? "");
  const stages = useCrmQuery(
    org,
    "stages",
    activePipeline ? { pipeline_id: activePipeline } : {},
    1,
  );
  const board = useCrmQuery(
    org,
    "opportunities",
    { status: "OPEN", ...(activePipeline ? { pipeline_id: activePipeline } : {}) },
    1,
    Boolean(activePipeline),
  );

  const columns = ((stages.data?.rows ?? []) as Stage[]).sort(
    (a, b) => asNumber(a.position) - asNumber(b.position),
  );
  const cards = (board.data?.rows ?? []) as CrmRow[];
  const canWrite = hasPermission(area.write!);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-1">
          <label className="text-sm" htmlFor="pipeline-select">
            Pipeline
          </label>
          <select
            id="pipeline-select"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={activePipeline}
            onChange={(event) => setPipelineId(event.target.value)}
          >
            {((pipelines.data?.rows ?? []) as CrmRow[]).map((row) => (
              <option key={row.id} value={row.id}>
                {str(row.name)}
              </option>
            ))}
          </select>
        </div>
        {canWrite ? <Button onClick={() => setEditing(null)}>Nova oportunidade</Button> : null}
      </div>

      <ResultState
        loading={pipelines.isLoading || stages.isLoading || board.isLoading}
        error={pipelines.error ?? stages.error ?? board.error}
        empty={!columns.length}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((stage) => {
            const inStage = cards.filter((card) => card.stage_id === stage.id);
            const total = inStage.reduce((sum, card) => sum + asNumber(card.estimated_value), 0);
            const weighted = inStage.reduce(
              (sum, card) =>
                sum + (asNumber(card.estimated_value) * asNumber(card.probability)) / 100,
              0,
            );
            return (
              <section
                key={stage.id}
                onDragOver={(event) => {
                  if (dragging) event.preventDefault();
                }}
                onDrop={() => {
                  setDragging(null);
                }}
                className="w-72 shrink-0 space-y-3 rounded-lg bg-muted/40 p-3"
              >
                <header className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading text-sm font-semibold">{str(stage.name)}</h3>
                    <span className="text-xs text-muted-foreground">{inStage.length}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {money(total)} · ponderado {money(weighted)} · prob. {str(stage.probability)}%
                  </p>
                </header>
                {inStage.map((card) => (
                  <Card key={card.id} className="cursor-grab active:cursor-grabbing">
                    <CardContent className="space-y-1 pt-4">
                      <button
                        type="button"
                        draggable
                        onDragStart={() => setDragging(card)}
                        onDragEnd={() => setDragging(null)}
                        className="w-full space-y-1 text-left"
                      >
                        <span className="block font-medium">{str(card.title)}</span>
                        <span className="block text-sm text-muted-foreground">
                          {money(card.estimated_value)} · {percent(card.probability)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {str(card.expected_close_date)}
                        </span>
                      </button>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button asChild size="sm" variant="outline">
                          <a href={`/comercial/oportunidades/${card.id}`}>Abrir</a>
                        </Button>
                        {canWrite ? (
                          <Button size="sm" variant="outline" onClick={() => setEditing(card)}>
                            Editar
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {!inStage.length ? (
                  <p className="text-xs text-muted-foreground">Nenhuma oportunidade nesta etapa.</p>
                ) : null}
              </section>
            );
          })}
        </div>
      </ResultState>

      <p className="text-xs text-muted-foreground">
        Soltar um cartão numa coluna não move a oportunidade: a troca de etapa é registrada em
        "Abrir", porque o servidor grava histórico e recalcula a probabilidade da nova etapa.
      </p>

      {editing !== undefined && canWrite ? (
        <RecordDialog
          org={org}
          area={area}
          record={editing}
          title={editing ? "Editar oportunidade" : "Nova oportunidade"}
          description="O servidor recusa alteração de oportunidade já existente: mudança de etapa, encerramento e itens são transições com histórico. A criação registra a etapa inicial e a primeira entrada do histórico."
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void client.invalidateQueries({ queryKey: ["crm"] });
          }}
        />
      ) : null}
    </>
  );
}

/** Lista completa com as mesmas informações do quadro, em colunas. */
function OpportunityTable({ org }: { org: string }) {
  return (
    <OpportunityRows
      org={org}
      filters={{ status: "OPEN" }}
      title="Oportunidades abertas"
      empty="Nenhuma oportunidade aberta."
    />
  );
}

function OpportunityRows({
  org,
  filters,
  title,
  empty,
}: {
  org: string;
  filters: Record<string, string>;
  title: string;
  empty: string;
}) {
  const { hasPermission } = useOrganization();
  const query = useCrmQuery(org, "opportunities", filters, 1);
  const rows = (query.data?.rows ?? []) as CrmRow[];
  return (
    <div className="space-y-3">
      <h3 className="font-heading text-base font-semibold">{title}</h3>
      <ResultState loading={query.isLoading} error={query.error} empty={!rows.length}>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="space-y-0.5">
                <a
                  href={`/comercial/oportunidades/${row.id}`}
                  className="font-medium hover:underline"
                >
                  {str(row.title)}
                </a>
                <p className="text-sm text-muted-foreground">
                  {money(row.estimated_value)} · ponderado{" "}
                  {money((asNumber(row.estimated_value) * asNumber(row.probability)) / 100)} ·{" "}
                  {percent(row.probability)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={row.status} kind="status" />
                {hasPermission("opportunities.close") ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/comercial/oportunidades/${row.id}`}>Transições</a>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{query.data?.total ?? 0} registros</p>
      </ResultState>
    </div>
  );
}

/**
 * Detalhe da oportunidade: itens, histórico de etapas e as transições possíveis.
 * A edição fica fora de propósito — o servidor recusa alteração de registro
 * existente, e oferecer um formulário que sempre falharia seria enganoso.
 */
export function OpportunityDetailPage({ id }: { id: string }) {
  return (
    <Shell title="Comercial · Oportunidade" permission={area.permission}>
      {(org) => <OpportunityDetail org={org} id={id} />}
    </Shell>
  );
}

function OpportunityDetail({ org, id }: { org: string; id: string }) {
  const { hasPermission } = useOrganization();
  const client = useQueryClient();
  const rows = useCrmQuery(org, "opportunities", { id }, 1);
  const opportunity = (rows.data?.rows ?? [])[0] as CrmRow | undefined;
  const items = useCrmQuery(org, "opportunity_items", { opportunity_id: id });
  const history = useCrmQuery(org, "stage_history", { opportunity_id: id });
  const [moving, setMoving] = useState(false);
  const [closing, setClosing] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{str(opportunity?.title)}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={opportunity?.status} kind="status" />
          {opportunity?.status === "OPEN" && hasPermission("opportunities.update") ? (
            <Button onClick={() => setMoving(true)}>Mover etapa</Button>
          ) : null}
          {opportunity?.status === "OPEN" && hasPermission("opportunities.close") ? (
            <Button variant="outline" onClick={() => setClosing(true)}>
              Encerrar
            </Button>
          ) : null}
        </div>
      </div>

      <ResultState loading={rows.isLoading} error={rows.error} empty={!opportunity}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Valor estimado" value={money(opportunity?.estimated_value)} />
          <Stat label="Probabilidade" value={percent(opportunity?.probability)} />
          <Stat label="Previsão" value={str(opportunity?.expected_close_date)} />
          <Stat label="Etapa" value={opportunityStatusLabel(str(opportunity?.status))} />
        </div>
      </ResultState>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Itens estimados</h3>
        <p className="text-xs text-muted-foreground">
          Itens de oportunidade são estimativas de negociação. Não reservam estoque, não geram
          contas a receber e não entram em preço oficial — a proposta é que usa a tabela de preços
          vigente.
        </p>
        <ResultState
          loading={items.isLoading}
          error={items.error}
          empty={!(items.data?.rows ?? []).length}
        >
          <ul className="space-y-1 text-sm">
            {((items.data?.rows ?? []) as CrmRow[]).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b py-1">
                <span>{str(item.notes ?? item.variant_id)}</span>
                <span className="tabular-nums">
                  {asNumber(item.estimated_quantity)} × {money(item.estimated_unit_price)} ={" "}
                  {money(item.estimated_total)}
                </span>
              </li>
            ))}
          </ul>
        </ResultState>
      </section>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Histórico de etapas</h3>
        <ResultState
          loading={history.isLoading}
          error={history.error}
          empty={!(history.data?.rows ?? []).length}
        >
          <ol className="space-y-2 text-sm">
            {((history.data?.rows ?? []) as CrmRow[]).map((entry) => (
              <li key={entry.id} className="rounded-lg border p-3">
                <p>
                  {str((entry.previous_stage as Record<string, unknown> | null)?.name ?? "Criação")}{" "}
                  → {str((entry.new_stage as Record<string, unknown> | null)?.name ?? "—")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {str(entry.moved_at ?? entry.created_at)}
                  {entry.reason ? ` · ${str(entry.reason)}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </ResultState>
      </section>

      {moving ? (
        <StageDialog
          org={org}
          id={id}
          onClose={() => setMoving(false)}
          onSaved={() => {
            setMoving(false);
            void client.invalidateQueries({ queryKey: ["crm"] });
          }}
        />
      ) : null}
      {closing ? (
        <CloseDialog
          org={org}
          id={id}
          onClose={() => setClosing(false)}
          onSaved={() => {
            setClosing(false);
            void client.invalidateQueries({ queryKey: ["crm"] });
          }}
        />
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

/**
 * Mudança de etapa. A etapa é Validada contra o pipeline da oportunidade pelo
 * servidor; a razão é obrigatória e fica no histórico, porque um funil sem motivo
 * não é auditável.
 */
function StageDialog({
  org,
  id,
  onClose,
  onSaved,
}: {
  org: string;
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useServerFn(actCrm);
  const [stageId, setStageId] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());

  const move = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "opportunity",
          id,
          action: "stage",
          values: { stage_id: stageId, reason },
          key,
        },
      });
    },
    onSuccess: () => {
      toast.success("Etapa alterada. Probabilidade recalculada pelo servidor.");
      onSaved();
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mover etapa</DialogTitle>
          <DialogDescription>
            A nova etapa recalcula a probabilidade a partir do valor configurado na etapa. A razão é
            gravada no histórico e é obrigatória.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Picker
            org={org}
            kind="stages"
            value={stageId}
            onChange={setStageId}
            label="Nova etapa"
          />
          <div className="space-y-1">
            <label className="text-sm" htmlFor="stage-reason">
              Razão
            </label>
            <Textarea
              id="stage-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={move.isPending || !stageId || !reason.trim()}
            onClick={() => move.mutate()}
          >
            {move.isPending ? "Movendo..." : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Encerramento. Ganhar fecha a negociação; perder exige motivo cadastrado do tipo
 * LOSS. Nenhum dos dois cria pedido, reserva ou recebível — o MASTER 012 não
 * conecta a venda à ordem de produção.
 */
function CloseDialog({
  org,
  id,
  onClose,
  onSaved,
}: {
  org: string;
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useServerFn(actCrm);
  const [outcome, setOutcome] = useState<"WON" | "LOST" | "CANCELED">("WON");
  const [lossReason, setLossReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());

  const close = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "opportunity",
          id,
          action: outcome,
          values: outcome === "LOST" ? { loss_reason_id: lossReason } : {},
          key,
        },
      });
    },
    onSuccess: () => {
      toast.success("Oportunidade encerrada.");
      onSaved();
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Encerrar oportunidade</DialogTitle>
          <DialogDescription>
            O encerramento é definitivo: o servidor não reabre uma oportunidade encerrada. Para
            retomar o trabalho, crie outra oportunidade.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm" htmlFor="close-outcome">
              Resultado
            </label>
            <select
              id="close-outcome"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as typeof outcome)}
            >
              {(["WON", "LOST", "CANCELED"] as const).map((value) => (
                <option key={value} value={value}>
                  {OPPORTUNITY_STATUS[value]}
                </option>
              ))}
            </select>
          </div>
          {outcome === "LOST" ? (
            <Picker
              org={org}
              kind="reasons"
              value={lossReason}
              onChange={setLossReason}
              label="Motivo da perda"
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={outcome === "WON" ? "default" : "destructive"}
            disabled={close.isPending || (outcome === "LOST" && !lossReason)}
            onClick={() => close.mutate()}
          >
            {close.isPending ? "Encerrando..." : "Encerrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
