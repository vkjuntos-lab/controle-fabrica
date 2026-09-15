import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  getBellaDashboard,
  listBellaLeads,
  updateBellaLead,
  listBellaCampaignRuns,
  triggerBellaCampaignsTick,
  listBellaPrompts,
  saveBellaPrompt,
  listBellaKnowledge,
  saveBellaKnowledge,
  deleteBellaKnowledge,
} from "@/lib/pdv-bella.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, RefreshCw, Send, Users, ShoppingBag, MessageCircle, Megaphone, BookOpen, PenLine, Trash2, PlayCircle } from "lucide-react";
import { Instagram } from "@/components/icons";
import { toast } from "sonner";
import { useEffect } from "react";

export const Route = createFileRoute("/pdv/agente-ia")({
  component: BellaAgentPage,
  head: () => ({
    meta: [
      { title: "Bella IA — Agente Omnichannel | KS MultiMake" },
      { name: "description", content: "Painel da Bella IA: dashboard, leads, campanhas e treinamento do agente de vendas WhatsApp + Instagram." },
    ],
  }),
});

const fmt = (d?: string | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function BellaAgentPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const qc = useQueryClient();
  const enabled = !!storeId;

  const dashQ = useQuery({
    queryKey: ["bella-dash", storeId], enabled,
    queryFn: () => getBellaDashboard({ data: { store_id: storeId! } }),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Bella IA</h1>
          <Badge variant="secondary">Agente Omnichannel</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["bella-dash"] })}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      {!enabled && (
        <Card><CardContent className="pt-4 text-sm text-muted-foreground">Selecione uma loja para começar.</CardContent></Card>
      )}

      {enabled && (
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="simulador">Simulador</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="prompts">Treinamento IA</TabsTrigger>
            <TabsTrigger value="conhecimento">Conhecimento</TabsTrigger>
            <TabsTrigger value="autorrespostas">Autorrespostas</TabsTrigger>
            <TabsTrigger value="supervisor">Supervisor</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab dash={dashQ.data} /></TabsContent>
          <TabsContent value="simulador"><SimulatorTab storeId={storeId!} /></TabsContent>
          <TabsContent value="leads"><LeadsTab storeId={storeId!} /></TabsContent>
          <TabsContent value="campanhas"><CampaignsTab storeId={storeId!} /></TabsContent>
          <TabsContent value="prompts"><PromptsTab storeId={storeId!} /></TabsContent>
          <TabsContent value="conhecimento"><KnowledgeTab storeId={storeId!} /></TabsContent>
          <TabsContent value="autorrespostas"><AutoResponseTab storeId={storeId!} /></TabsContent>
          <TabsContent value="supervisor"><SupervisorTab storeId={storeId!} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ---------------- Onda 7 — Supervisor de IA ---------------- */
import {
  getSupervisorKpis,
  listReviews,
  getReviewMessages,
  submitReview,
  promoteToKnowledge,
} from "@/lib/pdv-supervisor.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, ThumbsUp, GraduationCap, AlertTriangle, Star } from "lucide-react";

type ReviewStatus = "pending" | "approved" | "needs_training" | "escalated" | "all";

function SupervisorTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ReviewStatus>("pending");
  const [selected, setSelected] = useState<any | null>(null);

  const kpisQ = useQuery({
    queryKey: ["bella-sup-kpis", storeId],
    queryFn: () => getSupervisorKpis({ data: { store_id: storeId, days: 30 } }),
    refetchInterval: 60_000,
  });
  const revsQ = useQuery({
    queryKey: ["bella-sup-revs", storeId, statusFilter],
    queryFn: () => listReviews({ data: { store_id: storeId, status: statusFilter } }),
  });

  const submitMut = useMutation({
    mutationFn: (v: { review_id: string; status: "approved" | "needs_training" | "escalated"; reviewer_notes?: string; csat_score?: number | null }) =>
      submitReview({ data: v }),
    onSuccess: () => {
      toast.success("Revisão registrada");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["bella-sup-revs", storeId] });
      qc.invalidateQueries({ queryKey: ["bella-sup-kpis", storeId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const promoteMut = useMutation({
    mutationFn: (v: { review_id: string; topic: string; question: string; answer: string }) =>
      promoteToKnowledge({ data: v }),
    onSuccess: () => {
      toast.success("Adicionado à Base de Conhecimento");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["bella-sup-revs", storeId] });
      qc.invalidateQueries({ queryKey: ["bella-sup-kpis", storeId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao promover"),
  });

  const k = kpisQ.data?.kpis;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Kpi label="Total (30d)" value={k?.total ?? "—"} />
        <Kpi label="Pendentes" value={k?.pending ?? "—"} hint="aguardando revisão" />
        <Kpi label="Escalonadas" value={k?.escalated ?? "—"} hint="handoff automático" />
        <Kpi label="Precisam retreino" value={k?.needs_training ?? "—"} />
        <Kpi label="CSAT médio" value={k?.csat_avg ?? "—"} hint={k?.csat_count ? `${k.csat_count} respostas` : ""} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Revisões da Bella</CardTitle>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReviewStatus)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="escalated">Escalonadas</SelectItem>
              <SelectItem value="needs_training">Precisam retreino</SelectItem>
              <SelectItem value="approved">Aprovadas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CSAT</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(revsQ.data?.reviews ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.conversation?.wa_name ?? r.conversation?.phone ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.conversation?.channel ?? "wa"}</Badge></TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {r.escalation_reason ?? r.auto_flag_reason ?? "—"}
                    </TableCell>
                    <TableCell><ReviewBadge status={r.status} /></TableCell>
                    <TableCell>{r.csat_score ? <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{r.csat_score}</span> : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(r)}>Revisar</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {revsQ.data?.reviews?.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Nada por aqui — a Bella está indo bem 💜</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <ReviewDialog
        review={selected}
        onClose={() => setSelected(null)}
        onSubmit={(v) => submitMut.mutate({ review_id: selected.id, ...v })}
        onPromote={(v) => promoteMut.mutate({ review_id: selected.id, ...v })}
        submitting={submitMut.isPending || promoteMut.isPending}
      />
    </div>
  );
}

function ReviewBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-800", Icon: AlertTriangle },
    escalated: { label: "Escalonada", cls: "bg-rose-500/15 text-rose-800", Icon: AlertTriangle },
    needs_training: { label: "Retreino", cls: "bg-sky-500/15 text-sky-800", Icon: GraduationCap },
    approved: { label: "Aprovada", cls: "bg-emerald-500/15 text-emerald-800", Icon: ThumbsUp },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground", Icon: AlertTriangle };
  const I = m.Icon;
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${m.cls}`}><I className="h-3 w-3" /> {m.label}</span>;
}

function ReviewDialog({
  review, onClose, onSubmit, onPromote, submitting,
}: {
  review: any | null;
  onClose: () => void;
  onSubmit: (v: { status: "approved" | "needs_training" | "escalated"; reviewer_notes?: string; csat_score?: number | null }) => void;
  onPromote: (v: { topic: string; question: string; answer: string }) => void;
  submitting: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [csat, setCsat] = useState<string>("");
  const [showPromote, setShowPromote] = useState(false);
  const [kTopic, setKTopic] = useState("");
  const [kQuestion, setKQuestion] = useState("");
  const [kAnswer, setKAnswer] = useState("");

  const msgsQ = useQuery({
    queryKey: ["bella-sup-msgs", review?.conversation_id],
    enabled: !!review?.conversation_id,
    queryFn: () => getReviewMessages({ data: { conversation_id: review.conversation_id } }),
  });

  if (!review) return null;
  const csatNum = csat ? Number(csat) : null;

  return (
    <Dialog open={!!review} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Revisar conversa — {review.conversation?.wa_name ?? review.conversation?.phone ?? "cliente"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Transcrição</div>
            <ScrollArea className="h-72 rounded-md border p-3 bg-muted/30">
              <div className="space-y-2 text-sm">
                {(msgsQ.data?.messages ?? []).map((m: any, i: number) => (
                  <div key={i} className={`rounded-md px-3 py-2 ${m.direction === "inbound" ? "bg-background" : "bg-primary/10"}`}>
                    <div className="text-[10px] uppercase text-muted-foreground">{m.direction === "inbound" ? "Cliente" : "Bella"} · {fmt(m.created_at)}</div>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                ))}
                {!msgsQ.data?.messages?.length && <div className="text-xs text-muted-foreground">Sem mensagens.</div>}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-3">
            {review.auto_flag_reason && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-900">
                Auto-flag: <b>{review.auto_flag_reason}</b> {review.escalation_reason ? `· ${review.escalation_reason}` : ""}
              </div>
            )}
            <div>
              <Label>Notas do supervisor</Label>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que a Bella acertou/errou? O que corrigir?" />
            </div>
            <div>
              <Label>CSAT (1-5, opcional)</Label>
              <Input inputMode="numeric" value={csat} onChange={(e) => setCsat(e.target.value.replace(/[^1-5]/g, "").slice(0, 1))} placeholder="ex.: 4" />
            </div>

            {!showPromote ? (
              <Button variant="outline" size="sm" onClick={() => setShowPromote(true)}>
                <BookOpen className="mr-2 h-4 w-4" /> Promover para Base de Conhecimento
              </Button>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-xs font-medium">Nova entrada no Conhecimento</div>
                <Input placeholder="Tópico (ex.: Devolução)" value={kTopic} onChange={(e) => setKTopic(e.target.value)} />
                <Input placeholder="Pergunta típica" value={kQuestion} onChange={(e) => setKQuestion(e.target.value)} />
                <Textarea rows={4} placeholder="Resposta correta que a Bella deve dar" value={kAnswer} onChange={(e) => setKAnswer(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowPromote(false)}>Cancelar</Button>
                  <Button size="sm" disabled={submitting || !kTopic || !kQuestion || !kAnswer}
                    onClick={() => onPromote({ topic: kTopic, question: kQuestion, answer: kAnswer })}>
                    Salvar & aprovar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button variant="outline" disabled={submitting}
            onClick={() => onSubmit({ status: "needs_training", reviewer_notes: notes || undefined, csat_score: csatNum })}>
            <GraduationCap className="mr-2 h-4 w-4" /> Marcar retreino
          </Button>
          <Button variant="outline" disabled={submitting}
            onClick={() => onSubmit({ status: "escalated", reviewer_notes: notes || undefined, csat_score: csatNum })}>
            <AlertTriangle className="mr-2 h-4 w-4" /> Escalonar
          </Button>
          <Button disabled={submitting}
            onClick={() => onSubmit({ status: "approved", reviewer_notes: notes || undefined, csat_score: csatNum })}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function DashboardTab({ dash }: { dash: any }) {
  const k = dash?.kpis;
  const ch = dash?.channels;
  const stages = dash?.leads_by_stage ?? {};
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Conversas (7d)" value={k?.conversations_7d ?? 0} hint={`WA ${ch?.whatsapp ?? 0} · IG ${ch?.instagram ?? 0}`} />
        <Kpi label="Mensagens (24h)" value={k?.messages_24h ?? 0} />
        <Kpi label="Leads novos (7d)" value={k?.leads_7d ?? 0} />
        <Kpi label="Handoffs ativos" value={k?.handoffs_active ?? 0} />
        <Kpi label="Pedidos (7d)" value={k?.orders_7d ?? 0} hint={`${k?.orders_paid_7d ?? 0} pagos`} />
        <Kpi label="GMV pago (7d)" value={brl(k?.gmv_7d ?? 0)} />
        <Kpi label="Campanhas (7d)" value={k?.campaigns_7d ?? 0} hint={`${k?.campaigns_ok ?? 0} entregues`} />
        <Kpi label="Taxa conversão leads→pedidos" value={
          k?.leads_7d ? `${Math.round(((k?.orders_7d ?? 0) / k.leads_7d) * 100)}%` : "—"
        } />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Leads por estágio (7d)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["new","qualified","negotiating","won","lost","handoff"].map((s) => (
              <Badge key={s} variant="outline" className="text-sm">
                {s}: {stages[s] ?? 0}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Canais ativos</CardTitle></CardHeader>
        <CardContent className="flex gap-6 text-sm">
          <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp: <strong>{ch?.whatsapp ?? 0}</strong></div>
          <div className="flex items-center gap-2"><Instagram className="h-4 w-4 text-pink-600" /> Instagram: <strong>{ch?.instagram ?? 0}</strong></div>
        </CardContent>
      </Card>
    </div>
  );
}

const STAGES = ["new","qualified","negotiating","won","lost","handoff"] as const;

function LeadsTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bella-leads", storeId],
    queryFn: () => listBellaLeads({ data: { store_id: storeId } }),
    refetchInterval: 20000,
  });
  const m = useMutation({
    mutationFn: (v: { lead_id: string; stage: (typeof STAGES)[number] }) => updateBellaLead({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bella-leads", storeId] }); toast.success("Lead atualizado"); },
  });

  const leads = q.data?.leads ?? [];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Leads ({leads.length})</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[560px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead><TableHead>Canal</TableHead><TableHead>Interesse</TableHead>
                <TableHead>Estágio</TableHead><TableHead>Última interação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell><div className="font-medium">{l.name ?? "—"}</div><div className="text-xs text-muted-foreground">{l.contact}</div></TableCell>
                  <TableCell><Badge variant={l.channel === "instagram" ? "secondary" : "outline"}>{l.channel}</Badge></TableCell>
                  <TableCell className="max-w-[240px] truncate">{l.interest ?? "—"}</TableCell>
                  <TableCell>
                    <Select value={l.stage} onValueChange={(v) => m.mutate({ lead_id: l.id, stage: v as any })}>
                      <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">{fmt(l.last_interaction_at)}</TableCell>
                </TableRow>
              ))}
              {!leads.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum lead ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function CampaignsTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bella-camps", storeId],
    queryFn: () => listBellaCampaignRuns({ data: { store_id: storeId } }),
    refetchInterval: 20000,
  });
  const trigger = useMutation({
    mutationFn: () => triggerBellaCampaignsTick({ data: undefined as any }),
    onSuccess: (r: any) => {
      toast.success(`Tick executado: ${r?.sent ?? 0}/${r?.total ?? 0} enviadas`);
      qc.invalidateQueries({ queryKey: ["bella-camps", storeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const runs = q.data?.runs ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" /> Campanhas ({runs.length})</CardTitle>
        <Button size="sm" onClick={() => trigger.mutate()} disabled={trigger.isPending}>
          <PlayCircle className="mr-2 h-4 w-4" /> Rodar agora
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[560px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead><TableHead>Canal</TableHead><TableHead>Estágio</TableHead>
                <TableHead>Cupom</TableHead><TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead><TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.campaign_type}</Badge></TableCell>
                  <TableCell>{r.channel}</TableCell>
                  <TableCell>{r.stage ?? "—"}</TableCell>
                  <TableCell>{r.coupon_code ?? "—"}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{r.message_text}</TableCell>
                  <TableCell>{r.send_ok ? <Badge className="bg-emerald-100 text-emerald-800">enviada</Badge> : <Badge variant="destructive">falhou</Badge>}</TableCell>
                  <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                </TableRow>
              ))}
              {!runs.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma campanha rodada ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function PromptsTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bella-prompts", storeId],
    queryFn: () => listBellaPrompts({ data: { store_id: storeId } }),
  });
  const [editing, setEditing] = useState<any>(null);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [active, setActive] = useState(false);

  const openNew = () => { setEditing({}); setTitle(""); setBody(""); setActive(false); };
  const openEdit = (p: any) => { setEditing(p); setTitle(p.title); setBody(p.body); setActive(p.is_active); };

  const save = useMutation({
    mutationFn: () => saveBellaPrompt({ data: { id: editing?.id, store_id: storeId, title, body, is_active: active } }),
    onSuccess: () => {
      toast.success("Prompt salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["bella-prompts", storeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Prompts</CardTitle>
          <Button size="sm" onClick={openNew}><PenLine className="mr-2 h-4 w-4" /> Novo</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(q.data?.prompts ?? []).map((p: any) => (
            <div key={p.id} className="rounded border p-3 hover:bg-accent cursor-pointer" onClick={() => openEdit(p)}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{p.title}</div>
                {p.is_active && <Badge className="bg-emerald-100 text-emerald-800">ativo</Badge>}
              </div>
              <div className="text-xs text-muted-foreground truncate">{p.body}</div>
              <div className="text-xs text-muted-foreground mt-1">v{p.version} · {fmt(p.updated_at)}</div>
            </div>
          ))}
          {!(q.data?.prompts ?? []).length && <div className="text-sm text-muted-foreground">Nenhum prompt salvo. O padrão embutido está em uso.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{editing?.id ? "Editar prompt" : editing ? "Novo prompt" : "Selecione um prompt"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div><Label>Corpo do prompt (system message)</Label>
                <Textarea rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
              </div>
              <div className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} /><Label>Ativo</Label></div>
              <div className="flex gap-2">
                <Button onClick={() => save.mutate()} disabled={!title || body.length < 10 || save.isPending}>Salvar</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            </>
          ) : <div className="text-sm text-muted-foreground">Clique num prompt à esquerda ou em "Novo".</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function KnowledgeTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bella-kb", storeId],
    queryFn: () => listBellaKnowledge({ data: { store_id: storeId } }),
  });
  const [form, setForm] = useState({ id: "", topic: "", question: "", answer: "", active: true });
  const reset = () => setForm({ id: "", topic: "", question: "", answer: "", active: true });
  const save = useMutation({
    mutationFn: () => saveBellaKnowledge({ data: {
      id: form.id || undefined, store_id: storeId,
      topic: form.topic, question: form.question || null, answer: form.answer, active: form.active,
    }}),
    onSuccess: () => { toast.success("Conhecimento salvo"); reset(); qc.invalidateQueries({ queryKey: ["bella-kb", storeId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteBellaKnowledge({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["bella-kb", storeId] }); },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" /> Base de conhecimento</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[520px] pr-2">
            <div className="space-y-2">
              {(q.data?.items ?? []).map((it: any) => (
                <div key={it.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{it.topic}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setForm({ id: it.id, topic: it.topic, question: it.question ?? "", answer: it.answer, active: it.active })}>
                        <PenLine className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(it.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {it.question && <div className="text-xs text-muted-foreground mt-1">Q: {it.question}</div>}
                  <div className="text-sm mt-1 whitespace-pre-wrap">{it.answer}</div>
                </div>
              ))}
              {!(q.data?.items ?? []).length && <div className="text-sm text-muted-foreground">Nenhum item cadastrado.</div>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{form.id ? "Editar item" : "Novo item"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Tópico</Label><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Ex.: Trocas e devoluções" /></div>
          <div><Label>Pergunta (opcional)</Label><Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Ex.: Vocês trocam produto aberto?" /></div>
          <div><Label>Resposta</Label><Textarea rows={8} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Resposta que a Bella pode usar" /></div>
          <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Ativo</Label></div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={!form.topic || !form.answer || save.isPending}>Salvar</Button>
            {form.id && <Button variant="outline" onClick={reset}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Simulador de conversa (dry-run) ---------------- */
import { useServerFn } from "@tanstack/react-start";
import { simulateBellaTurn, type SimMsg, type SimCartItem } from "@/lib/pdv-bella-simulator.functions";
import { Smartphone, Trash2 as Trash2Icon, Zap } from "lucide-react";

const SUGGEST_QUICK = [
  "Oi! Você tem base para pele oleosa?",
  "Quanto custa o batom da Ruby Rose?",
  "Quero ver perfumes até R$ 100",
  "Meu tipo de pele é mista, o que indica?",
  "Pode fechar meu pedido, quero pagar por pix",
];

const MODELS = [
  { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash (rápido)" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (qualidade)" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini" },
  { id: "openai/gpt-5.5", label: "GPT-5.5 (top)" },
];

function SimulatorTab({ storeId }: { storeId: string }) {
  const runSim = useServerFn(simulateBellaTurn);
  const [msgs, setMsgs] = useState<SimMsg[]>([
    { role: "assistant", content: "Oi linda! 💜 Sou a Bella. Como posso te ajudar hoje?" },
  ]);
  const [cart, setCart] = useState<SimCartItem[]>([]);
  const [intent, setIntent] = useState<string>("discovery");
  const [trace, setTrace] = useState<Array<{ name: string; input: any; output: any }>>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(0.7);
  const [model, setModel] = useState(MODELS[0].id);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next: SimMsg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const out = await runSim({
        data: { store_id: storeId, messages: next, cart, temperature, model },
      });
      if (!out.ok) {
        setErr(out.error);
        return;
      }
      setMsgs((m) => [...m, { role: "assistant", content: out.reply }]);
      setCart(out.cart);
      setIntent(out.intent);
      setTrace(out.toolTrace);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha na simulação");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMsgs([{ role: "assistant", content: "Oi linda! 💜 Sou a Bella. Como posso te ajudar hoje?" }]);
    setCart([]);
    setIntent("discovery");
    setTrace([]);
    setErr(null);
  }

  const cartTotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(320px,380px)_1fr]">
      {/* Phone frame */}
      <div className="mx-auto w-full max-w-[380px]">
        <div className="overflow-hidden rounded-[2.5rem] border-8 border-neutral-800 bg-neutral-800 shadow-2xl">
          <div className="flex items-center gap-2 bg-emerald-700 px-4 py-3 text-white">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold">B</div>
            <div className="flex-1 leading-tight">
              <div className="text-sm font-semibold">Bella IA</div>
              <div className="text-[10px] opacity-80">simulação · online</div>
            </div>
            <Smartphone className="h-4 w-4 opacity-80" />
          </div>
          <div
            className="h-[440px] space-y-2 overflow-y-auto p-3"
            style={{ backgroundColor: "#e5ddd5", backgroundImage: "radial-gradient(#00000010 1px, transparent 1px)", backgroundSize: "16px 16px" }}
          >
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm ${
                    m.role === "user" ? "bg-[#dcf8c6] text-neutral-900" : "bg-white text-neutral-900"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-white px-3 py-2 text-xs text-muted-foreground shadow-sm">Bella está digitando…</div>
              </div>
            )}
          </div>
          <div className="flex gap-2 bg-neutral-100 p-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
              placeholder="Digite uma mensagem…"
              disabled={busy}
              className="bg-white"
            />
            <Button onClick={() => send()} disabled={busy || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {SUGGEST_QUICK.map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => void send(s)}
              className="rounded-full border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Side panel */}
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4" /> Controles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Modelo</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Temperature: {temperature.toFixed(2)}</Label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Etapa detectada:</span>
                <Badge variant="secondary">{intent}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>
                <Trash2Icon className="mr-2 h-3.5 w-3.5" /> Reiniciar
              </Button>
            </div>
            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Modo dry-run: não grava mensagens, não envia WhatsApp/Instagram e não gera link de pagamento real. Usa o prompt ativo desta loja e o catálogo real para responder.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" /> Carrinho simulado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {cart.length === 0 ? (
              <div className="text-xs text-muted-foreground">Vazio. Peça para a Bella adicionar produtos.</div>
            ) : (
              <>
                <ul className="space-y-1">
                  {cart.map((c) => (
                    <li key={c.product_id} className="flex justify-between gap-2 text-xs">
                      <span className="truncate">{c.qty}× {c.name}</span>
                      <span className="tabular-nums">{brl(c.qty * c.unit_price)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Total</span><span className="tabular-nums">{brl(cartTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4" /> Ferramentas chamadas ({trace.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trace.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nenhuma tool foi chamada ainda.</div>
            ) : (
              <ScrollArea className="h-64">
                <ul className="space-y-2 pr-3">
                  {trace.map((t, i) => (
                    <li key={i} className="rounded-md border border-border p-2 text-[11px]">
                      <div className="mb-1 font-semibold">{t.name}</div>
                      <div className="text-muted-foreground"><b>in:</b> {JSON.stringify(t.input)}</div>
                      <div className="text-muted-foreground break-all"><b>out:</b> {JSON.stringify(t.output).slice(0, 240)}</div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { listAutoResponses, saveAutoResponse } from "@/lib/pdv-crm-advanced.functions";

function AutoResponseTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["auto-responses", storeId],
    queryFn: () => listAutoResponses({ data: { store_id: storeId } })
  });

  const saveMut = useMutation({
    mutationFn: (v: any) => saveAutoResponse({ data: { ...v, store_id: storeId } }),
    onSuccess: () => {
      toast.success("Resposta automática salva");
      qc.invalidateQueries({ queryKey: ["auto-responses", storeId] });
    }
  });

  const responses = data?.responses ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AutoResponseCard 
        title="Saudação Inicial (Primeiro Contato)" 
        type="first_contact" 
        response={responses.find((r: any) => r.trigger_type === "first_contact")} 
        onSave={(text: string, active: boolean) => saveMut.mutate({ trigger_type: "first_contact", response_text: text, is_active: active })}
      />
      <AutoResponseCard 
        title="Fora do Horário" 
        type="outside_hours" 
        response={responses.find((r: any) => r.trigger_type === "outside_hours")} 
        onSave={(text: string, active: boolean) => saveMut.mutate({ trigger_type: "outside_hours", response_text: text, is_active: active })}
      />
      <AutoResponseCard 
        title="Mensagem de Ausência" 
        type="absence" 
        response={responses.find((r: any) => r.trigger_type === "absence")} 
        onSave={(text: string, active: boolean) => saveMut.mutate({ trigger_type: "absence", response_text: text, is_active: active })}
      />
    </div>
  );
}

function AutoResponseCard({ title, response, onSave }: any) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (response) {
      setText(response.response_text || "");
      setActive(response.is_active ?? true);
    }
  }, [response]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Switch checked={active} onCheckedChange={setActive} />
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea 
          placeholder="Digite a resposta automática..." 
          value={text} 
          onChange={e => setText(e.target.value)}
          rows={4}
        />
        <Button size="sm" className="w-full" onClick={() => onSave(text, active)}>Salvar Configuração</Button>
      </CardContent>
    </Card>
  );
}
