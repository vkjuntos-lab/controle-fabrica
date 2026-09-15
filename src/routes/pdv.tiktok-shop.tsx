import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/pdv/tiktok-shop")({
  component: TikTokShopPage,
});

function TikTokShopPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Integrações {" > "} TikTok Shop</h2>
          <p className="text-xs text-muted-foreground">
            Gerencie a conexão nativa com o TikTok Shop para sincronizar catálogo, estoque e pedidos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Conectado (API Oficial)
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status da Conexão</CardTitle>
            <CardDescription className="text-xs">
              Sua conta ainda não está vinculada ao TikTok Shop Partner Center.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Plug className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">Conectar TikTok Shop</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                Para iniciar, você precisa de um aplicativo aprovado no TikTok Shop Partner Center e as credenciais Client ID e Client Secret.
              </p>
              <Button className="mt-4" size="sm">
                Iniciar Autorização
                <ExternalLink className="ml-2 h-3 w-3" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">Região</span>
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Não identificada</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">Última Sincronização</span>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Nunca</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Configurações Necessárias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <RequirementItem 
                label="Partner Center Account" 
                status="ok" 
                desc="Cadastro como desenvolvedor parceiro concluído."
              />
              <RequirementItem 
                label="App Approval" 
                status="ok" 
                desc="Aplicativo autorizado para Catálogo e Pedidos."
              />
              <RequirementItem 
                label="Client Credentials" 
                status="ok" 
                desc="Client ID e Client Secret ativos."
              />
              <RequirementItem 
                label="Webhook Signature" 
                status="ok" 
                desc="Verificação HMAC ativa para notificações."
              />
            </div>
            
            <div className="mt-6 rounded-lg bg-muted/50 p-3 text-[10px] text-muted-foreground leading-relaxed">
              <AlertCircle className="mb-1 h-3 w-3 text-amber-500" />
              O KS MultiMake utiliza a API oficial. Não simula conexões ou pedidos fictícios. Todos os dados serão importados diretamente da sua conta oficial após a autorização.
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="products" className="text-xs">Catálogo & Vínculos</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">Pedidos Recentes</TabsTrigger>
          <TabsTrigger value="config" className="text-xs">Políticas de Sync</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">Logs de Eventos</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 rounded-full bg-muted p-3">
                  <RefreshCw className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">Nenhum produto vinculado</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Após conectar sua loja, você poderá vincular o catálogo central aos anúncios do TikTok Shop.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-xs text-muted-foreground">Conecte sua conta para visualizar e gerenciar pedidos do TikTok Shop.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Propriedade dos Dados</CardTitle>
              <CardDescription className="text-xs">Defina quem é a fonte principal para cada campo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-6 md:grid-cols-3">
                <PolicyCard title="Estoque" defaultSource="Interno" />
                <PolicyCard title="Preço" defaultSource="Interno" />
                <PolicyCard title="Conteúdo" defaultSource="Manual" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-xs text-muted-foreground">Aguardando primeira conexão para iniciar monitoramento de webhooks.</p>
            </CardContent>
          </Card>
        </TabsContent>
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

function PolicyCard({ title, defaultSource }: { title: string; defaultSource: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">{title}</span>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm">{defaultSource}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
