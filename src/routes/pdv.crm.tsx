import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { 
  getKanbanBoard, 
  updateKanbanStage, 
  listScheduledMessages, 
  saveScheduledMessage 
} from "@/lib/pdv-crm-advanced.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Clock, Users, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/crm")({
  component: CrmAdvancedPage,
});

function CrmAdvancedPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const enabled = !!storeId;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> CRM Avançado
        </h1>
      </div>

      {!enabled ? (
        <Card><CardContent className="pt-4 text-sm text-muted-foreground">Selecione uma loja para gerenciar o CRM.</CardContent></Card>
      ) : (
        <Tabs defaultValue="kanban" className="space-y-4">
          <TabsList>
            <TabsTrigger value="kanban">Funil de Vendas</TabsTrigger>
            <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban"><KanbanTab storeId={storeId!} /></TabsContent>
          <TabsContent value="agendamentos"><ScheduledTab storeId={storeId!} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function KanbanTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["kanban", storeId],
    queryFn: () => getKanbanBoard({ data: { store_id: storeId } })
  });

  const moveMut = useMutation({
    mutationFn: (v: { customer_id: string; stage: string }) => updateKanbanStage({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban", storeId] });
      toast.success("Estágio atualizado");
    }
  });

  if (isLoading) return <div>Carregando funil...</div>;

  const board = data?.board ?? {};
  const columns = [
    { id: "novo", label: "Novo", color: "bg-blue-500" },
    { id: "contato feito", label: "Contato Feito", color: "bg-amber-500" },
    { id: "negociacao", label: "Negociação", color: "bg-purple-500" },
    { id: "fechado", label: "Fechado", color: "bg-emerald-500" }
  ];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(col => (
        <div key={col.id} className="min-w-[280px] w-full max-w-[320px] flex flex-col gap-3">
          <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${col.color}`} />
              <span className="font-semibold text-sm">{col.label}</span>
            </div>
            <Badge variant="secondary">{board[col.id]?.length ?? 0}</Badge>
          </div>
          
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="flex flex-col gap-2 pr-4">
              {board[col.id]?.map((cust: any) => (
                <Card key={cust.id} className="shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-3 space-y-2">
                    <div className="font-medium text-sm">{cust.name}</div>
                    <div className="text-xs text-muted-foreground">{cust.phone || "Sem telefone"}</div>
                    {cust.value_potential > 0 && (
                      <div className="text-xs font-semibold text-primary">
                        Potencial: R$ {cust.value_potential}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {cust.tags?.map((t: string) => (
                        <Badge key={t} variant="outline" className="text-[10px] px-1 h-4">{t}</Badge>
                      ))}
                    </div>
                    <div className="flex justify-end gap-1 pt-2">
                      {columns.filter(c => c.id !== col.id).map(target => (
                        <Button 
                          key={target.id} 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6" 
                          title={`Mover para ${target.label}`}
                          onClick={() => moveMut.mutate({ customer_id: cust.id, stage: target.id })}
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}

function ScheduledTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [targetCustomer, setTargetCustomer] = useState("");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");

  const { data: msgs } = useQuery({
    queryKey: ["scheduled-msgs", storeId],
    queryFn: () => listScheduledMessages({ data: { store_id: storeId } })
  });

  const saveMut = useMutation({
    mutationFn: (v: any) => saveScheduledMessage({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-msgs", storeId] });
      toast.success("Mensagem agendada!");
      setMessage("");
      setDate("");
    }
  });

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle className="text-base">Agendar Mensagem</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>ID do Cliente (Temporário)</Label>
            <Input value={targetCustomer} onChange={e => setTargetCustomer(e.target.value)} placeholder="UUID do cliente" />
          </div>
          <div className="space-y-2">
            <Label>Data e Hora</Label>
            <Input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea 
              placeholder="O que enviar?" 
              value={message} 
              onChange={e => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <Button 
            className="w-full" 
            disabled={!targetCustomer || !date || !message || saveMut.isPending}
            onClick={() => saveMut.mutate({ store_id: storeId, customer_id: targetCustomer, text: message, send_at: date })}
          >
            <Calendar className="mr-2 h-4 w-4" /> Agendar Envio
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Fila de Agendamento</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {(msgs?.messages ?? []).map((m: any) => (
                <div key={m.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/20">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{m.customers?.name || "Cliente ID: " + m.customer_id}</div>
                    <div className="text-xs text-muted-foreground italic">"{m.text}"</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2">
                      <Clock className="h-3 w-3" /> {new Date(m.send_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <Badge variant={m.status === 'sent' ? 'default' : m.status === 'failed' ? 'destructive' : 'secondary'}>
                    {m.status === 'sent' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : m.status === 'failed' ? <AlertCircle className="h-3 w-3 mr-1" /> : null}
                    {m.status}
                  </Badge>
                </div>
              ))}
              {(!msgs?.messages || msgs.messages.length === 0) && (
                <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma mensagem agendada.</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
