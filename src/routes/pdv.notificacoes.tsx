import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell, CheckCheck, ExternalLink, Send, CheckCircle2, XCircle, AlertCircle,
  Eye, EyeOff, Save, Zap, CreditCard, Star, Trash2, Plus, Wifi,
  ScrollText, RefreshCw, ChevronDown, ChevronRight, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { usePdvAuth } from "@/lib/pdv-auth";
import {
  listNotifications, markNotificationRead, markAllRead,
  getWaSettings, saveWaSettings, sendQueuedReminders, testWaSend, runPaymentsDailyNow,
  type WaSettings,
} from "@/lib/pdv-notifications.functions";
import {
  listGateways, upsertGateway, setDefaultGateway, toggleGateway, deleteGateway, testGateway,
  type GatewayRow,
} from "@/lib/pdv-gateways.functions";
import {
  listWebhookEvents, retryWebhookEvent, type WebhookEventRow,
} from "@/lib/pdv-webhook-logs.functions";
import { runReconcileNow } from "@/lib/pdv-reconciliation.functions";
import { SplitsPanel } from "@/components/pdv/SplitsPanel";

export const Route = createFileRoute("/pdv/notificacoes")({
  component: NotificationsPage,
});

const sevColor: Record<string, string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  error: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10 font-mono text-xs"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function NotificationsPage() {
  const { user } = usePdvAuth();
  const { currentStoreId } = useCurrentStore();
  const qc = useQueryClient();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [tab, setTab] = React.useState<"all" | "wa" | "gw" | "logs" | "splits">("all");

  const listFn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllRead);
  const getWaFn = useServerFn(getWaSettings);
  const saveWaFn = useServerFn(saveWaSettings);
  const sendFn = useServerFn(sendQueuedReminders);
  const testFn = useServerFn(testWaSend);
  const runNowFn = useServerFn(runPaymentsDailyNow);
  const [runningNow, setRunningNow] = React.useState(false);
  const [runResult, setRunResult] = React.useState<any>(null);

  async function handleRunNow() {
    setRunningNow(true); setRunResult(null);
    try {
      const r = await runNowFn({});
      setRunResult(r);
      qc.invalidateQueries({ queryKey: ["notifs"] });
    } catch (e) {
      setRunResult({ error: (e as Error).message });
    } finally {
      setRunningNow(false);
    }
  }

  const notifs = useQuery({
    queryKey: ["notifs", currentStoreId],
    queryFn: () => listFn({ data: { storeId: currentStoreId!, limit: 200 } }),
    enabled: !!currentStoreId,
    refetchInterval: 30000,
  });

  const wa = useQuery({
    queryKey: ["wa-settings", currentStoreId],
    queryFn: () => getWaFn({ data: { storeId: currentStoreId! } }),
    enabled: !!currentStoreId && canManage,
  });

  const [form, setForm] = React.useState<WaSettings | null>(null);
  const [testPhone, setTestPhone] = React.useState("");
  const [useTemplate, setUseTemplate] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    if (wa.data) setForm(wa.data);
  }, [wa.data]);

  const setField = <K extends keyof WaSettings>(k: K, v: WaSettings[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };

  async function handleMark(id: string) {
    await markFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["notifs"] });
    qc.invalidateQueries({ queryKey: ["notifs-count"] });
  }

  async function handleMarkAll() {
    if (!currentStoreId) return;
    const res = await markAllFn({ data: { storeId: currentStoreId } });
    toast.success(`${res.count} marcada(s) como lida(s)`);
    qc.invalidateQueries({ queryKey: ["notifs"] });
    qc.invalidateQueries({ queryKey: ["notifs-count"] });
  }

  async function handleSave() {
    if (!currentStoreId || !form) return;
    setSaving(true);
    try {
      await saveWaFn({
        data: {
          storeId: currentStoreId,
          provider: form.provider,
          fromNumber: form.from_number ?? null,
          active: form.active,
          cloudToken: form.cloud_token ?? null,
          cloudPhoneId: form.cloud_phone_id ?? null,
          cloudTemplateName: form.cloud_template_name ?? null,
          cloudTemplateLang: form.cloud_template_lang ?? "pt_BR",
          zapiInstance: form.zapi_instance_id ?? null,
          zapiToken: form.zapi_token ?? null,
          zapiClientToken: form.zapi_client_token ?? null,
        },
      });
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["wa-settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!currentStoreId || !testPhone.trim()) {
      toast.error("Informe um número de teste");
      return;
    }
    setTesting(true);
    try {
      const res = await testFn({
        data: { storeId: currentStoreId, phone: testPhone, useTemplate },
      });
      if (res.ok) {
        toast.success(`Enviado via ${res.provider}${res.messageId ? ` · ID ${res.messageId.slice(0, 12)}…` : ""}`);
      } else {
        toast.error(`Falha: ${res.error}`);
      }
      qc.invalidateQueries({ queryKey: ["wa-settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSendNow() {
    try {
      const res = await sendFn({ data: { limit: 50 } });
      toast.success(`Envio: ${res.sent} ok · ${res.failed} falhas · ${res.attempted} tentativas`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Central de Notificações</h1>
          <p className="text-sm text-muted-foreground">Alertas internos e envio automático de WhatsApp</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <CheckCheck className="mr-1.5 h-4 w-4" /> Marcar todas
          </Button>
          {canManage && (
            <Button size="sm" onClick={handleSendNow}>
              <Send className="mr-1.5 h-4 w-4" /> Enviar fila
            </Button>
          )}
        </div>
      </header>

      <PushDeviceCard storeId={currentStoreId} />



      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all"><Bell className="mr-1.5 h-4 w-4" /> Alertas</TabsTrigger>
          {canManage && <TabsTrigger value="wa"><Zap className="mr-1.5 h-4 w-4" /> WhatsApp</TabsTrigger>}
          {canManage && <TabsTrigger value="gw"><CreditCard className="mr-1.5 h-4 w-4" /> Gateways</TabsTrigger>}
          {canManage && <TabsTrigger value="logs"><ScrollText className="mr-1.5 h-4 w-4" /> Logs</TabsTrigger>}
          {canManage && <TabsTrigger value="splits"><Wallet className="mr-1.5 h-4 w-4" /> Splits</TabsTrigger>}
        </TabsList>
      </Tabs>

      {tab === "splits" && canManage && <SplitsPanel />}

      {tab === "all" && (
        <Card>
          <CardHeader><CardTitle>Últimos alertas</CardTitle></CardHeader>
          <CardContent className="p-0">
            {notifs.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
            {notifs.data && notifs.data.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">Nenhuma notificação.</p>
            )}
            <ul className="divide-y divide-border">
              {(notifs.data ?? []).map((n) => (
                <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.is_read ? "opacity-60" : ""}`}>
                  <span className={`mt-1 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${sevColor[n.severity] ?? sevColor.info}`}>
                    {n.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{n.title}</p>
                      <Badge variant="outline" className="text-[10px]">{n.kind}</Badge>
                    </div>
                    {n.message && <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{fmt(n.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {n.link_url && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link to={n.link_url as any}><ExternalLink className="h-4 w-4" /></Link>
                      </Button>
                    )}
                    {!n.is_read && (
                      <Button variant="ghost" size="sm" onClick={() => handleMark(n.id)}>Ler</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {tab === "wa" && canManage && form && (
        <div className="space-y-4">
          {/* Status */}
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              {form.verified_at ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Conectado</p>
                    <p className="text-xs text-muted-foreground">Último teste: {fmt(form.last_test_at)}</p>
                  </div>
                </>
              ) : form.last_test_error ? (
                <>
                  <XCircle className="h-5 w-5 text-rose-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Falha no último teste</p>
                    <p className="text-xs text-muted-foreground">{form.last_test_error}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Ainda não verificado</p>
                    <p className="text-xs text-muted-foreground">Preencha as credenciais e clique em "Testar envio"</p>
                  </div>
                </>
              )}
              <Badge variant={form.active ? "default" : "secondary"}>
                {form.active ? "Ativo" : "Desligado"}
              </Badge>
            </CardContent>
          </Card>

          {/* Geral */}
          <Card>
            <CardHeader>
              <CardTitle>Provedor</CardTitle>
              <CardDescription>Escolha como o sistema enviará mensagens automáticas para os clientes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provedor</Label>
                  <Select value={form.provider} onValueChange={(v) => setField("provider", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wa_link">wa.me — link manual (grátis, sem envio automático)</SelectItem>
                      <SelectItem value="cloud">WhatsApp Cloud API — Meta oficial (1.000/mês grátis)</SelectItem>
                      <SelectItem value="zapi">Z-API — não oficial, mais simples</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Número da loja (opcional)</Label>
                  <Input value={form.from_number ?? ""} onChange={(e) => setField("from_number", e.target.value)} placeholder="+55 11 99999-9999" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setField("active", v)} id="wa-active" />
                <Label htmlFor="wa-active">Envio automático ativo (cron diário)</Label>
              </div>
            </CardContent>
          </Card>

          {/* Cloud API */}
          {form.provider === "cloud" && (
            <Card>
              <CardHeader>
                <CardTitle>Credenciais — WhatsApp Cloud API (Meta)</CardTitle>
                <CardDescription>
                  Obtenha em <a className="underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> → seu app → WhatsApp → API Setup
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Access Token (permanente)</Label>
                  <SecretInput
                    value={form.cloud_token ?? ""}
                    onChange={(v) => setField("cloud_token", v)}
                    placeholder="EAAxxx… (System User Token)"
                  />
                  <p className="text-xs text-muted-foreground">Gere em <em>Business Settings → Usuários do sistema → Gerar token</em> com permissões <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code>.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number ID</Label>
                  <Input
                    value={form.cloud_phone_id ?? ""}
                    onChange={(e) => setField("cloud_phone_id", e.target.value)}
                    placeholder="123456789012345"
                    className="font-mono text-xs"
                  />
                </div>
                <Separator />
                <div>
                  <p className="mb-2 text-sm font-medium">Template para cobrança (opcional)</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Templates aprovados pela Meta são obrigatórios para enviar mensagem a clientes que não responderam nas últimas 24h. Sem template, só funciona dentro da janela de conversa.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Nome do template</Label>
                      <Input
                        value={form.cloud_template_name ?? ""}
                        onChange={(e) => setField("cloud_template_name", e.target.value)}
                        placeholder="cobranca_padrao"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Idioma</Label>
                      <Input
                        value={form.cloud_template_lang ?? "pt_BR"}
                        onChange={(e) => setField("cloud_template_lang", e.target.value)}
                        placeholder="pt_BR"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Z-API */}
          {form.provider === "zapi" && (
            <Card>
              <CardHeader>
                <CardTitle>Credenciais — Z-API</CardTitle>
                <CardDescription>
                  Obtenha em <a className="underline" href="https://app.z-api.io" target="_blank" rel="noreferrer">app.z-api.io</a> → sua instância
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Instance ID</Label>
                    <Input
                      value={form.zapi_instance_id ?? ""}
                      onChange={(e) => setField("zapi_instance_id", e.target.value)}
                      placeholder="3D…"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Token da instância</Label>
                    <SecretInput
                      value={form.zapi_token ?? ""}
                      onChange={(v) => setField("zapi_token", v)}
                      placeholder="F…"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Client-Token (Security Token, opcional mas recomendado)</Label>
                  <SecretInput
                    value={form.zapi_client_token ?? ""}
                    onChange={(v) => setField("zapi_client_token", v)}
                    placeholder="F…"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Salvar + Teste */}
          <Card>
            <CardHeader><CardTitle>Testar envio</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr,auto]">
                <div className="space-y-1.5">
                  <Label>Número (com DDD)</Label>
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="11 99999-9999"
                  />
                </div>
                <div className="flex items-end gap-2">
                  {form.provider === "cloud" && form.cloud_template_name && (
                    <div className="flex items-center gap-2 pb-2">
                      <Switch checked={useTemplate} onCheckedChange={setUseTemplate} id="use-tpl" />
                      <Label htmlFor="use-tpl" className="text-xs">Usar template</Label>
                    </div>
                  )}
                  <Button onClick={handleTest} disabled={testing || !form.active}>
                    <Send className="mr-1.5 h-4 w-4" />
                    {testing ? "Enviando…" : "Testar"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Envia uma mensagem de teste real com as credenciais atuais. Salve antes de testar.
              </p>
            </CardContent>
          </Card>

          {/* Executar cron manualmente */}
          <Card>
            <CardHeader><CardTitle>Executar cobranças agora</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Roda o mesmo pipeline do cron diário: gera fila de cobranças, expira links vencidos e dispara mensagens via WhatsApp usando as credenciais salvas de cada loja. Útil para validar a configuração sem esperar até as 09h.
              </p>
              <Button onClick={handleRunNow} disabled={runningNow} variant="outline">
                <Send className="mr-1.5 h-4 w-4" />
                {runningNow ? "Executando…" : "Rodar cron agora"}
              </Button>
              {runResult && (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
{JSON.stringify(runResult, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>

          <div className="sticky bottom-4 flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Salvando…" : "Salvar configuração"}
            </Button>
          </div>
        </div>
      )}

      {tab === "gw" && canManage && currentStoreId && (
        <GatewaysPanel storeId={currentStoreId} />
      )}

      {tab === "logs" && canManage && (
        <WebhookLogsPanel />
      )}
    </div>
  );
}

/* ============================================================
 *  Painel de Gateways de Pagamento (Onda F)
 * ============================================================ */

type ProviderId = "mercadopago" | "asaas" | "pagbank" | "pagarme";

const PROVIDER_META: Record<ProviderId, { label: string; hint: string; disabled?: boolean }> = {
  mercadopago: { label: "Mercado Pago", hint: "PIX, Cartão e Boleto (via checkout)" },
  asaas:       { label: "Asaas", hint: "PIX grátis, Boleto R$ 1,99 e Link de Pagamento" },
  pagbank:     { label: "PagBank / PagSeguro", hint: "PIX, Boleto e Checkout (Cartão)" },
  pagarme:     { label: "Pagar.me (Stone)", hint: "PIX, Boleto e Checkout (Cartão)" },
};

function GatewaysPanel({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGateways);
  const upsertFn = useServerFn(upsertGateway);
  const setDefaultFn = useServerFn(setDefaultGateway);
  const toggleFn = useServerFn(toggleGateway);
  const deleteFn = useServerFn(deleteGateway);
  const testFn = useServerFn(testGateway);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<GatewayRow | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  const q = useQuery({
    queryKey: ["gateways", storeId],
    queryFn: () => listFn({ data: { storeId } }),
  });

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await testFn({ data: { id } });
      if (res.ok) toast.success("Conexão OK");
      else toast.error(`Falha: ${res.message ?? "erro"}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setTestingId(null); }
  }

  async function handleSetDefault(id: string) {
    try {
      await setDefaultFn({ data: { id, storeId } });
      toast.success("Definido como padrão");
      qc.invalidateQueries({ queryKey: ["gateways", storeId] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await toggleFn({ data: { id, active } });
      qc.invalidateQueries({ queryKey: ["gateways", storeId] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este gateway?")) return;
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["gateways", storeId] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gateways de Pagamento</CardTitle>
              <CardDescription>Provedores por loja. Um deles pode ser marcado como padrão para PIX, links e boletos.</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
          {q.data && q.data.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum gateway configurado. Enquanto isso, o sistema usa Mercado Pago com as credenciais globais (env).
            </p>
          )}
          <ul className="divide-y divide-border">
            {(q.data ?? []).map((g) => {
              const meta = PROVIDER_META[g.provider as ProviderId];
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{meta?.label ?? g.provider}</p>
                      {g.is_default && <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30" variant="outline"><Star className="mr-1 h-3 w-3" /> Padrão</Badge>}
                      {g.config?.sandbox && <Badge variant="outline">Sandbox</Badge>}
                      {!g.active && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{meta?.hint}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={testingId === g.id} onClick={() => handleTest(g.id)}>
                      <Wifi className="mr-1 h-4 w-4" />{testingId === g.id ? "Testando…" : "Testar"}
                    </Button>
                    {!g.is_default && g.active && (
                      <Button variant="ghost" size="sm" onClick={() => handleSetDefault(g.id)}>
                        <Star className="mr-1 h-4 w-4" /> Padrão
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(g); setDialogOpen(true); }}>
                      Editar
                    </Button>
                    <Switch checked={g.active} onCheckedChange={(v) => handleToggle(g.id, v)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600" onClick={() => handleDelete(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Endpoints de webhook</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p><strong>Mercado Pago:</strong> configure no painel MP como <code className="rounded bg-muted px-1">/api/public/mp-webhook?secret=&lt;MP_WEBHOOK_SECRET&gt;</code></p>
          <p><strong>Asaas:</strong> em Configurações → Notificações → Webhooks aponte para <code className="rounded bg-muted px-1">/api/public/asaas-webhook</code> e cole no campo <em>Token de autenticação</em> o mesmo valor do "Webhook token" salvo aqui.</p>
          <p><strong>PagBank:</strong> em Vendas Online → Notificações (URLs) aponte para <code className="rounded bg-muted px-1">/api/public/pagbank-webhook</code> e informe o mesmo <em>Token de autenticidade</em> salvo aqui.</p>
          <p><strong>Pagar.me:</strong> em Dashboard → Postbacks aponte para <code className="rounded bg-muted px-1">/api/public/pagarme-webhook</code> e informe o mesmo <em>secret</em> salvo aqui (validamos via HMAC-SHA256).</p>
        </CardContent>
      </Card>

      <GatewayDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        storeId={storeId}
        current={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["gateways", storeId] })}
        upsertFn={upsertFn}
      />
    </div>
  );
}

function GatewayDialog({
  open, onClose, storeId, current, onSaved, upsertFn,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  current: GatewayRow | null;
  onSaved: () => void;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertGateway>>;
}) {
  const [provider, setProvider] = React.useState<ProviderId>("asaas");
  const [sandbox, setSandbox] = React.useState(true);
  const [isDefault, setIsDefault] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // MP
  const [mpToken, setMpToken] = React.useState("");
  const [mpSecret, setMpSecret] = React.useState("");
  // Asaas
  const [asaasKey, setAsaasKey] = React.useState("");
  const [asaasWh, setAsaasWh] = React.useState("");
  // PagBank
  const [pbToken, setPbToken] = React.useState("");
  const [pbWh, setPbWh] = React.useState("");
  // Pagar.me
  const [pmSecret, setPmSecret] = React.useState("");
  const [pmWh, setPmWh] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (current) {
      setProvider(current.provider as ProviderId);
      setSandbox(!!current.config?.sandbox);
      setIsDefault(!!current.is_default);
      setMpToken(current.config?.access_token ?? "");
      setMpSecret(current.config?.webhook_secret ?? "");
      setAsaasKey(current.config?.api_key ?? "");
      setAsaasWh(current.config?.webhook_token ?? "");
      setPbToken(current.config?.token ?? current.config?.access_token ?? "");
      setPbWh(current.config?.webhook_token ?? "");
      setPmSecret(current.config?.secret_key ?? current.config?.api_key ?? "");
      setPmWh(current.config?.webhook_token ?? "");
    } else {
      setProvider("asaas"); setSandbox(true); setIsDefault(false);
      setMpToken(""); setMpSecret(""); setAsaasKey(""); setAsaasWh("");
      setPbToken(""); setPbWh(""); setPmSecret(""); setPmWh("");
    }
  }, [open, current]);

  const meta = PROVIDER_META[provider];

  async function handleSave() {
    setSaving(true);
    try {
      const config: Record<string, any> = {};
      if (provider === "mercadopago") {
        if (!mpToken.trim()) throw new Error("Informe o Access Token");
        config.access_token = mpToken.trim();
        if (mpSecret.trim()) config.webhook_secret = mpSecret.trim();
      } else if (provider === "asaas") {
        if (!asaasKey.trim()) throw new Error("Informe a API Key");
        config.api_key = asaasKey.trim();
        if (asaasWh.trim()) config.webhook_token = asaasWh.trim();
      } else if (provider === "pagbank") {
        if (!pbToken.trim()) throw new Error("Informe o Token do PagBank");
        config.token = pbToken.trim();
        if (pbWh.trim()) config.webhook_token = pbWh.trim();
      } else if (provider === "pagarme") {
        if (!pmSecret.trim()) throw new Error("Informe a Secret Key do Pagar.me");
        config.secret_key = pmSecret.trim();
        if (pmWh.trim()) config.webhook_token = pmWh.trim();
      }
      await upsertFn({
        data: {
          id: current?.id ?? null,
          storeId,
          provider,
          sandbox,
          config,
          active: true,
          isDefault,
        },
      });
      toast.success("Gateway salvo");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{current ? "Editar" : "Adicionar"} gateway</DialogTitle>
          <DialogDescription>Credenciais ficam salvas de forma privada para esta loja.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Provedor</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_META) as ProviderId[]).map((p) => (
                  <SelectItem key={p} value={p} disabled={PROVIDER_META[p].disabled}>
                    {PROVIDER_META[p].label} {PROVIDER_META[p].disabled ? "— em breve" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={sandbox} onCheckedChange={setSandbox} id="gw-sb" />
            <Label htmlFor="gw-sb">Ambiente de teste (sandbox)</Label>
          </div>

          {provider === "mercadopago" && (
            <>
              <div className="space-y-1.5">
                <Label>Access Token</Label>
                <SecretInput value={mpToken} onChange={setMpToken} placeholder="APP_USR-…" />
                <p className="text-xs text-muted-foreground">Painel MP → Suas integrações → Credenciais.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Webhook Secret (opcional)</Label>
                <SecretInput value={mpSecret} onChange={setMpSecret} placeholder="segredo do querystring ?secret=" />
              </div>
            </>
          )}

          {provider === "asaas" && (
            <>
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <SecretInput value={asaasKey} onChange={setAsaasKey} placeholder="$aact_…" />
                <p className="text-xs text-muted-foreground">Painel Asaas → Integrações → API Asaas → gerar chave.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Webhook Token</Label>
                <SecretInput value={asaasWh} onChange={setAsaasWh} placeholder="crie um segredo forte" />
                <p className="text-xs text-muted-foreground">Cole este mesmo valor em Painel Asaas → Notificações → Webhooks → Token de autenticação. URL do webhook: <code className="rounded bg-muted px-1">/api/public/asaas-webhook</code>.</p>
              </div>
            </>
          )}

          {provider === "pagbank" && (
            <>
              <div className="space-y-1.5">
                <Label>Token de Acesso</Label>
                <SecretInput value={pbToken} onChange={setPbToken} placeholder="chave privada da conexão de aplicação" />
                <p className="text-xs text-muted-foreground">Painel PagBank → Vendas Online → Integrações → Conexão de aplicação (chave privada).</p>
              </div>
              <div className="space-y-1.5">
                <Label>Webhook Token</Label>
                <SecretInput value={pbWh} onChange={setPbWh} placeholder="crie um segredo forte" />
                <p className="text-xs text-muted-foreground">Cole em Painel PagBank → Notificações (URLs) → Token de autenticidade. URL do webhook: <code className="rounded bg-muted px-1">/api/public/pagbank-webhook</code>.</p>
              </div>
            </>
          )}

          {provider === "pagarme" && (
            <>
              <div className="space-y-1.5">
                <Label>Secret Key</Label>
                <SecretInput value={pmSecret} onChange={setPmSecret} placeholder="sk_test_… ou sk_…" />
                <p className="text-xs text-muted-foreground">Dashboard Pagar.me → Desenvolvedores → Chaves → Secret Key.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Webhook Token / Secret</Label>
                <SecretInput value={pmWh} onChange={setPmWh} placeholder="crie um segredo forte" />
                <p className="text-xs text-muted-foreground">Dashboard → Postbacks → informe a mesma secret aqui. URL: <code className="rounded bg-muted px-1">/api/public/pagarme-webhook</code>. Aceita HMAC-SHA256 (<code>X-Hub-Signature</code>) ou token direto.</p>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} id="gw-def" />
            <Label htmlFor="gw-def">Definir como gateway padrão desta loja</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 *  Painel de Logs de Webhook (Onda F/G/H)
 * ============================================================ */

const APPLY_STATUS_META: Record<string, { label: string; className: string }> = {
  applied: { label: "Aplicado", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  pending: { label: "Pendente", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  ignored: { label: "Ignorado", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
  error:   { label: "Erro",     className: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
};

function WebhookLogsPanel() {
  const listFn = useServerFn(listWebhookEvents);
  const retryFn = useServerFn(retryWebhookEvent);
  const reconcileFn = useServerFn(runReconcileNow);
  const qc = useQueryClient();

  const [provider, setProvider] = React.useState<"all" | ProviderId>("all");
  const [status, setStatus] = React.useState<"all" | "pending" | "applied" | "ignored" | "error">("all");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const [reconciling, setReconciling] = React.useState(false);

  const q = useQuery({
    queryKey: ["webhook-events", provider, status],
    queryFn: () => listFn({
      data: {
        provider: provider === "all" ? null : provider,
        status: status === "all" ? null : status,
        limit: 100,
      },
    }),
    refetchInterval: 15000,
  });

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await retryFn({ data: { id } });
      if (res.ok) toast.success("Reprocessado");
      else toast.error(`Falha: ${res.message ?? "erro"}`);
      qc.invalidateQueries({ queryKey: ["webhook-events"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setRetryingId(null); }
  }

  async function handleReconcile() {
    setReconciling(true);
    try {
      const s = await reconcileFn({ data: {} });
      toast.success(`Reconciliação: ${s.updated} atualizado(s), ${s.scanned} escaneado(s)${s.errors ? `, ${s.errors} erro(s)` : ""}`);
      qc.invalidateQueries({ queryKey: ["webhook-events"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setReconciling(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Logs de webhook</CardTitle>
              <CardDescription>Todas as notificações recebidas dos gateways. Atualiza a cada 15s.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={provider} onValueChange={(v) => setProvider(v as any)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos provedores</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  <SelectItem value="asaas">Asaas</SelectItem>
                  <SelectItem value="pagbank">PagBank</SelectItem>
                  <SelectItem value="pagarme">Pagar.me</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="applied">Aplicado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="ignored">Ignorado</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button variant="default" size="sm" onClick={handleReconcile} disabled={reconciling}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${reconciling ? "animate-spin" : ""}`} />
                Reconciliar agora
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
          {q.data && q.data.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Nenhum evento no filtro atual.</p>
          )}
          <ul className="divide-y divide-border">
            {(q.data ?? []).map((ev: WebhookEventRow) => {
              const meta = APPLY_STATUS_META[ev.apply_status] ?? APPLY_STATUS_META.pending;
              const isOpen = expanded === ev.id;
              return (
                <li key={ev.id}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setExpanded(isOpen ? null : ev.id)}
                      title={isOpen ? "Recolher" : "Expandir"}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Badge variant="outline" className="uppercase">{ev.provider}</Badge>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    {ev.parsed_status && <Badge variant="secondary">{ev.parsed_status}</Badge>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {ev.external_ref ?? ev.provider_payment_id ?? "(sem referência)"}
                        {ev.amount != null && <span className="ml-2 text-muted-foreground">
                          R$ {Number(ev.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ev.received_at).toLocaleString("pt-BR")}
                        {ev.method ? ` · ${ev.method}` : ""}
                        {ev.apply_error ? ` · ${ev.apply_error}` : ""}
                      </p>
                    </div>
                    {(ev.apply_status === "error" || ev.apply_status === "pending") && ev.parsed && (
                      <Button size="sm" variant="outline"
                        disabled={retryingId === ev.id}
                        onClick={() => handleRetry(ev.id)}>
                        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${retryingId === ev.id ? "animate-spin" : ""}`} />
                        Reprocessar
                      </Button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="space-y-2 border-t bg-muted/30 px-4 py-3 text-[11px]">
                      {ev.raw_headers && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">Headers</summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-background p-2">{JSON.stringify(ev.raw_headers, null, 2)}</pre>
                        </details>
                      )}
                      {ev.parsed && (
                        <details open>
                          <summary className="cursor-pointer text-muted-foreground">Parsed</summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-background p-2">{JSON.stringify(ev.parsed, null, 2)}</pre>
                        </details>
                      )}
                      {ev.raw_body && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">Raw body</summary>
                          <pre className="mt-1 max-h-72 overflow-auto rounded bg-background p-2">{ev.raw_body}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Push do dispositivo ---------- */
import { usePushNotifications } from "@/lib/pdv-push-client";
import { BellRing, BellOff } from "lucide-react";

function PushDeviceCard({ storeId }: { storeId: string | null }) {
  const push = usePushNotifications(storeId);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-primary" /> Notificações do dispositivo
        </CardTitle>
        <CardDescription>
          Receba alertas em tempo real neste navegador — mesmo com a aba fechada — para novos pedidos da vitrine, PIX aprovado e contas vencidas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {push.state === "unsupported" ? (
          <span className="text-sm text-muted-foreground">Este navegador não suporta notificações push.</span>
        ) : push.state === "denied" ? (
          <span className="text-sm text-destructive">
            Permissão negada — ative manualmente nas configurações do navegador para este site.
          </span>
        ) : push.subscribed ? (
          <>
            <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ativo neste dispositivo
            </Badge>
            <Button size="sm" variant="outline" onClick={push.sendTest} disabled={push.busy}>
              <Send className="mr-1.5 h-4 w-4 text-primary" /> Enviar teste
            </Button>
            <Button size="sm" variant="ghost" onClick={push.unsubscribe} disabled={push.busy}>
              <BellOff className="mr-1.5 h-4 w-4 text-muted-foreground" /> Desativar
            </Button>
          </>
        ) : (
          <>
            <Badge variant="outline" className="gap-1">Inativo</Badge>
            <Button size="sm" onClick={push.subscribe} disabled={push.busy}>
              <BellRing className="mr-1.5 h-4 w-4" />
              {push.busy ? "Ativando…" : "Ativar notificações"}
            </Button>
          </>
        )}
        {push.error && <span className="text-xs text-destructive">{push.error}</span>}
      </CardContent>
    </Card>
  );
}

