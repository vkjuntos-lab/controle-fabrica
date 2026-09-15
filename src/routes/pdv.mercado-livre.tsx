import { createFileRoute } from "@tanstack/react-router";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  Plug,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Link as LinkIcon,
  Trash2,
  Globe,
  Clock,
  ExternalLink,
  ChevronRight,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { saveMeliConfig, getMeliAuthUrl, getMeliConfig } from "@/lib/marketplaces/mercadolivre.functions";

export const Route = createFileRoute("/pdv/mercado-livre")({
  component: MercadoLivrePage,
});

function MercadoLivrePage() {
  const { currentStoreId } = useCurrentStore();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const saveFn = useServerFn(saveMeliConfig);
  const getAuthFn = useServerFn(getMeliAuthUrl);
  const getConfigFn = useServerFn(getMeliConfig);

  const storeId = currentStoreId || "00000000-0000-0000-0000-000000000000";

  useEffect(() => {
    if (!currentStoreId) return;
    const loadConfig = async () => {
      try {
        const cfg = await getConfigFn({ data: { storeId } });
        console.log("Meli Config Loaded:", cfg);
        if (cfg) {
          setClientId(cfg.client_id || "");
          setIsConnected(cfg.isConnected || false);
        } else {
          setIsConnected(false);
        }
      } catch (err) {
        console.error("Erro ao carregar config:", err);
      }
    };
    loadConfig();
    
    // Polling opcional para verificar conexão após retorno do OAuth
    const timer = setInterval(loadConfig, 10000);
    return () => clearInterval(timer);
  }, [currentStoreId, storeId, getConfigFn]);
  

  const handleSaveConfig = async () => {
    if (!clientId || !clientSecret) {
      toast.error("Preencha as credenciais da aplicação");
      return;
    }
    
    setIsSaving(true);
    try {
      await saveFn({
        data: {
          storeId,
          clientId,
          clientSecret,
          redirectUri: `${window.location.origin}/api/public/meli/callback`
        }
      });
      toast.success("Configurações salvas. Agora você pode autorizar a conexão.");
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAuthorize = async () => {
    try {
      const { authUrl } = await getAuthFn({ data: { storeId } });
      window.location.href = authUrl; // Redireciona na mesma aba para evitar bloqueios de pop-up e garantir contexto
    } catch (error: any) {
      toast.error("Configure as credenciais primeiro");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Integrações {" > "} Mercado Livre</h2>
          <p className="text-xs text-muted-foreground">
            Sincronize seu catálogo e pedidos com a maior plataforma de e-commerce da América Latina.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
              Aguardando Configuração
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Credenciais da Aplicação</CardTitle>
            <CardDescription className="text-xs">
              Obtenha o Client ID e Client Secret no portal do desenvolvedor do Mercado Livre.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-id" className="text-xs">App ID (Client ID)</Label>
                <Input 
                  id="client-id" 
                  placeholder="Ex: 123456789" 
                  className="h-9 text-xs"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-secret" className="text-xs">Client Secret</Label>
                <Input 
                  id="client-secret" 
                  type="password" 
                  placeholder="••••••••••••" 
                  className="h-9 text-xs"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs"
                onClick={handleSaveConfig}
                disabled={isSaving}
              >
                {isSaving ? "Salvando..." : "Salvar Credenciais"}
              </Button>
              <Button 
                size="sm" 
                className="text-xs bg-amber-500 hover:bg-amber-600"
                onClick={handleAuthorize}
              >
                Vincular Conta Mercado Livre
                <ExternalLink className="ml-2 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Passos para Conexão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <RequirementItem 
                label="Dev Account" 
                status="ok" 
                desc="Crie uma conta no Mercado Libre Developers."
              />
              <RequirementItem 
                label="App Creation" 
                status="pending" 
                desc="Crie um app do tipo 'Payments & Orders'."
              />
              <div className="pt-2 border-t mt-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Configurações no Painel Meli</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[9px] text-muted-foreground">Redirect URI (OAuth)</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="bg-muted p-1 rounded text-[9px] flex-1 break-all">
                        {window.location.origin}/api/public/meli/callback
                      </code>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/public/meli/callback`);
                        toast.success("Copiado!");
                      }}>
                        <LinkIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground">Notification URL (Webhooks)</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="bg-muted p-1 rounded text-[9px] flex-1 break-all">
                        {window.location.origin}/api/public/meli/notifications
                      </code>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/public/meli/notifications`);
                        toast.success("Copiado!");
                      }}>
                        <LinkIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-[9px] font-bold text-muted-foreground mb-1 uppercase">Scopes Necessários:</p>
                <div className="flex flex-wrap gap-1">
                  {[
                    'offline_access', 'read', 'write', 
                    'contacts_read', 'contacts_write',
                    'questions_read', 'questions_write',
                    'messages_read', 'messages_write',
                    'orders_read', 'orders_write',
                    'items_read', 'items_write',
                    'payments_read', 'metrics_read'
                  ].map(s => (
                    <Badge key={s} variant="secondary" className="text-[8px] py-0 px-1">{s}</Badge>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground mt-2 leading-tight">
                  Marque todos os scopes acima para garantir o funcionamento do Inbox, Pedidos e Catálogo.
                </p>
              </div>
              <div className="pt-2 border-t">
                <p className="text-[9px] font-bold text-muted-foreground mb-1 uppercase">Tópicos de Notificação:</p>
                <div className="flex flex-wrap gap-1">
                  {['orders', 'messages', 'questions', 'items', 'payments', 'shipments', 'promotions'].map(t => (
                    <Badge key={t} variant="outline" className="text-[8px] py-0 px-1 border-cyan-500/30 text-cyan-500">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-4 rounded-lg bg-amber-500/5 p-3 text-[10px] text-amber-700 leading-relaxed border border-amber-500/10">
              <AlertCircle className="mb-1 h-3 w-3 text-amber-500 inline mr-1" />
              Certifique-se de configurar o App como "Mercado Livre" e habilitar os fluxos de Authorization Code e Refresh Token.
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="products" className="text-xs">
            <Package className="mr-2 h-3 w-3" />
            Catálogo & Sync
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">
            <ShoppingCart className="mr-2 h-3 w-3" />
            Vendas Recentes
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs">
            <Settings className="mr-2 h-3 w-3" />
            Configurações
          </TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 rounded-full bg-muted p-3">
                  <RefreshCw className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">Aguardando vinculação</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Após autorizar sua conta, listaremos aqui seus anúncios do Mercado Livre para vínculo.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ... outros TabsContent seriam similares ao TikTok ... */}
      </Tabs>
    </div>
  );
}

function RequirementItem({ label, status, desc }: { label: string; status: 'pending' | 'ok' | 'missing'; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${status === 'ok' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`} />
      <div className="space-y-0.5">
        <div className="text-xs font-medium">{label}</div>
        <p className="text-[10px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
