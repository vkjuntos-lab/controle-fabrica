// Onda 2 — Filas de atendimento + métricas TME/TMA.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  listQueues,
  upsertQueue,
  deleteQueue,
  getQueueMetrics,
} from "@/lib/pdv-queues.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Pencil, Trash2, Clock3, Users, CheckCircle2, AlertTriangle, Timer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/filas")({
  component: FilasPage,
  head: () => ({
    meta: [
      { title: "Filas de Atendimento · KS MultiMake" },
      { name: "description", content: "Filas, SLA e métricas TME/TMA por loja." },
    ],
  }),
});

type Queue = {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  color: string;
  sla_first_response_seconds: number;
  sla_resolution_seconds: number;
  is_default: boolean;
  active: boolean;
};

function fmtDur(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function FilasPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId;
  const qc = useQueryClient();

  const listFn = useServerFn(listQueues);
  const upsertFn = useServerFn(upsertQueue);
  const deleteFn = useServerFn(deleteQueue);
  const metricsFn = useServerFn(getQueueMetrics);

  const queuesQuery = useQuery({
    queryKey: ["queues", storeId],
    queryFn: () => listFn({ data: { store_id: storeId! } }),
    enabled: !!storeId,
  });

  const metricsQuery = useQuery({
    queryKey: ["queue-metrics", storeId],
    queryFn: () => metricsFn({ data: { store_id: storeId! } }),
    enabled: !!storeId,
    refetchInterval: 15000,
  });

  const [editing, setEditing] = React.useState<Queue | null>(null);
  const [open, setOpen] = React.useState(false);

  const upsertMut = useMutation({
    mutationFn: (payload: any) => upsertFn({ data: payload }),
    onSuccess: () => {
      toast.success("Fila salva");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["queues", storeId] });
      qc.invalidateQueries({ queryKey: ["queue-metrics", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar fila"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fila removida");
      qc.invalidateQueries({ queryKey: ["queues", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  const queues = (queuesQuery.data?.queues ?? []) as Queue[];
  const totals = metricsQuery.data?.totals;
  const perQueue = (metricsQuery.data?.metrics ?? []) as Array<any>;

  const metricsByQueue = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const m of perQueue) map.set(m.queue_id ?? "__none__", m);
    return map;
  }, [perQueue]);

  const unassignedMetrics = metricsByQueue.get("__none__");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Filas de Atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Organize as conversas por time ou assunto e acompanhe SLA, TME e TMA das últimas 24h.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova fila
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Abertas" value={String(totals?.open ?? 0)} />
        <KpiCard icon={<Clock3 className="h-4 w-4" />} label="Aguardando" value={String(totals?.waiting ?? 0)} highlight={Number(totals?.waiting ?? 0) > 0} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Atendidas" value={String(totals?.answered ?? 0)} />
        <KpiCard icon={<Timer className="h-4 w-4" />} label="TME médio" value={fmtDur(totals?.tme_seconds)} />
        <KpiCard icon={<Timer className="h-4 w-4" />} label="TMA médio" value={fmtDur(totals?.tma_seconds)} />
      </div>

      {Number(totals?.sla_breached ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {totals?.sla_breached} conversa(s) com SLA estourado nas últimas 24h.
        </div>
      )}

      <div className="space-y-3">
        {queuesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando filas…</div>
        ) : queues.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma fila cadastrada ainda. Crie a primeira para começar a organizar o atendimento.
            </CardContent>
          </Card>
        ) : (
          queues.map((q) => {
            const m = metricsByQueue.get(q.id);
            return (
              <Card key={q.id}>
                <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: q.color }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{q.name}</span>
                        {q.is_default && <Badge variant="secondary">Padrão</Badge>}
                        {!q.active && <Badge variant="outline">Inativa</Badge>}
                      </div>
                      {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        SLA resposta {fmtDur(q.sla_first_response_seconds)} · resolução {fmtDur(q.sla_resolution_seconds)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center text-xs md:text-sm">
                    <MetricMini label="Abertas" value={m?.open_count ?? 0} />
                    <MetricMini label="Aguardando" value={m?.waiting_count ?? 0} tone={Number(m?.waiting_count ?? 0) > 0 ? "warn" : undefined} />
                    <MetricMini label="TME" value={fmtDur(m?.tme_seconds)} />
                    <MetricMini label="TMA" value={fmtDur(m?.tma_seconds)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(q); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Remover a fila "${q.name}"?`)) delMut.mutate(q.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {unassignedMetrics && (Number(unassignedMetrics.open_count ?? 0) > 0) && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-full bg-muted" />
                <div>
                  <div className="font-medium">Sem fila</div>
                  <p className="text-xs text-muted-foreground">Conversas ainda não atribuídas a nenhuma fila.</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center text-xs md:text-sm">
                <MetricMini label="Abertas" value={unassignedMetrics.open_count ?? 0} />
                <MetricMini label="Aguardando" value={unassignedMetrics.waiting_count ?? 0} />
                <MetricMini label="TME" value={fmtDur(unassignedMetrics.tme_seconds)} />
                <MetricMini label="TMA" value={fmtDur(unassignedMetrics.tma_seconds)} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <QueueDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        storeId={storeId ?? null}
        onSubmit={(payload) => upsertMut.mutate(payload)}
        submitting={upsertMut.isPending}
      />
    </div>
  );
}

function KpiCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function MetricMini({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div>
      <div className={`font-semibold ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function QueueDialog({
  open, onOpenChange, initial, storeId, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Queue | null;
  storeId: string | null;
  onSubmit: (payload: any) => void;
  submitting: boolean;
}) {
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    color: "#8D6E63",
    sla_first_response_seconds: 300,
    sla_resolution_seconds: 3600,
    is_default: false,
    active: true,
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        description: initial?.description ?? "",
        color: initial?.color ?? "#8D6E63",
        sla_first_response_seconds: initial?.sla_first_response_seconds ?? 300,
        sla_resolution_seconds: initial?.sla_resolution_seconds ?? 3600,
        is_default: initial?.is_default ?? false,
        active: initial?.active ?? true,
      });
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar fila" : "Nova fila"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Vendas · Instagram" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cor</Label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-full p-1" />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} /> Fila padrão
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Ativa
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SLA de 1ª resposta (segundos)</Label>
              <Input type="number" min={30} value={form.sla_first_response_seconds}
                onChange={(e) => setForm({ ...form, sla_first_response_seconds: Number(e.target.value) })} />
            </div>
            <div>
              <Label>SLA de resolução (segundos)</Label>
              <Input type="number" min={60} value={form.sla_resolution_seconds}
                onChange={(e) => setForm({ ...form, sla_resolution_seconds: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={submitting || !form.name.trim() || !storeId}
            onClick={() => onSubmit({
              id: initial?.id,
              store_id: storeId,
              name: form.name.trim(),
              description: form.description || null,
              color: form.color,
              sla_first_response_seconds: form.sla_first_response_seconds,
              sla_resolution_seconds: form.sla_resolution_seconds,
              is_default: form.is_default,
              active: form.active,
            })}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
