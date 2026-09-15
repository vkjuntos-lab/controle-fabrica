import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { 
  generateSocialPost, 
  savePostDraft, 
  listPostDrafts, 
  deletePostDraft 
} from "@/lib/pdv-social-manager.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Image as ImageIcon, 
  Layout, 
  Send, 
  Save, 
  Trash2, 
  RefreshCw, 
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons";
import { toast } from "sonner";

export const Route = createFileRoute("/pdv/social-manager")({
  component: SocialManagerPage,
  head: () => ({
    meta: [
      { title: "Gestão de Redes Sociais com IA | KS MultiMake" },
      { name: "description", content: "Crie, agende e publique posts no Instagram e Facebook usando inteligência artificial." },
    ],
  }),
});

function SocialManagerPage() {
  const { currentStoreId: storeId } = useCurrentStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("create");

  // State for post generation
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<"SINGLE" | "CAROUSEL" | "VIDEO" | "WHATSAPP">("SINGLE");
  const [visualStyle, setVisualStyle] = useState("Moderno e Elegante");
  const [generatedPost, setGeneratedPost] = useState<{
    caption: string;
    hashtags: string[];
    images: string[];
  } | null>(null);

  // Queries
  const draftsQ = useQuery({
    queryKey: ["post-drafts", storeId],
    queryFn: () => listPostDrafts({ data: { storeId: storeId! } }),
    enabled: !!storeId,
  });

  // Mutations
  const generateMut = useMutation({
    mutationFn: (data: any) => generateSocialPost({ data }),
    onSuccess: (data) => {
      setGeneratedPost(data);
      toast.success("Post gerado com sucesso!");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao gerar post."),
  });

  const saveMut = useMutation({
    mutationFn: (data: any) => savePostDraft({ data }),
    onSuccess: () => {
      toast.success("Rascunho salvo!");
      qc.invalidateQueries({ queryKey: ["post-drafts", storeId] });
      setActiveTab("drafts");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao salvar rascunho."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePostDraft({ data: { id } }),
    onSuccess: () => {
      toast.success("Rascunho excluído.");
      qc.invalidateQueries({ queryKey: ["post-drafts", storeId] });
    },
  });

  const handleGenerate = () => {
    if (!description.trim()) {
      toast.error("Descreva o que você quer postar.");
      return;
    }
    generateMut.mutate({
      description,
      mediaType,
      visualStyle,
      storeId: storeId!,
    });
  };

  const handleSaveDraft = (platform: "INSTAGRAM" | "FACEBOOK" | "WHATSAPP" | "BOTH") => {
    if (!generatedPost) return;
    saveMut.mutate({
      caption: generatedPost.caption + "\n\n" + generatedPost.hashtags.join(" "),
      platform,
      mediaType,
      mediaUrls: generatedPost.images,
      aiPrompt: description,
      visualStyle,
      storeId: storeId!,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-pink-600">Postador Omnichannel</h1>
          <p className="text-muted-foreground">Gere posts com IA e publique direto no WhatsApp, Facebook e Instagram.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="px-3 py-1 bg-pink-50 text-pink-700 border-pink-200">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Bella IA Ativa
          </Badge>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8 bg-pink-50/50 p-1">
          <TabsTrigger value="create" className="data-[state=active]:bg-white data-[state=active]:text-pink-600">
            <Sparkles className="h-4 w-4 mr-2" /> Criar com IA
          </TabsTrigger>
          <TabsTrigger value="drafts" className="data-[state=active]:bg-white data-[state=active]:text-pink-600">
            <Layout className="h-4 w-4 mr-2" /> Rascunhos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Column */}
            <div className="space-y-6">
              <Card className="border-pink-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-pink-700">O que vamos postar hoje?</CardTitle>
                  <CardDescription>Descreva o produto ou promoção e deixe a IA cuidar do resto.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição do Post</Label>
                    <Textarea
                      id="description"
                      placeholder='Ex: "Batom líquido matte coleção inverno com 20% de desconto"'
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="resize-none focus-visible:ring-pink-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Post</Label>
                      <Select value={mediaType} onValueChange={(v: any) => setMediaType(v)}>
                        <SelectTrigger className="focus:ring-pink-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SINGLE">Imagem Única</SelectItem>
                          <SelectItem value="CAROUSEL">Carrossel (3 fotos)</SelectItem>
                          <SelectItem value="VIDEO">Reels/Vídeo</SelectItem>
                          <SelectItem value="WHATSAPP">Status do WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estilo Visual</Label>
                      <Select value={visualStyle} onValueChange={setVisualStyle}>
                        <SelectTrigger className="focus:ring-pink-500">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Moderno e Elegante">Moderno</SelectItem>
                          <SelectItem value="Minimalista">Minimalista</SelectItem>
                          <SelectItem value="Colorido e Vibrante">Vibrante</SelectItem>
                          <SelectItem value="Promocional">Promocional</SelectItem>
                          <SelectItem value="Fotográfico">Realista</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-pink-600 hover:bg-pink-700 text-white" 
                    onClick={handleGenerate}
                    disabled={generateMut.isPending}
                  >
                    {generateMut.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Gerando Conteúdo...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Gerar Post com IA</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {generatedPost && (
                <Card className="border-pink-100 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Legenda Gerada</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea 
                      value={generatedPost.caption} 
                      onChange={(e) => setGeneratedPost({...generatedPost, caption: e.target.value})}
                      rows={6}
                      className="text-sm"
                    />
                    <div className="flex flex-wrap gap-1">
                      {generatedPost.hashtags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="bg-pink-50 text-pink-600 border-pink-100 cursor-pointer hover:bg-pink-100">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Preview Column */}
            <div className="space-y-6">
              <div className="sticky top-6">
                <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">Preview do Post</h3>
                
                <div className="bg-white border rounded-xl overflow-hidden shadow-lg max-w-[400px] mx-auto">
                  {/* Header Preview */}
                  <div className="p-3 flex items-center gap-2 border-b">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500" />
                    <span className="text-xs font-bold">ksmultimake_loja</span>
                  </div>

                  {/* Media Preview */}
                  <div className="aspect-square bg-muted flex items-center justify-center relative">
                    {generatedPost && generatedPost.images.length > 0 ? (
                      <img 
                        src={generatedPost.images[0]} 
                        alt="Preview" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-8 text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Aguardando geração de imagem...</p>
                      </div>
                    )}
                    {mediaType === "CAROUSEL" && (
                      <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full">
                        1/3
                      </div>
                    )}
                  </div>

                  {/* Actions Preview */}
                  <div className="p-3 space-y-2">
                    <div className="flex gap-3">
                      <div className="h-5 w-5 rounded-full border-2 border-slate-800" />
                      <div className="h-5 w-5 rounded-full border-2 border-slate-800" />
                      <div className="h-5 w-5 rounded-full border-2 border-slate-800" />
                    </div>
                    <div className="text-[11px]">
                      <span className="font-bold mr-1">ksmultimake_loja</span>
                      {generatedPost ? (
                        <span className="line-clamp-2">{generatedPost.caption}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Sua legenda aparecerá aqui...</span>
                      )}
                    </div>
                  </div>
                </div>

                {generatedPost && (
                  <div className="mt-8 flex flex-col gap-3">
                    <p className="text-sm text-center text-muted-foreground mb-1">Gostou? Salve ou publique agora:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="border-pink-200 text-pink-700 hover:bg-pink-50 text-xs py-1 h-9" onClick={() => handleSaveDraft("INSTAGRAM")}>
                          <Instagram className="h-3.5 w-3.5 mr-1" /> Instagram
                        </Button>
                        <Button variant="outline" className="border-pink-200 text-pink-700 hover:bg-pink-50 text-xs py-1 h-9" onClick={() => handleSaveDraft("FACEBOOK")}>
                          <Facebook className="h-3.5 w-3.5 mr-1" /> Facebook
                        </Button>
                      </div>
                      <Button className="bg-gradient-to-tr from-pink-600 to-purple-600 text-white border-0 h-9" onClick={() => handleSaveDraft("WHATSAPP")}>
                        <Send className="h-4 w-4 mr-2" /> Postar no Whats
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafts">
          <Card className="border-pink-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Meus Rascunhos</CardTitle>
                <CardDescription>Conteúdos salvos aguardando publicação.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => draftsQ.refetch()} disabled={draftsQ.isFetching}>
                <RefreshCw className={`h-4 w-4 ${draftsQ.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {draftsQ.isLoading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando rascunhos...</div>
              ) : !draftsQ.data || draftsQ.data.length === 0 ? (
                <div className="py-20 text-center space-y-4 border-2 border-dashed rounded-xl">
                  <div className="bg-pink-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto">
                    <Layout className="h-8 w-8 text-pink-300" />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Nenhum rascunho encontrado.</p>
                    <p className="text-sm text-muted-foreground/60">Crie seu primeiro post usando a IA.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("create")}>
                    Começar a criar
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {draftsQ.data.map((draft: any) => (
                    <Card key={draft.id} className="overflow-hidden border-pink-50 hover:border-pink-100 transition-all shadow-sm">
                      <div className="aspect-square relative bg-muted">
                        {draft.media_urls?.[0] ? (
                          <img src={draft.media_urls[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-8 w-8 opacity-20" /></div>
                        )}
                        <div className="absolute top-2 left-2 flex gap-1">
                          {draft.platform === "BOTH" || draft.platform === "INSTAGRAM" ? (
                            <div className="bg-white/90 p-1.5 rounded-lg shadow-sm"><Instagram className="h-3.5 w-3.5 text-pink-600" /></div>
                          ) : null}
                          {draft.platform === "BOTH" || draft.platform === "FACEBOOK" ? (
                            <div className="bg-white/90 p-1.5 rounded-lg shadow-sm"><Facebook className="h-3.5 w-3.5 text-blue-600" /></div>
                          ) : null}
                          {draft.platform === "WHATSAPP" ? (
                            <div className="bg-white/90 p-1.5 rounded-lg shadow-sm">
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-500 fill-current">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                            </div>
                          ) : null}
                        </div>
                        <Badge className="absolute top-2 right-2 bg-pink-100 text-pink-700 hover:bg-pink-100 border-0">
                          {draft.media_type === "CAROUSEL" ? "Carrossel" : draft.media_type === "VIDEO" ? "Reels" : "Post"}
                        </Badge>
                      </div>
                      <CardContent className="p-4 space-y-3">
                        <p className="text-sm line-clamp-3 leading-relaxed text-muted-foreground italic">"{draft.caption}"</p>
                        <div className="flex items-center justify-between pt-2 border-t border-pink-50">
                          <span className="text-[10px] text-muted-foreground flex items-center">
                            <Clock className="h-3 w-3 mr-1" /> {new Date(draft.created_at).toLocaleDateString("pt-BR")}
                          </span>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(draft.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" className="h-8 px-3 bg-pink-600 hover:bg-pink-700">
                              Publicar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
