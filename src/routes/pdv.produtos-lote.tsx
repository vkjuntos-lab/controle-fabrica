import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useServerFn } from "@tanstack/react-start";
import { analyzeProductFromMedia } from "@/lib/pdv-ai-product.functions";
import { toast } from "sonner";
import { UploadCloud, Trash2, CheckCircle2, AlertTriangle, Loader2, Save, X, Sparkles, RefreshCw, Layers, History, FileDown, ListFilter, PlayCircle, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { upsertProduct, stockEntry, uploadProductImage } from "@/lib/pdv-catalog";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBatchLogs, scheduleBatchReprocess, cancelBatch } from "@/lib/pdv-batch.functions";



type ProductData = {
  id: string;
  file?: File;
  preview: string;
  status: "idle" | "processing" | "completed" | "error";
  data?: any;
  error?: string;
  isDuplicate?: boolean;
  existingProduct?: any;
};

export const Route = createFileRoute("/pdv/produtos-lote")({
  component: BatchProductsPage,
});

const STORAGE_KEY = "pdv_batch_products_work_v1";

function BatchProductsPage() {
  const { currentStoreId } = useCurrentStore();
  const [items, setItems] = useState<ProductData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editItem, setEditItem] = useState<ProductData | null>(null);
  const [priceText, setPriceText] = useState("");
  const [duplicateResolution, setDuplicateResolution] = useState<{ open: boolean; item: ProductData | null }>({ open: false, item: null });
  const analyze = useServerFn(analyzeProductFromMedia);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Files cannot be serialized, so we mark them as missing but keep the preview/data
        setItems(parsed.map((item: any) => ({ ...item, file: undefined })));
      } catch (e) {
        console.error("Failed to load saved batch", e);
      }
    }
  }, []);

  useEffect(() => {
    // Only save what's serializable
    const toSave = items.map(({ file, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [items]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newItems: ProductData[] = files.slice(0, 20).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "idle",
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const processItem = async (item: ProductData) => {
    if (!item.file && item.status !== "completed") {
      toast.error("Arquivo da imagem não encontrado. Adicione a foto novamente.");
      return;
    }

    setItems((prev) => prev.map(i => i.id === item.id ? { ...i, status: "processing", error: undefined } : i));
    
    try {
      let base64 = "";
      let mime = "image/jpeg";

      if (item.file) {
        mime = item.file.type;
        const reader = new FileReader();
        reader.readAsDataURL(item.file);
        base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
        });
      } else {
        throw new Error("Foto original não disponível. Remova e adicione novamente.");
      }

      const res = await analyze({ 
        data: {
          imageBase64: base64, 
          imageMime: mime 
        }
      });

      if (res.ok) {
        setItems((prev) => prev.map(i => i.id === item.id ? { ...i, status: "completed", data: res.data } : i));
        
        // Log successful identification
        if (currentStoreId) {
          await supabase.from("batch_item_logs").insert({
            batch_id: item.id, // Using item ID as a temporary batch reference if not persistent yet
            item_id: null,
            event_type: 'identification',
            message: `Produto identificado: ${res.data.nome}`,
            details: res.data
          });
        }
      } else {
        throw new Error(res.error || "Erro na IA");
      }
    } catch (err: any) {
      setItems((prev) => prev.map(i => i.id === item.id ? { ...i, status: "error", error: err.message } : i));
      toast.error(`Falha ao identificar: ${err.message}`);
      
      // Log error
      if (currentStoreId) {
        await supabase.from("batch_item_logs").insert({
          batch_id: item.id,
          item_id: null,
          event_type: 'error',
          message: `Falha na identificação: ${err.message}`,
          details: { error: err.message }
        });
      }
    }
  };


  const processAll = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    // Process images one by one as requested
    for (const item of items) {
      if (item.status === "idle" || item.status === "error") {
        await processItem(item);
      }
    }
    setIsProcessing(false);
    const errors = items.filter(i => i.status === "error").length;
    if (errors > 0) {
      toast.error(`Processamento finalizado com ${errors} erros. Verifique o histórico.`);
    } else {
      toast.success("Processamento concluído com sucesso!");
    }
  };

  const saveAll = async (forceUpdateAll = false) => {
    if (!currentStoreId) {
      toast.error("Loja não selecionada");
      return;
    }
    
    const validItems = items.filter(i => i.status === "completed" && i.data);
    if (validItems.length === 0) {
      toast.error("Nenhum item válido para salvar");
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    
    for (const item of [...validItems]) {
      try {
        const sku = item.data.codigo_barras || item.data.ean || `LOTE-${item.id.slice(0, 8)}`;
        
        // Upload image if available and not already uploaded
        let imageUrl = item.data.image_url || null;
        if (!imageUrl && item.file) {
          try {
            imageUrl = await uploadProductImage(currentStoreId, item.file);
          } catch (uploadErr) {
            console.error("Failed to upload image for item:", item.id, uploadErr);
          }
        }

        // Duplicate check
        if (!forceUpdateAll && !item.isDuplicate) {
          const { data: existing } = await supabase
            .from("products")
            .select("id, name, sku, unit_price")
            .eq("store_id", currentStoreId)
            .or(`sku.eq.${sku},ean.eq.${sku}`)
            .maybeSingle();

          if (existing) {
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, isDuplicate: true, existingProduct: existing } : i));
            setDuplicateResolution({ open: true, item: { ...item, isDuplicate: true, existingProduct: existing } });
            setIsSaving(false);
            return; // Stop and ask user
          }
        }

        const productId = await upsertProduct({
          id: item.existingProduct?.id, // Use ID if updating
          store_id: currentStoreId,
          sku: sku,
          ean: item.data.codigo_barras || item.data.ean || null,
          name: item.data.nome || "Produto sem nome",
          unit_price: item.data.preco_venda || 0,
          brand: item.data.marca || null,
          description: item.data.descricao || null,
          cost_price: item.data.preco_custo || 0,
          volume: item.data.volume || null,
          color: item.data.cor || null,
          supplier: item.data.fornecedor || null,
          tags: item.data.tags || [],
          image_url: imageUrl,
          ai_generated: true,
        });

        // Handle quantity via stockEntry if positive
        if (item.data.quantidade > 0) {
          await stockEntry({
            product_id: productId,
            store_id: currentStoreId,
            lot_code: `LOTE-${new Date().getTime()}`,
            validity_mmYYYY: "12/2099", // Default validity for batch items
            qty: item.data.quantidade,
            note: "Entrada via cadastro em lote",
            operator: "Sistema IA"
          });
        }

        successCount++;
        setItems(prev => prev.filter(i => i.id !== item.id));
      } catch (err) {
        console.error("Erro ao salvar item:", item.id, err);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "error", error: "Erro ao salvar no banco" } : i));
      }
    }
    
    setIsSaving(false);
    if (successCount > 0) {
      toast.success(`${successCount} produtos processados com sucesso!`);
    }
  };

  const handleDuplicateResolution = async (mode: "skip" | "update" | "new") => {
    const item = duplicateResolution.item;
    if (!item || !currentStoreId) return;

    if (mode === "skip") {
      setItems(prev => prev.filter(i => i.id !== item.id));
      setDuplicateResolution({ open: false, item: null });
    } else if (mode === "update") {
      // Proceed with update using the existing ID
      try {
        setIsSaving(true);
        await upsertProduct({
          id: item.existingProduct.id,
          store_id: currentStoreId,
          sku: item.data.codigo_barras || item.data.ean || item.existingProduct.sku,
          name: item.data.nome,
          unit_price: item.data.preco_venda,
          brand: item.data.marca,
          description: item.data.descricao,
          ai_generated: true,
        });
        setItems(prev => prev.filter(i => i.id !== item.id));
        toast.success("Produto atualizado com sucesso!");
        setDuplicateResolution({ open: false, item: null });
        setIsSaving(false);
        // Continue saving the rest
        saveAll();
      } catch (e) {
        toast.error("Erro ao atualizar produto");
        setIsSaving(false);
      }
    } else {
      // mode === "new" -> force a new entry by clearing duplicate flag and existing ID
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, isDuplicate: false, existingProduct: null, data: { ...i.data, codigo_barras: `${i.data.codigo_barras}-NOVO` } } : i));
      setDuplicateResolution({ open: false, item: null });
      setTimeout(() => saveAll(), 100);
    }
  };


  const updateItemData = (id: string, field: string, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, data: { ...i.data, [field]: value } } : i));
  };


  const completedCount = items.filter(i => i.status === "completed").length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  const [showHistory, setShowHistory] = useState(false);
  const [selectedBatchLogs, setSelectedBatchLogs] = useState<{ open: boolean; batchId: string | null; logs: any[] }>({ open: false, batchId: null, logs: [] });
  const [batches, setBatches] = useState<any[]>([]);
  
  const fetchLogs = useServerFn(getBatchLogs);
  const reprocess = useServerFn(scheduleBatchReprocess);
  const cancel = useServerFn(cancelBatch);

  const handleShowLogs = async (batchId: string) => {
    try {
      const res = await fetchLogs({ data: { batch_id: batchId } });
      setSelectedBatchLogs({ open: true, batchId, logs: res.logs });
    } catch (e) {
      toast.error("Erro ao carregar logs");
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    try {
      await cancel({ data: { batch_id: batchId, reason: "Cancelado pelo usuário" } });
      toast.success("Lote cancelado!");
      refreshHistory();
    } catch (e) {
      toast.error("Erro ao cancelar lote");
    }
  };

  const refreshHistory = async () => {
    if (currentStoreId) {
      const { data } = await supabase.from("product_batches" as any)
        .select("*, batch_items(*)")
        .eq("store_id", currentStoreId)
        .order("created_at", { ascending: false });
      setBatches(data || []);
    }
  };

  const handleReprocessBatch = async (batchId: string) => {
    try {
      await reprocess({ data: { batch_id: batchId } });
      toast.success("Reprocessamento agendado!");
      refreshHistory();
    } catch (e) {
      toast.error("Erro ao agendar reprocessamento");
    }
  };

  useEffect(() => {
    if (!currentStoreId) return;

    // Realtime subscription for batch status updates
    const channel = supabase
      .channel('batch-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'product_batches',
          filter: `store_id=eq.${currentStoreId}`
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'completed') {
            toast.success("O processamento do lote foi concluído com sucesso!");
          } else if (newStatus === 'error') {
            toast.error("O processamento do lote finalizou com erros. Verifique os logs.");
          }
          
          // Refresh history if open
          if (showHistory) {
            setBatches(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStoreId, showHistory]);

  useEffect(() => {
    if (showHistory && currentStoreId) {
      (async () => {
        const { data } = await supabase.from("product_batches" as any)
          .select("*, batch_items(*)")
          .eq("store_id", currentStoreId)
          .order("created_at", { ascending: false });
        setBatches(data || []);
      })();
    }
  }, [showHistory, currentStoreId]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-[#FBF8F5] min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#D63351]">Cadastro em Lote</h1>
          <p className="text-muted-foreground">Identifique e cadastre múltiplos produtos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowHistory(true)}>
             <History className="mr-2 h-4 w-4" /> Histórico
          </Button>
          <Button variant="outline" onClick={() => document.getElementById("file-upload")?.click()}>
            <UploadCloud className="mr-2 h-4 w-4" /> Adicionar Fotos
          </Button>
          <Button onClick={processAll} disabled={isProcessing || items.length === 0} className="bg-[#D63351] hover:bg-[#b02a42]">
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Identificar com IA
          </Button>
          <input id="file-upload" type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      </div>



      <Progress value={progress} className="h-2" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Card key={item.id} className={cn("overflow-hidden border-2", item.status === "completed" ? "border-emerald-500" : item.status === "error" ? "border-rose-500" : "border-gray-200")}>
            <div className="h-48 overflow-hidden bg-gray-100">
              <img src={item.preview} alt="preview" className="w-full h-full object-cover" />
            </div>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-medium truncate">{item.file?.name || "Imagem salva"}</div>
              {item.status === "completed" && (
                <div className="text-xs text-muted-foreground">Identificado: {item.data?.nome || "Produto sem nome"}</div>
              )}
              {item.status === "error" && (
                <div className="text-xs text-rose-500 flex flex-col gap-1">
                  <div className="flex items-center"><AlertTriangle className="mr-1 h-3 w-3" /> {item.error}</div>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] mt-1 px-2" onClick={() => processItem(item)}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Reidentificar
                  </Button>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="ghost" className="text-[#D63351] hover:bg-rose-50" onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                {item.status === "completed" && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-[#D63351] border-rose-200" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const itemToEdit = items.find(i => i.id === item.id);
                      if (itemToEdit) {
                        const d: any = { ...(itemToEdit.data || {}) };
                        const p = d.preco_venda;
                        setPriceText(p === null || p === undefined || isNaN(Number(p)) ? "" : String(p).replace(".", ","));
                        setEditItem({ ...itemToEdit, data: d });
                      }
                    }}
                  >
                    Revisar
                  </Button>
                )}
              </div>

            </CardContent>
          </Card>
        ))}
      </div>
      
      {items.length > 0 && (
        <div className="fixed bottom-6 right-6 flex gap-3">
          <Button size="lg" variant="outline" className="shadow-xl bg-white" onClick={() => setItems([])}>
            Limpar Lista
          </Button>
          <Button size="lg" className="shadow-xl bg-[#D63351] hover:bg-[#b02a42]" onClick={() => saveAll()} disabled={isSaving || isProcessing}>
            {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
            Salvar {items.filter(i => i.status === "completed").length} Itens
          </Button>
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 bg-white rounded-xl shadow-lg border-none">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-[#D63351]">
              <Sparkles className="h-5 w-5" /> Revisar Produto
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 p-6 overflow-y-auto">
            {editItem && (
              <div className="space-y-6">
                {/* Imagem do Produto com Destaque */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Foto do Produto</Label>
                  <div className="relative group aspect-video w-full overflow-hidden rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-[#D63351]/50 transition-colors">
                    {editItem.status === "processing" ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                        <Loader2 className="h-8 w-8 text-[#D63351] animate-spin" />
                      </div>
                    ) : (
                      <img src={editItem.preview} alt="preview" className="w-full h-full object-contain" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={() => document.getElementById(`change-photo-${editItem.id}`)?.click()}
                        className="bg-white text-gray-900 hover:bg-gray-100"
                        disabled={editItem.status === "processing"}
                      >
                        <UploadCloud className="mr-2 h-4 w-4" /> Trocar Foto
                      </Button>
                      <input 
                        id={`change-photo-${editItem.id}`}
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const newPreview = URL.createObjectURL(file);
                            // Update local preview immediately
                            setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, file, preview: newPreview } : i));
                            setEditItem(prev => prev ? { ...prev, file, preview: newPreview } : null);
                            
                            // Re-trigger analysis for the new photo
                            const updatedItem = { ...editItem, file, preview: newPreview };
                            await processItem(updatedItem);
                            toast.success("Nova foto carregada e analisada!");
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Campos Editáveis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Nome do Produto</Label>
                      {editItem.data?.nome ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Preenchido por IA</span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Preencha este campo</span>
                      )}
                    </div>
                    <Input 
                      value={editItem.data?.nome || ""} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditItem(prev => prev ? { ...prev, data: { ...prev.data, nome: val } } : null);
                      }}
                      placeholder="Ex: Batom Matte Longa Duração"
                      className={cn(
                        "rounded-lg border-gray-200 focus:border-[#D63351] focus:ring-[#D63351]",
                        editItem.data?.nome ? "border-emerald-200 bg-emerald-50/10" : "border-amber-300 bg-amber-50/20"
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Marca</Label>
                      {editItem.data?.marca && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Preenchido por IA</span>}
                    </div>
                    <Input 
                      value={editItem.data?.marca || ""} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditItem(prev => prev ? { ...prev, data: { ...prev.data, marca: val } } : null);
                      }}
                      placeholder="Marca do produto"
                      className={cn(
                        "rounded-lg border-gray-200 focus:border-[#D63351] focus:ring-[#D63351]",
                        editItem.data?.marca && "border-emerald-200 bg-emerald-50/10"
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Categoria</Label>
                      {editItem.data?.categoria && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Preenchido por IA</span>}
                    </div>
                    <Input 
                      value={editItem.data?.categoria || ""} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditItem(prev => prev ? { ...prev, data: { ...prev.data, categoria: val } } : null);
                      }}
                      placeholder="Ex: Labial"
                      className={cn(
                        "rounded-lg border-gray-200 focus:border-[#D63351] focus:ring-[#D63351]",
                        editItem.data?.categoria && "border-emerald-200 bg-emerald-50/10"
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Cor</Label>
                    <Input 
                      value={editItem.data?.cor || ""} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditItem(prev => prev ? { ...prev, data: { ...prev.data, cor: val } } : null);
                      }}
                      placeholder="Ex: Vermelho Intenso"
                      className="rounded-lg border-gray-200 focus:border-[#D63351] focus:ring-[#D63351]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Preço de Venda (R$)</Label>
                      {!editItem.data?.preco_venda && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Preencha este campo</span>}
                    </div>
                    <Input 
                      type="text"
                      inputMode="decimal"
                      value={priceText} 
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d.,]/g, "");
                        setPriceText(raw);
                        const num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
                        setEditItem(prev => prev ? { ...prev, data: { ...prev.data, preco_venda: isNaN(num) ? 0 : num } } : null);
                      }}
                      placeholder="0,00"
                      className={cn(
                        "rounded-lg border-gray-200 focus:border-[#D63351] focus:ring-[#D63351]",
                        !editItem.data?.preco_venda && "border-amber-300 bg-amber-50/20"
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Quantidade em Estoque</Label>
                    <Input 
                      type="number"
                      step="1"
                      value={editItem.data?.quantidade || 0} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setEditItem(prev => prev ? { ...prev, data: { ...prev.data, quantidade: val } } : null);
                      }}
                      placeholder="0"
                      className="rounded-lg border-gray-200 focus:border-[#D63351] focus:ring-[#D63351]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Descrição</Label>
                    {editItem.data?.descricao && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Preenchido por IA</span>}
                  </div>
                  <textarea 
                    className={cn(
                      "flex min-h-[120px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63351] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                      editItem.data?.descricao && "border-emerald-200 bg-emerald-50/10"
                    )}
                    value={editItem.data?.descricao || ""} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditItem(prev => prev ? { ...prev, data: { ...prev.data, descricao: val } } : null);
                    }}
                    placeholder="Descrição detalhada do produto..."
                  />
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="p-6 border-t bg-gray-50 flex items-center justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setEditItem(null)}
              className="rounded-lg border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </Button>
            <Button 
              className="bg-[#D63351] hover:bg-[#b02a42] text-white rounded-lg px-8 shadow-sm transition-all active:scale-[0.98]" 
              onClick={async () => {
                if (!editItem) return;
                
                // Enhanced validation
                const missingFields = [];
                if (!editItem.data?.nome) missingFields.push("Nome");
                if (!editItem.data?.preco_venda || editItem.data.preco_venda <= 0) missingFields.push("Preço Venda");
                
                if (missingFields.length > 0) {
                  toast.error(`Campos obrigatórios ausentes: ${missingFields.join(", ")}`, {
                    description: "Por favor, preencha os campos destacados em laranja."
                  });
                  return;
                }

                if (editItem.status === "processing") {
                  toast.error("Aguarde a análise da nova imagem ser concluída.");
                  return;
                }

                // Apenas salva no estado local (fila de revisão)
                setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, data: editItem.data } : i));
                setEditItem(null);
                toast.success("Alterações salvas na fila!");
              }}
              disabled={isSaving || editItem?.status === "processing"}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Histórico de Lotes</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Métricas</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{new Date(b.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        b.status === 'processing' ? "bg-amber-100 text-amber-700" :
                        b.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                        b.status === 'cancelled' ? "bg-rose-100 text-rose-700" :
                        "bg-gray-100 text-gray-700"
                      )}>
                        {b.status}
                      </span>
                      {b.cancel_reason && <p className="text-[10px] text-muted-foreground mt-1 max-w-[120px] truncate">{b.cancel_reason}</p>}
                    </TableCell>
                    <TableCell>{b.batch_items.filter((i:any) => i.status === 'completed').length} / {b.batch_items.length}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleShowLogs(b.id)}>
                        <ListFilter className="h-4 w-4 mr-1"/> Logs
                      </Button>
                      {(b.status === 'error' || b.batch_items.some((i:any) => i.status === 'error')) && (
                        <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => handleReprocessBatch(b.id)}>
                          <PlayCircle className="h-4 w-4 mr-1"/> Reprocessar
                        </Button>
                      )}
                      {b.status === 'processing' && (
                        <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => handleCancelBatch(b.id)}>
                          <StopCircle className="h-4 w-4 mr-1"/> Cancelar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedBatchLogs.open} onOpenChange={(open) => setSelectedBatchLogs(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Logs de Auditoria do Lote</DialogTitle>
            <DialogDescription>Eventos e mudanças detalhadas por item.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-1">
              {selectedBatchLogs.logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum log encontrado para este lote.</p>
              ) : (
                selectedBatchLogs.logs.map((log) => (
                  <div key={log.id} className="border-l-2 border-rose-200 pl-4 py-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-1.5 rounded",
                        log.event_type === 'error' ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {log.event_type}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm mt-1">{log.message}</p>
                    {log.details?.product_id && (
                      <Link 
                        to="/pdv/catalogo" 
                        search={{ id: log.details.product_id }}
                        className="text-[10px] text-blue-600 hover:underline mt-1 block"
                      >
                        Ver item correspondente →
                      </Link>
                    )}
                    {log.details && (
                      <pre className="text-[10px] bg-muted p-2 mt-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>


      <Dialog open={duplicateResolution.open} onOpenChange={(open) => !open && setDuplicateResolution({ open: false, item: null })}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-amber-500" /> Produto Duplicado
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              O produto <span className="font-bold text-foreground">"{duplicateResolution.item?.data?.nome}"</span> já existe no catálogo (SKU: {duplicateResolution.item?.existingProduct?.sku}).
            </p>
            <div className="bg-amber-50 p-3 rounded-md text-xs border border-amber-100">
              <strong>Existente:</strong> R$ {duplicateResolution.item?.existingProduct?.unit_price} <br/>
              <strong>Novo:</strong> R$ {duplicateResolution.item?.data?.preco_venda}
            </div>
            <p className="text-sm">O que deseja fazer?</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => handleDuplicateResolution("skip")}>Pular este item</Button>
            <Button variant="outline" onClick={() => handleDuplicateResolution("new")}>Criar como novo</Button>
            <Button className="bg-[#D63351] hover:bg-[#b02a42]" onClick={() => handleDuplicateResolution("update")}>Atualizar Existente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}


