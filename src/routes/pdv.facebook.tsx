import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  getFbSettings, saveFbSettings, testFbSend, getFbWebhookInfo,
  listFbWebhookLogs, refreshFbToken, publishFbPost, listFbPosts,
} from "@/lib/pdv-facebook.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Save, Send, KeyRound, ShieldCheck, ShieldAlert, RefreshCw, ScrollText, Megaphone } from "lucide-react";
import { Facebook } from "@/components/icons";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/facebook")({
  component: FacebookPage,
  head: () => ({
    meta: [
      { title: "Facebook — Messenger & Página | KS MultiMake" },
      { name: "description", content: "Conecte a Página do Facebook para atender pelo Messenger, responder comentários e publicar posts." },
    ],
  }),
});

function FacebookPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["fb-settings", storeId],
    queryFn: () => getFbSettings({ data: { storeId: storeId! } }),
    enabled: !!storeId,
  });
  const infoQ = useQuery({ queryKey: ["fb-info"], queryFn: () => getFbWebhookInfo() });

  const [form, setForm] = useState({
    fb_token: "",
    fb_page_id: "",
    fb_app_id: "",
    fb_active: false,
  });
  const [initial, setInitial] = useState(form);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    const next = {
      fb_token: s.fb_token ?? "",
      fb_page_id: s.fb_page_id ?? "",
      fb_app_id: s.fb_app_id ?? "",
      fb_active: !!s.fb_active,
    };
    setForm(next);
    setInitial(next);
  }, [settingsQ.data]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const connected = !!(form.fb_token && form.fb_page_id && form.fb_active);
  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${infoQ.data?.webhook_path ?? "/api/public/fb-agent-webhook"}`;
  }, [infoQ.data]);

  const saveM = useMutation({
    mutationFn: () => saveFbSettings({ data: { storeId: storeId!, ...form } }),
    onSuccess: () => {
      toast.success("Configuração salva.");
      qc.invalidateQueries({ queryKey: ["fb-settings", storeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testM = useMutation({
    mutationFn: () => testFbSend({ data: { storeId: storeId!, to: testTo.trim(), message: testMsg.trim() || undefined } }),
    onSuccess: (res: any) => {
      if (res.ok) toast.success("Mensagem enviada" + (res.messageId ? ` (id: ${res.messageId})` : "."));
      else toast.error(res.error ?? "Falha no envio");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshM = useMutation({
    mutationFn: () => refreshFbToken({ data: { storeId: storeId! } }),
    onSuccess: (res: any) => {
      if (res.ok) {
        toast.success("Token renovado. Expira em: " + (res.expires_at ?? "n/d"));
        qc.invalidateQueries({ queryKey: ["fb-settings", storeId] });
      } else toast.error(res.error ?? "Falha na renovação");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Facebook className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-semibold">Facebook — Messenger & Página</h1>
            <p className="text-sm text-muted-foreground">DM no Messenger, respostas em comentários e publicação de posts.</p>
          </div>
        </div>
        <Badge variant={connected ? "default" : "secondary"} className={connected ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
          {connected ? "🟢 Conectado" : "⚪ Não conectado"}
        </Badge>
      </div>

      {!infoQ.data?.app_secret_set && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>META_APP_SECRET não configurado</AlertTitle>
          <AlertDescription>Salve o segredo do app Meta nas variáveis do backend para validar assinatura do webhook.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config"><KeyRound className="h-4 w-4 mr-1"/>Configuração</TabsTrigger>
          <TabsTrigger value="publish"><Megaphone className="h-4 w-4 mr-1"/>Publicar</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-1"/>Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Webhook (cole no Meta for Developers)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={webhookUrl} />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}>
                  <Copy className="h-4 w-4"/>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Verify token: {infoQ.data?.verify_token_set ? <code>{infoQ.data?.verify_token_preview}</code> : <span className="text-destructive">não configurado</span>} · Objeto <b>page</b> · Campos <b>messages</b>, <b>messaging_postbacks</b>, <b>feed</b>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Credenciais da Página</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <Label>Page Access Token</Label>
                <Input type="password" value={form.fb_token} onChange={(e) => setForm({ ...form, fb_token: e.target.value })} placeholder="EAAG..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Page ID</Label>
                  <Input value={form.fb_page_id} onChange={(e) => setForm({ ...form, fb_page_id: e.target.value })} placeholder="ex: 1234567890" />
                </div>
                <div>
                  <Label>Meta App ID</Label>
                  <Input value={form.fb_app_id} onChange={(e) => setForm({ ...form, fb_app_id: e.target.value })} placeholder="para renovar token" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.fb_active} onCheckedChange={(v) => setForm({ ...form, fb_active: v })} />
                <Label>Ativar Bella IA no Messenger e comentários desta Página</Label>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button disabled={!dirty || saveM.isPending} onClick={() => saveM.mutate()}>
                  <Save className="h-4 w-4 mr-1"/> {saveM.isPending ? "Salvando..." : "Salvar"}
                </Button>
                <Button variant="outline" disabled={refreshM.isPending || !form.fb_token} onClick={() => refreshM.mutate()}>
                  <RefreshCw className="h-4 w-4 mr-1"/> {refreshM.isPending ? "Renovando..." : "Renovar token (60d)"}
                </Button>
                {settingsQ.data?.fb_token_expires_at && (
                  <span className="text-xs text-muted-foreground self-center">
                    Expira: {new Date(settingsQ.data.fb_token_expires_at).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Teste de envio (Messenger)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>PSID do destinatário</Label>
                  <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="ex: 987654321012345" />
                </div>
                <div>
                  <Label>Mensagem</Label>
                  <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="Olá! Teste da Bella IA." />
                </div>
              </div>
              <Button onClick={() => testM.mutate()} disabled={!testTo || testM.isPending}>
                <Send className="h-4 w-4 mr-1"/> {testM.isPending ? "Enviando..." : "Enviar teste"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Só funciona dentro da janela de 24h após a última mensagem do usuário no Messenger.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publish"><PublishTab storeId={storeId} connected={connected} /></TabsContent>
        <TabsContent value="logs"><LogsTab storeId={storeId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function PublishTab({ storeId, connected }: { storeId?: string | null; connected: boolean }) {
  const qc = useQueryClient();
  const postsQ = useQuery({
    queryKey: ["fb-posts", storeId],
    queryFn: () => listFbPosts({ data: { storeId: storeId! } }),
    enabled: !!storeId && connected,
  });
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const publishM = useMutation({
    mutationFn: () => publishFbPost({ data: {
      storeId: storeId!,
      message: message.trim(),
      link: link.trim() || null,
      imageUrl: imageUrl.trim() || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    }}),
    onSuccess: (res: any) => {
      if (res.ok) {
        toast.success(scheduledAt ? "Post agendado" : "Post publicado" + (res.postId ? ` (id: ${res.postId})` : ""));
        setMessage(""); setLink(""); setImageUrl(""); setScheduledAt("");
        qc.invalidateQueries({ queryKey: ["fb-posts", storeId] });
      } else toast.error(res.error ?? "Falha na publicação");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Novo post na Página</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Mensagem</Label>
            <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Texto do post..." />
          </div>
          <div>
            <Label>Link (opcional)</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>URL da imagem (opcional — vira post de foto)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Agendar para (opcional)</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Entre 10 minutos e 75 dias no futuro (regra do Facebook).</p>
          </div>
          <Button onClick={() => publishM.mutate()} disabled={!connected || !message.trim() || publishM.isPending}>
            <Megaphone className="h-4 w-4 mr-1"/> {publishM.isPending ? "Publicando..." : scheduledAt ? "Agendar" : "Publicar agora"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Posts recentes</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[520px] overflow-auto">
          {!connected && <p className="text-sm text-muted-foreground">Conecte a Página para listar posts.</p>}
          {postsQ.data && (postsQ.data as any).posts?.length === 0 && <p className="text-sm text-muted-foreground">Sem posts.</p>}
          {(postsQ.data as any)?.posts?.map((p: any) => (
            <a key={p.id} href={p.permalink_url} target="_blank" rel="noreferrer" className="block border rounded-md p-2 hover:bg-muted/40">
              <div className="text-xs text-muted-foreground">{new Date(p.created_time).toLocaleString("pt-BR")}</div>
              <div className="text-sm line-clamp-3">{p.message ?? "(sem texto)"}</div>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function LogsTab({ storeId }: { storeId?: string | null }) {
  const [status, setStatus] = useState<string>("");
  const q = useQuery({
    queryKey: ["fb-logs", storeId, status],
    queryFn: () => listFbWebhookLogs({ data: { storeId: storeId ?? null, status: status || null, limit: 200 } }),
    refetchInterval: 15000,
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Logs do webhook</CardTitle>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
            <option value="ignored">ignored</option>
            <option value="invalid_signature">invalid_signature</option>
            <option value="stale">stale</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[600px] overflow-auto">
        {q.data?.rows?.length === 0 && <p className="text-sm text-muted-foreground">Sem logs.</p>}
        {q.data?.rows?.map((r: any) => (
          <details key={r.id} className="border rounded p-2 text-sm">
            <summary className="cursor-pointer flex justify-between gap-2">
              <span className="flex gap-2 items-center">
                <Badge variant={r.status === "ok" ? "default" : "destructive"}>{r.status}</Badge>
                <span className="text-xs text-muted-foreground">{r.direction} · {r.event_type}</span>
                <span className="text-xs">{r.sender_id ?? ""} → {r.recipient_id ?? ""}</span>
              </span>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleTimeString("pt-BR")}</span>
            </summary>
            {r.error && <div className="mt-2 text-destructive text-xs">{r.error}</div>}
            <pre className="mt-2 text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded">{JSON.stringify({ request: r.request, response: r.response }, null, 2)}</pre>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
