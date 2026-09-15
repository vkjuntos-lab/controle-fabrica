import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  getIgSettings,
  saveIgSettings,
  testIgSend,
  getIgWebhookInfo,
  listIgWebhookLogs,
  refreshIgToken,
  listIgTemplates,
  upsertIgTemplate,
  deleteIgTemplate,
  sendIgTemplateCampaign,
  startIgOAuth,
} from "@/lib/pdv-instagram.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Copy, Save, Send, KeyRound, ShieldCheck, ShieldAlert, RefreshCw,
  FileText, Trash2, PlusCircle, ScrollText, Timer,
} from "lucide-react";
import { Instagram } from "@/components/icons";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/instagram")({
  component: InstagramPage,
  head: () => ({
    meta: [
      { title: "Instagram Direct — Bella IA | KS MultiMake" },
      { name: "description", content: "Conecte sua conta do Instagram Business à Bella IA para atender clientes no Direct." },
    ],
  }),
});

function InstagramPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const qc = useQueryClient();
  const oauthWindowRef = useRef<Window | null>(null);

  const settingsQ = useQuery({
    queryKey: ["ig-settings", storeId],
    queryFn: () => getIgSettings({ data: { storeId: storeId! } }),
    enabled: !!storeId,
  });
  const infoQ = useQuery({ queryKey: ["ig-info"], queryFn: () => getIgWebhookInfo() });

  const [form, setForm] = useState({
    ig_token: "",
    ig_user_id: "",
    ig_page_id: "",
    ig_app_id: "",
    ig_active: false,
  });
  const [initial, setInitial] = useState(form);
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    const next = {
      ig_token: s.ig_token ?? "",
      ig_user_id: s.ig_user_id ?? "",
      ig_page_id: s.ig_page_id ?? "",
      ig_app_id: s.ig_app_id ?? "",
      ig_active: !!s.ig_active,
    };
    setForm(next);
    setInitial(next);
  }, [settingsQ.data]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const saveMut = useMutation({
    mutationFn: () =>
      saveIgSettings({
        data: {
          storeId: storeId!,
          ig_token: form.ig_token.trim() || null,
          ig_user_id: form.ig_user_id.trim() || null,
          ig_page_id: form.ig_page_id.trim() || null,
          ig_app_id: form.ig_app_id.trim() || null,
          ig_active: form.ig_active,
        },
      }),
    onSuccess: () => {
      toast.success("Configurações do Instagram salvas.");
      qc.invalidateQueries({ queryKey: ["ig-settings", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const testMut = useMutation({
    mutationFn: () =>
      testIgSend({ data: { storeId: storeId!, to: testTo.trim(), message: testMsg.trim() || undefined } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Mensagem enviada com sucesso!");
      else toast.error(r?.error ?? "Falha no envio.");
      qc.invalidateQueries({ queryKey: ["ig-settings", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no teste."),
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshIgToken({ data: { storeId: storeId! } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success(`Token renovado. Expira em ${r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "—"}`);
      else toast.error(r?.error ?? "Falha ao renovar token.");
      qc.invalidateQueries({ queryKey: ["ig-settings", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao renovar."),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // A Meta só aceita o domínio público cadastrado no painel. O preview usa outro
  // domínio (id-preview--...), o que faz o Instagram mostrar "página não disponível".
  const publicOrigin = origin && !origin.includes("preview") && !origin.includes("localhost")
    ? origin
    : "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app";
  const webhookUrl = `${publicOrigin}${infoQ.data?.webhook_path ?? "/api/public/ig-agent-webhook"}`;
  const oauthCallbackUrl = `${publicOrigin}/api/public/ig-oauth/callback`;
  const deauthorizeUrl = `${publicOrigin}/api/public/ig-oauth/deauthorize`;
  const dataDeletionUrl = `${publicOrigin}/api/public/ig-oauth/data-deletion`;

  const oauthMut = useMutation({
    mutationFn: () => startIgOAuth({ data: { storeId: storeId!, origin: publicOrigin } }),
    onSuccess: (r: any) => {
      if (r?.ok && r.url) {
        const oauthWindow = oauthWindowRef.current;
        if (oauthWindow && !oauthWindow.closed) {
          oauthWindow.opener = null;
          oauthWindow.location.href = r.url;
        } else {
          toast.error("O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.");
        }
      } else {
        oauthWindowRef.current?.close();
        toast.error(r?.error ?? "Não foi possível iniciar o login do Instagram.");
      }
      oauthWindowRef.current = null;
    },
    onError: (e: any) => {
      oauthWindowRef.current?.close();
      oauthWindowRef.current = null;
      toast.error(e?.message ?? "Falha ao iniciar login.");
    },
  });

  const openInstagramOAuth = () => {
    if (!storeId || oauthMut.isPending) return;
    const oauthWindow = window.open("about:blank", "_blank");
    if (!oauthWindow) {
      toast.error("Permita pop-ups para abrir o login do Instagram fora da prévia.");
      return;
    }
    oauthWindow.document.title = "Abrindo Instagram…";
    oauthWindow.document.body.textContent = "Abrindo login seguro do Instagram…";
    oauthWindowRef.current = oauthWindow;
    oauthMut.mutate();
  };


  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const st = params.get("ig_oauth");
    if (!st) return;
    if (st === "ok") toast.success("Instagram conectado com sucesso!");
    else toast.error(`Falha no login do Instagram: ${params.get("msg") ?? st}`);
    qc.invalidateQueries({ queryKey: ["ig-settings", storeId] });
    window.history.replaceState({}, "", window.location.pathname);
  }, [qc, storeId]);

  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Copiado!"); };


  const connected = !!settingsQ.data?.ig_token && !!settingsQ.data?.ig_user_id && settingsQ.data?.ig_active;
  const expiresAt = settingsQ.data?.ig_token_expires_at ? new Date(settingsQ.data.ig_token_expires_at) : null;
  const daysToExpire = expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)) : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Instagram className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Instagram Direct</h1>
        </div>
        <Badge variant={connected ? "default" : "secondary"} className="gap-1">
          {connected ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          {connected ? "Conectado" : "Não conectado"}
        </Badge>
      </div>

      {!infoQ.data?.app_secret_set && (
        <Alert variant="destructive">
          <AlertTitle>META_APP_SECRET não configurado</AlertTitle>
          <AlertDescription>
            O webhook do Instagram exige validação de assinatura HMAC. Adicione o segredo{" "}
            <code className="font-mono">META_APP_SECRET</code> (App Secret do seu app no Meta for Developers).
            Você pode salvar pelo botão abaixo, no formulário seguro.
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-primary/50 bg-primary/5">
        <AlertTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Ajuda com Configuração do Webhook
        </AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            Se você está recebendo o erro <strong>"Não foi possível validar a URL de callback..."</strong> no Meta for Developers, verifique:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              O <strong>Verify Token</strong> na Meta deve ser EXATAMENTE o que aparece na aba "Webhook & Token" abaixo.
            </li>
            <li>
              Certifique-se de que o <code>IG_WEBHOOK_VERIFY_TOKEN</code> está configurado corretamente no backend.
            </li>
            <li>
              Seu domínio deve ser <strong>HTTPS</strong> e acessível publicamente pelos servidores da Meta.
            </li>
            <li>
              Verifique os <strong>Logs</strong> nesta página para ver se a requisição de validação chegou ao sistema e se houve erro de assinatura.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="settings"><KeyRound className="h-4 w-4 mr-1" />Credenciais</TabsTrigger>
          <TabsTrigger value="webhook"><RefreshCw className="h-4 w-4 mr-1" />Webhook & Token</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-1" />Logs</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-1" />Templates</TabsTrigger>
          <TabsTrigger value="test"><Send className="h-4 w-4 mr-1" />Teste de envio</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Credenciais (Instagram Graph API)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Access Token (Page Access Token com <code>instagram_manage_messages</code>)</Label>
                <Input
                  type="password"
                  value={form.ig_token}
                  onChange={(e) => setForm((f) => ({ ...f, ig_token: e.target.value }))}
                  placeholder="EAAG..."
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>Instagram Business User ID</Label>
                <Input
                  value={form.ig_user_id}
                  onChange={(e) => setForm((f) => ({ ...f, ig_user_id: e.target.value }))}
                  placeholder="178414XXXXXXXXX"
                />
              </div>
              <div>
                <Label>Page ID — opcional</Label>
                <Input
                  value={form.ig_page_id}
                  onChange={(e) => setForm((f) => ({ ...f, ig_page_id: e.target.value }))}
                  placeholder="10152XXXXXXXXXX"
                />
              </div>
              <div>
                <Label>Meta App ID (necessário para renovação automática)</Label>
                <Input
                  value={form.ig_app_id}
                  onChange={(e) => setForm((f) => ({ ...f, ig_app_id: e.target.value }))}
                  placeholder="1234567890"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Fallback usa <code>META_APP_ID</code> do backend se este campo estiver vazio.
                </p>
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <Switch
                  checked={form.ig_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ig_active: v }))}
                />
                <Label className="!m-0">Ativar Bella IA no Instagram Direct desta loja</Label>
              </div>
              <div className="md:col-span-2 flex gap-2 flex-wrap">
                <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending || !storeId}>
                  <Save className="h-4 w-4 mr-1" />
                  {saveMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
                {settingsQ.data?.last_test_at && (
                  <span className="text-xs text-muted-foreground self-center">
                    Último teste: {new Date(settingsQ.data.last_test_at).toLocaleString("pt-BR")}
                    {settingsQ.data.last_test_error ? ` — ${settingsQ.data.last_test_error}` : " — OK"}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook" className="mt-3 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Webhook (colar no Meta for Developers)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Input readOnly value={webhookUrl} />
                <Button variant="outline" onClick={() => copy(webhookUrl)}>
                  <Copy className="h-4 w-4 mr-1" /> Copiar URL
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={infoQ.data?.verify_token_set ? "default" : "destructive"}>
                  Verify Token {infoQ.data?.verify_token_set ? "configurado" : "ausente"}
                </Badge>
                <Badge variant={infoQ.data?.app_secret_set ? "default" : "destructive"}>
                  META_APP_SECRET {infoQ.data?.app_secret_set ? "ok" : "ausente"}
                </Badge>
                <Badge variant={infoQ.data?.app_id_set ? "default" : "secondary"}>
                  META_APP_ID {infoQ.data?.app_id_set ? "ok" : "opcional"}
                </Badge>
                {infoQ.data?.verify_token_preview && (
                  <span className="text-xs text-muted-foreground">
                    Preview: <code>{infoQ.data.verify_token_preview}</code>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Instagram className="h-4 w-4" /> Login da empresa no Instagram (OAuth)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Cole estas URLs no app da Meta, em <strong>Configurar o login da empresa no Instagram</strong>.
              </p>
              {[
                { label: "URI de redirecionamento OAuth válido", url: oauthCallbackUrl },
                { label: "Cancelar autorização (deauthorize)", url: deauthorizeUrl },
                { label: "Exclusão de dados (data deletion)", url: dataDeletionUrl },
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <Label>{item.label}</Label>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <Input readOnly value={item.url} />
                    <Button variant="outline" onClick={() => copy(item.url)}>
                      <Copy className="h-4 w-4 mr-1" /> Copiar
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Button onClick={openInstagramOAuth} disabled={!storeId || oauthMut.isPending}>
                  <Instagram className="h-4 w-4 mr-1" /> Conectar conta do Instagram
                </Button>
                <Badge variant={infoQ.data?.oauth_ready ? "default" : "destructive"}>
                  {infoQ.data?.oauth_ready ? "App ID/Secret ok" : "Configure IG_APP_ID/IG_APP_SECRET"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Se aparecer “esta página não está disponível”, verifique no painel da Meta: o
                <strong> ID do app do Instagram</strong> (produto Instagram → Configuração da API, não o ID do app do
                Facebook) e a URI de redirecionamento exatamente igual a <code>{oauthCallbackUrl}</code>.
              </p>

            </CardContent>
          </Card>



          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-4 w-4" /> Renovação do Access Token (long-lived)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">
                  Expira em: {expiresAt ? expiresAt.toLocaleDateString("pt-BR") : "—"}
                  {daysToExpire !== null && ` (${daysToExpire}d)`}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() => refreshMut.mutate()}
                  disabled={refreshMut.isPending || !storeId || !settingsQ.data?.ig_token}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {refreshMut.isPending ? "Renovando..." : "Renovar agora"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O token long-lived dura ~60 dias. Um cron público em{" "}
                <code>/api/public/ig-token-refresh</code> renova tokens que expiram nos próximos 10 dias
                automaticamente (agende via pg_cron a cada 24h).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-3">
          <LogsPanel storeId={storeId} />
        </TabsContent>

        <TabsContent value="templates" className="mt-3">
          <TemplatesPanel storeId={storeId} />
        </TabsContent>

        <TabsContent value="test" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Teste de envio
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>IGSID do destinatário</Label>
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="ID de usuário que já enviou DM"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Instagram só permite iniciar envios para usuários com DM nas últimas 24h.
                </p>
              </div>
              <div>
                <Label>Mensagem (opcional)</Label>
                <Input
                  value={testMsg}
                  onChange={(e) => setTestMsg(e.target.value)}
                  placeholder="🧪 Teste de conexão Bella IA"
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  onClick={() => testMut.mutate()}
                  disabled={!testTo.trim() || testMut.isPending || !storeId}
                >
                  <Send className="h-4 w-4 mr-1" />
                  {testMut.isPending ? "Enviando..." : "Enviar teste"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ────────────────────────────── Logs ────────────────────────────── */

function LogsPanel({ storeId }: { storeId: string | null }) {
  const [status, setStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsQ = useQuery({
    queryKey: ["ig-logs", storeId, status],
    queryFn: () =>
      listIgWebhookLogs({
        data: { storeId: storeId ?? null, status: status === "all" ? null : status, limit: 200 },
      }),
    enabled: !!storeId,
    refetchInterval: 15_000,
  });

  const rows = logsQ.data?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="h-4 w-4" /> Logs do Webhook do Instagram
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
              <SelectItem value="invalid_signature">Assinatura inválida</SelectItem>
              <SelectItem value="stale">Payload antigo (replay)</SelectItem>
              <SelectItem value="bad_json">JSON inválido</SelectItem>
              <SelectItem value="ignored">Ignorado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => logsQ.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <span className="text-xs text-muted-foreground">Auto-atualiza a cada 15s • {rows.length} registros</span>
        </div>

        <div className="border rounded-md divide-y max-h-[520px] overflow-auto text-sm">
          {rows.length === 0 && (
            <div className="p-6 text-center text-muted-foreground">Sem registros.</div>
          )}
          {rows.map((r: any) => (
            <div key={r.id} className="p-3 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={r.status === "ok" ? "default" : "destructive"}>{r.status}</Badge>
                <Badge variant="outline">{r.direction}</Badge>
                {r.event_type && <Badge variant="secondary">{r.event_type}</Badge>}
                {r.http_status && <Badge variant="outline">HTTP {r.http_status}</Badge>}
                {r.signature_valid === false && <Badge variant="destructive">assinatura inválida</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.sender_id && <>de <code>{r.sender_id}</code> </>}
                {r.recipient_id && <>para <code>{r.recipient_id}</code></>}
                {r.error && <span className="text-destructive"> • {r.error}</span>}
              </div>
              <button
                className="text-xs underline text-muted-foreground"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                {expandedId === r.id ? "Ocultar payload" : "Ver payload"}
              </button>
              {expandedId === r.id && (
                <pre className="bg-muted rounded p-2 overflow-auto text-[11px] max-h-72">
{JSON.stringify({ request: r.request, response: r.response }, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────── Templates ────────────────────────────── */

type Tpl = { id: string; name: string; body: string; variables: string[] };

function TemplatesPanel({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const tplQ = useQuery({
    queryKey: ["ig-templates", storeId],
    queryFn: () => listIgTemplates({ data: { storeId: storeId! } }),
    enabled: !!storeId,
  });
  const templates: Tpl[] = (tplQ.data?.rows ?? []) as any;

  const [editing, setEditing] = useState<Tpl | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [useConversations, setUseConversations] = useState(true);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (editing) { setName(editing.name); setBody(editing.body); }
    else { setName(""); setBody(""); }
  }, [editing]);

  const selectedTpl = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );
  const detectedVars = useMemo(() => {
    const set = new Set<string>();
    const src = selectedTpl?.body ?? "";
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) set.add(m[1]);
    return [...set];
  }, [selectedTpl]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertIgTemplate({
        data: { id: editing?.id, storeId: storeId!, name: name.trim(), body },
      }),
    onSuccess: () => {
      toast.success("Template salvo.");
      setEditing(null); setName(""); setBody("");
      qc.invalidateQueries({ queryKey: ["ig-templates", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteIgTemplate({ data: { id } }),
    onSuccess: () => {
      toast.success("Template excluído.");
      qc.invalidateQueries({ queryKey: ["ig-templates", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir."),
  });

  const sendMut = useMutation({
    mutationFn: () =>
      sendIgTemplateCampaign({
        data: {
          storeId: storeId!,
          templateId: selectedId,
          recipients: recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
          useConversations,
          variables: vars,
        },
      }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success(`Campanha enviada: ${r.sent} ok, ${r.errs} erros.`);
      else toast.error(r?.error ?? "Falha ao enviar.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar."),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Templates de DM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="border rounded-md divide-y max-h-72 overflow-auto">
            {templates.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">Nenhum template.</div>
            )}
            {templates.map((t) => (
              <div key={t.id} className="p-3 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.body}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => delMut.mutate(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="text-sm font-medium">
              {editing ? "Editar template" : "Novo template"}
            </div>
            <Input
              placeholder="Nome interno (ex.: boas_vindas)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              rows={5}
              placeholder="Corpo da mensagem. Use {{nome}} para variáveis."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!name.trim() || !body.trim() || saveMut.isPending || !storeId}
              >
                <Save className="h-4 w-4 mr-1" />{editing ? "Atualizar" : "Criar"}
              </Button>
              {editing && (
                <Button variant="outline" onClick={() => setEditing(null)}>
                  <PlusCircle className="h-4 w-4 mr-1" />Novo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Disparo via campanha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Template</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {detectedVars.length > 0 && (
            <div className="space-y-2">
              <Label>Variáveis do template</Label>
              {detectedVars.map((k) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-2 items-center">
                  <span className="text-xs font-mono">{`{{${k}}}`}</span>
                  <Input
                    value={vars[k] ?? ""}
                    onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))}
                    placeholder={`valor para ${k}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <Label>IGSIDs adicionais (separados por vírgula/linha)</Label>
            <Textarea
              rows={3}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="17845..., 17846..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={useConversations} onCheckedChange={setUseConversations} />
            <Label className="!m-0">Incluir conversas ativas (canal Instagram)</Label>
          </div>

          <Alert>
            <AlertTitle>Janela de 24h</AlertTitle>
            <AlertDescription>
              O Instagram só permite envios livres a usuários que interagiram com sua conta nas últimas 24h.
              Fora da janela, use apenas Message Tags aprovadas pela Meta.
            </AlertDescription>
          </Alert>

          <Button
            onClick={() => sendMut.mutate()}
            disabled={!selectedId || sendMut.isPending || !storeId}
          >
            <Send className="h-4 w-4 mr-1" />
            {sendMut.isPending ? "Enviando..." : "Disparar campanha"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
