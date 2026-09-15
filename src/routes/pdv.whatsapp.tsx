import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  listWaConversations,
  listWaMessages,
  getWaWebhookInfo,
  listWaOrders,
  resendWaConfirmation,
} from "@/lib/pdv-wa-agent.functions";
import { getWaSettings, saveWaSettings, testWaSend } from "@/lib/pdv-notifications.functions";
import { getWaWabaId, saveWaWabaId, listWaTemplates, syncWaTemplates } from "@/lib/pdv-wa-templates.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Bot, Copy, RefreshCw, ShoppingBag, CheckCircle2, Circle, AlertCircle, Send, Save, KeyRound } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/pdv/whatsapp")({
  component: WhatsAppAgentPage,
});

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString("pt-BR");
}

function WhatsAppAgentPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  const convosQ = useQuery({
    queryKey: ["wa-convos", storeId],
    queryFn: () => listWaConversations({ data: { store_id: storeId! } }),
    enabled: !!storeId,
    refetchInterval: 15000,
  });

  const msgsQ = useQuery({
    queryKey: ["wa-msgs", selected],
    queryFn: () => listWaMessages({ data: { conversation_id: selected! } }),
    enabled: !!selected,
    refetchInterval: 10000,
  });

  const infoQ = useQuery({
    queryKey: ["wa-info"],
    queryFn: () => getWaWebhookInfo(),
  });

  useEffect(() => {
    const first = convosQ.data?.conversations?.[0]?.id;
    if (!selected && first) setSelected(first);
  }, [convosQ.data, selected]);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${infoQ.data?.webhook_path ?? "/api/public/wa-agent-webhook"}`
      : "";

  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    toast.success("Copiado!");
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Agente WhatsApp</h1>
          <Badge variant="secondary">IA de vendas</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => { convosQ.refetch(); msgsQ.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Configuração do webhook (Meta Cloud API)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">1) Callback URL</div>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs break-all">{webhookUrl}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(webhookUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">2) Verify token</div>
            {infoQ.data?.verify_token_set ? (
              <div className="text-xs">
                Configurado (<code>{infoQ.data.verify_token_preview}</code>). Use o mesmo valor no Meta Business.
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Verify token ausente</AlertTitle>
                <AlertDescription>
                  Peça ao suporte para gerar o secret <code>WA_WEBHOOK_VERIFY_TOKEN</code>.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            3) Assine o campo <code>messages</code> e conecte o número da loja em{" "}
            <a className="underline" href="/pdv/config" onClick={(e) => { e.preventDefault(); router.navigate({ to: "/pdv/config" }); }}>
              Configurações → WhatsApp
            </a>{" "}
            (provider: Cloud API, phone_id e token da loja).
          </div>
        </CardContent>
      </Card>

      {storeId && <WaCredentialsCard storeId={storeId} />}

      <Tabs defaultValue="conversas">

        <TabsList>
          <TabsTrigger value="conversas">
            <MessageCircle className="mr-1.5 h-4 w-4" /> Conversas
          </TabsTrigger>
          <TabsTrigger value="pedidos">
            <ShoppingBag className="mr-1.5 h-4 w-4" /> Pedidos WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="mt-3">
          <div className="grid gap-4 md:grid-cols-[320px_1fr]">
            <Card className="h-[70vh]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="h-4 w-4" /> Conversas
                  <Badge variant="secondary">{convosQ.data?.conversations?.length ?? 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(70vh-56px)]">
                  {(convosQ.data?.conversations ?? []).map((c: any) => {
                    const cart = Array.isArray(c.cart) ? c.cart : [];
                    const total = cart.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c.id)}
                        className={`flex w-full flex-col gap-1 border-b px-3 py-2 text-left hover:bg-accent ${
                          selected === c.id ? "bg-accent" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{c.wa_name ?? c.phone}</span>
                          <span className="text-xs text-muted-foreground">{fmt(c.updated_at).split(" ")[1]}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{c.phone}</span>
                          {cart.length > 0 && (
                            <Badge variant="outline">{cart.length} itens · R$ {total.toFixed(2)}</Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {(convosQ.data?.conversations?.length ?? 0) === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      Nenhuma conversa ainda. Quando um cliente mandar mensagem, ela aparece aqui.
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="h-[70vh]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {selected ? "Transcrição" : "Selecione uma conversa"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(70vh-56px)] px-4 py-3">
                  {(msgsQ.data?.messages ?? []).map((m: any) => (
                    <div
                      key={m.id}
                      className={`mb-2 flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : m.direction === "inbound"
                            ? "bg-muted"
                            : "bg-yellow-100 text-yellow-900 text-xs"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.text}</div>
                        <div className="mt-1 text-[10px] opacity-70">{fmt(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                  {selected && (msgsQ.data?.messages?.length ?? 0) === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">Sem mensagens ainda.</div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-3">
          <WaOrdersPanel storeId={storeId ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WaCredentialsCard({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-settings", storeId],
    queryFn: () => getWaSettings({ data: { storeId } }),
  });

  const [form, setForm] = useState({
    provider: "cloud" as "wa_link" | "zapi" | "cloud",
    fromNumber: "",
    active: true,
    cloudToken: "",
    cloudPhoneId: "",
    cloudTemplateName: "" as string,
    cloudTemplateLang: "pt_BR" as string,
    zapiInstance: "",
    zapiToken: "",
    zapiClientToken: "",
  });
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [useTemplateForTest, setUseTemplateForTest] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setForm({
      provider: q.data.provider,
      fromNumber: q.data.from_number ?? "",
      active: q.data.active,
      cloudToken: q.data.cloud_token ?? "",
      cloudPhoneId: q.data.cloud_phone_id ?? "",
      cloudTemplateName: q.data.cloud_template_name ?? "",
      cloudTemplateLang: q.data.cloud_template_lang ?? "pt_BR",
      zapiInstance: q.data.zapi_instance_id ?? "",
      zapiToken: q.data.zapi_token ?? "",
      zapiClientToken: q.data.zapi_client_token ?? "",
    });
    setEditing(false);
    setTestPhone((prev) => prev || (q.data?.from_number ?? "").replace(/\D/g, ""));
  }, [q.data]);


  const isConfigured = (() => {
    if (!q.data) return false;
    const p = q.data.provider;
    if (p === "cloud") return !!(q.data.cloud_token && q.data.cloud_phone_id);
    if (p === "zapi") return !!(q.data.zapi_instance_id && q.data.zapi_token);
    return !!q.data.from_number;
  })();

  const dirty = q.data
    ? form.provider !== q.data.provider ||
      form.fromNumber !== (q.data.from_number ?? "") ||
      form.active !== q.data.active ||
      form.cloudToken !== (q.data.cloud_token ?? "") ||
      form.cloudPhoneId !== (q.data.cloud_phone_id ?? "") ||
      form.cloudTemplateName !== (q.data.cloud_template_name ?? "") ||
      form.cloudTemplateLang !== (q.data.cloud_template_lang ?? "pt_BR") ||
      form.zapiInstance !== (q.data.zapi_instance_id ?? "") ||
      form.zapiToken !== (q.data.zapi_token ?? "") ||
      form.zapiClientToken !== (q.data.zapi_client_token ?? "")
    : true;

  const locked = isConfigured && !editing;

  const save = useMutation({
    mutationFn: () =>
      saveWaSettings({
        data: {
          storeId,
          provider: form.provider,
          fromNumber: form.fromNumber.trim() || null,
          active: form.active,
          cloudToken: form.cloudToken.trim() || null,
          cloudPhoneId: form.cloudPhoneId.trim() || null,
          cloudTemplateName: form.cloudTemplateName.trim() || null,
          cloudTemplateLang: form.cloudTemplateLang.trim() || null,
          zapiInstance: form.zapiInstance.trim() || null,
          zapiToken: form.zapiToken.trim() || null,
          zapiClientToken: form.zapiClientToken.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração salva!");
      qc.invalidateQueries({ queryKey: ["wa-settings", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const test = useMutation({
    mutationFn: () =>
      testWaSend({
        data: {
          storeId,
          phone: testPhone.trim(),
          message: "Teste do PDV ✅",
          useTemplate: useTemplateForTest,
          templateName: useTemplateForTest ? form.cloudTemplateName || null : null,
          templateLang: useTemplateForTest ? form.cloudTemplateLang || null : null,
        },
      }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Mensagem enviada!");
      else toast.error(`Falhou: ${r?.error ?? "erro"}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro no teste"),
  });
  const lastTest = test.data as { ok?: boolean; error?: string; messageId?: string; errorDetails?: any } | undefined;

  const status = (() => {
    if (!q.data) return { label: "Carregando…", tone: "muted" as const, dot: "bg-muted-foreground/40" };
    if (!q.data.active) return { label: "Desativado", tone: "muted" as const, dot: "bg-muted-foreground/50" };
    const provider = q.data.provider;
    const hasCreds =
      provider === "cloud"
        ? !!(q.data.cloud_token && q.data.cloud_phone_id)
        : provider === "zapi"
        ? !!(q.data.zapi_instance_id && q.data.zapi_token)
        : true;
    if (!hasCreds) return { label: "Não configurado", tone: "destructive" as const, dot: "bg-destructive" };
    if (q.data.last_test_error) return { label: "Erro no envio", tone: "destructive" as const, dot: "bg-destructive" };
    if (q.data.verified_at) return { label: "Conectado", tone: "success" as const, dot: "bg-emerald-500" };
    return { label: "Configurado (não testado)", tone: "warning" as const, dot: "bg-amber-500" };
  })();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Credenciais do WhatsApp
          <Badge
            variant={status.tone === "success" ? "default" : status.tone === "destructive" ? "destructive" : "secondary"}
            className="ml-1 flex items-center gap-1.5"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
            {status.label}
          </Badge>
          {q.data?.verified_at && (
            <span className="text-xs text-muted-foreground">testado em {fmt(q.data.verified_at)}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Provedor</Label>
            <Select
              value={form.provider}
              onValueChange={(v) => setForm((f) => ({ ...f, provider: v as any }))}
              disabled={locked}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud">Meta Cloud API (oficial)</SelectItem>
                <SelectItem value="zapi">Z-API (não oficial)</SelectItem>
                <SelectItem value="wa_link">wa.me (link manual)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Número da loja (com DDI)</Label>
            <Input
              placeholder="5511999998888"
              value={form.fromNumber}
              maxLength={20}
              disabled={locked}
              onChange={(e) => setForm((f) => ({ ...f, fromNumber: e.target.value.replace(/\D/g, "") }))}
            />
          </div>
        </div>

        {form.provider === "cloud" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Phone Number ID</Label>
                <Input
                  placeholder="123456789012345"
                  value={form.cloudPhoneId}
                  maxLength={40}
                  disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, cloudPhoneId: e.target.value.trim() }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Token Permanente (Access Token)</Label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="EAAG..."
                    value={form.cloudToken}
                    maxLength={500}
                    disabled={locked}
                    onChange={(e) => setForm((f) => ({ ...f, cloudToken: e.target.value.trim() }))}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowToken((s) => !s)}>
                    {showToken ? "Ocultar" : "Ver"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Gerado em Meta → Business → System User com permissão whatsapp_business_messaging.</p>
              </div>
            </div>
            <WabaIdField storeId={storeId} locked={locked} />
            <WaTemplatePicker
              storeId={storeId}
              locked={locked}
              name={form.cloudTemplateName}
              lang={form.cloudTemplateLang}
              onChange={(name, lang) =>
                setForm((f) => ({ ...f, cloudTemplateName: name, cloudTemplateLang: lang }))
              }
            />
          </>
        )}

        {form.provider === "zapi" && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Instance ID</Label>
              <Input value={form.zapiInstance} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, zapiInstance: e.target.value.trim() }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Token</Label>
              <Input type="password" value={form.zapiToken} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, zapiToken: e.target.value.trim() }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Client-Token</Label>
              <Input type="password" value={form.zapiClientToken} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, zapiClientToken: e.target.value.trim() }))} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Switch checked={form.active} disabled={locked} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          <Label>Envio automático ativo</Label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          <Button onClick={() => save.mutate()} disabled={save.isPending || locked || !dirty}>
            <Save className="mr-2 h-4 w-4" /> {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
          {isConfigured && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Reconfigurar
            </Button>
          )}
          {editing && dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                if (!q.data) return;
                setForm({
                  provider: q.data.provider,
                  fromNumber: q.data.from_number ?? "",
                  active: q.data.active,
                  cloudToken: q.data.cloud_token ?? "",
                  cloudPhoneId: q.data.cloud_phone_id ?? "",
                  cloudTemplateName: q.data.cloud_template_name ?? "",
                  cloudTemplateLang: q.data.cloud_template_lang ?? "pt_BR",
                  zapiInstance: q.data.zapi_instance_id ?? "",
                  zapiToken: q.data.zapi_token ?? "",
                  zapiClientToken: q.data.zapi_client_token ?? "",
                });
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          )}
          <div className="flex-1" />
          {form.provider === "cloud" && (
            <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
              <Switch
                id="use-tpl-test"
                checked={useTemplateForTest}
                onCheckedChange={setUseTemplateForTest}
              />
              <Label htmlFor="use-tpl-test" className="text-xs cursor-pointer">
                Enviar como template
              </Label>
            </div>
          )}
          <Input
            className="max-w-[220px]"
            placeholder="Telefone p/ testar (55...)"
            value={testPhone}
            maxLength={20}
            onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ""))}
          />
          <Button
            variant="outline"
            disabled={test.isPending}
            onClick={() => {
              const phone = testPhone.trim();
              if (!phone) {
                toast.error("Informe um telefone com DDI (ex: 5511999999999)");
                return;
              }
              if (!isConfigured) {
                toast.error("Salve as credenciais antes de testar.");
                return;
              }
              test.mutate();
            }}
          >
            <Send className="mr-2 h-4 w-4" /> {test.isPending ? "Enviando…" : "Testar envio"}
          </Button>

        </div>

        {lastTest && !lastTest.ok && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm">Erro no envio de teste</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <div className="font-mono break-all">{lastTest.error}</div>
              {lastTest.errorDetails && (
                <div className="mt-1 grid grid-cols-1 gap-0.5 rounded bg-destructive/10 p-2 font-mono text-[11px]">
                  {lastTest.errorDetails.http_status != null && (
                    <div><span className="opacity-70">HTTP:</span> {lastTest.errorDetails.http_status}</div>
                  )}
                  {lastTest.errorDetails.message && (
                    <div><span className="opacity-70">message:</span> {lastTest.errorDetails.message}</div>
                  )}
                  {lastTest.errorDetails.code != null && (
                    <div><span className="opacity-70">code:</span> {lastTest.errorDetails.code}</div>
                  )}
                  {lastTest.errorDetails.error_subcode != null && (
                    <div><span className="opacity-70">error_subcode:</span> {lastTest.errorDetails.error_subcode}</div>
                  )}
                  {lastTest.errorDetails.error_user_title && (
                    <div><span className="opacity-70">error_user_title:</span> {lastTest.errorDetails.error_user_title}</div>
                  )}
                  {lastTest.errorDetails.error_user_msg && (
                    <div><span className="opacity-70">error_user_msg:</span> {lastTest.errorDetails.error_user_msg}</div>
                  )}
                  {lastTest.errorDetails.fbtrace_id && (
                    <div><span className="opacity-70">fbtrace_id:</span> {lastTest.errorDetails.fbtrace_id}</div>
                  )}
                  {lastTest.errorDetails.type && (
                    <div><span className="opacity-70">type:</span> {lastTest.errorDetails.type}</div>
                  )}
                  {lastTest.errorDetails.details && (
                    <div><span className="opacity-70">details:</span> {lastTest.errorDetails.details}</div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        {lastTest?.ok && (
          <Alert className="py-2 border-emerald-500/40 bg-emerald-500/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-sm">Enviado com sucesso</AlertTitle>
            {lastTest.messageId && (
              <AlertDescription className="text-xs font-mono">id: {lastTest.messageId}</AlertDescription>
            )}
          </Alert>
        )}
        {!lastTest && q.data?.last_test_error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm">Último teste falhou</AlertTitle>
            <AlertDescription className="text-xs">{q.data.last_test_error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}


function StageDot({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function WaOrdersPanel({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-orders", storeId],
    queryFn: () => listWaOrders({ data: { store_id: storeId! } }),
    enabled: !!storeId,
    refetchInterval: 20000,
  });
  const resend = useMutation({
    mutationFn: (link_id: string) => resendWaConfirmation({ data: { link_id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Confirmação reenviada!");
      else toast.error(`Falhou: ${r.error ?? "erro"}`);
      qc.invalidateQueries({ queryKey: ["wa-orders", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao reenviar"),
  });

  const orders = q.data?.orders ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4" /> Pedidos gerados por WhatsApp
          <Badge variant="secondary">{orders.length}</Badge>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum pedido gerado por WhatsApp ainda.
          </div>
        )}
        {orders.map((o: any) => {
          const items = Array.isArray(o.items) ? o.items : [];
          const total = Number(o.paid_amount ?? o.amount ?? 0);
          const failed = o.stages.failed_send;
          return (
            <div key={o.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">#{o.code}</span>
                  <Badge variant={o.status === "paid" ? "default" : "outline"}>
                    {o.status ?? "pending"}
                  </Badge>
                  {o.fulfillment?.mode === "pickup" ? (
                    <Badge variant="secondary">🏪 Retirada</Badge>
                  ) : o.fulfillment?.mode === "delivery" ? (
                    <Badge variant="secondary">🚚 Entrega</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">R$ {total.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">{fmt(o.created_at)}</span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {items.map((l: any, i: number) => (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    {l.qty}x {l.name}
                  </span>
                ))}
              </div>

              {o.fulfillment?.mode === "delivery" && (
                <div className="text-xs text-muted-foreground">
                  📍 {o.fulfillment.cep ? `CEP ${o.fulfillment.cep} — ` : ""}
                  {o.fulfillment.address}
                  {o.fulfillment.city ? ` / ${o.fulfillment.city}` : ""}
                  {o.fulfillment.notes ? ` (${o.fulfillment.notes})` : ""}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <StageDot done={o.stages.link_created} label="Link criado" />
                <StageDot done={o.stages.order_confirmed} label="Confirmado" />
                <StageDot done={o.stages.paid} label="Pago" />
                <StageDot done={o.stages.stock_baixa} label="Estoque baixado" />
                <StageDot done={o.stages.confirmation_sent} label="Msg enviada" />
              </div>

              {failed && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Falha ao enviar confirmação</AlertTitle>
                  <AlertDescription className="text-xs">
                    {o.confirmation_attempts} tentativa(s). Último erro: {o.confirmation_last_error ?? "—"}
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(o.id)}
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" /> Reenviar agora
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function WabaIdField({ storeId, locked }: { storeId: string; locked: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-waba", storeId],
    queryFn: () => getWaWabaId({ data: { store_id: storeId } }),
  });
  const [value, setValue] = useState("");
  useEffect(() => { setValue(q.data?.waba_id ?? ""); }, [q.data]);
  const save = useMutation({
    mutationFn: () => saveWaWabaId({ data: { store_id: storeId, waba_id: value.trim() || null } }),
    onSuccess: () => {
      toast.success("WABA ID salvo!");
      qc.invalidateQueries({ queryKey: ["wa-waba", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });
  const dirty = (q.data?.waba_id ?? "") !== value;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
      <div className="space-y-1.5">
        <Label>WhatsApp Business Account ID (WABA ID)</Label>
        <Input
          placeholder="112233445566778"
          value={value}
          maxLength={40}
          disabled={locked}
          onChange={(e) => setValue(e.target.value.trim())}
        />
        <p className="text-xs text-muted-foreground">
          Necessário para sincronizar templates aprovados na Meta. Encontrado em Business Manager → WhatsApp Accounts → ID da conta.
        </p>
      </div>
      <Button size="sm" variant="secondary" disabled={locked || !dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Salvando…" : "Salvar WABA"}
      </Button>
    </div>
  );
}

function WaTemplatePicker({
  storeId,
  locked,
  name,
  lang,
  onChange,
}: {
  storeId: string;
  locked: boolean;
  name: string;
  lang: string;
  onChange: (name: string, lang: string) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa-templates", storeId],
    queryFn: () => listWaTemplates({ data: { store_id: storeId } }),
  });
  const rows = (q.data?.rows ?? []) as Array<{
    name: string;
    language: string;
    status: string;
    category: string | null;
    body_text: string | null;
  }>;
  const approved = rows.filter((r) => (r.status ?? "").toUpperCase() === "APPROVED");
  const names = Array.from(new Set(approved.map((r) => r.name))).sort();
  const langsForName = approved.filter((r) => r.name === name).map((r) => r.language);
  const preview = approved.find((r) => r.name === name && r.language === lang);

  // Auto-sync automático quando não há nenhum template salvo
  const [autoSynced, setAutoSynced] = useState(false);
  const sync = useMutation({
    mutationFn: () => syncWaTemplates({ data: { store_id: storeId } }),
    onSuccess: (r: any) => {
      toast.success(`Templates sincronizados (${r?.synced ?? 0}/${r?.total ?? 0})`);
      qc.invalidateQueries({ queryKey: ["wa-templates", storeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar"),
  });
  useEffect(() => {
    if (!autoSynced && q.isFetched && rows.length === 0 && !sync.isPending) {
      setAutoSynced(true);
      sync.mutate();
    }
  }, [autoSynced, q.isFetched, rows.length, sync]);

  const nameInvalid = !!name && !names.includes(name);
  const langInvalid = !!name && !nameInvalid && !!lang && !langsForName.includes(lang);

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-medium">Template padrão (obrigatório fora da janela de 24h)</div>
          <div className="text-xs text-muted-foreground">
            {approved.length} template(s) APPROVED sincronizado(s) da Meta.
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {sync.isPending ? "Sincronizando…" : "Sincronizar da Meta"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome do template</Label>
          <Select
            value={name || undefined}
            onValueChange={(v) => {
              const langs = approved.filter((r) => r.name === v).map((r) => r.language);
              const nextLang = langs.includes(lang) ? lang : langs[0] ?? "pt_BR";
              onChange(v, nextLang);
            }}
            disabled={locked || names.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={names.length === 0 ? "Sincronize os templates primeiro" : "Selecione…"} />
            </SelectTrigger>
            <SelectContent>
              {names.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {nameInvalid && (
            <p className="text-xs text-destructive">
              "{name}" não existe entre os templates aprovados. Escolha outro.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Idioma (language code)</Label>
          <Select
            value={lang || undefined}
            onValueChange={(v) => onChange(name, v)}
            disabled={locked || !name || langsForName.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um template primeiro" />
            </SelectTrigger>
            <SelectContent>
              {langsForName.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {langInvalid && (
            <p className="text-xs text-destructive">
              O template "{name}" não existe no idioma "{lang}". Idiomas disponíveis: {langsForName.join(", ") || "—"}.
            </p>
          )}
        </div>
      </div>

      {preview?.body_text && (
        <div className="rounded border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Preview</div>
          <div className="text-xs whitespace-pre-wrap">{preview.body_text}</div>
        </div>
      )}
    </div>
  );
}
