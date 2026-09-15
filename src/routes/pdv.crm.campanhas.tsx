import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { listCampaigns, upsertCampaign, deleteCampaign, runCampaign, listCampaignDeliveries } from "@/lib/pdv-campaigns.functions";
import { listSegments } from "@/lib/pdv-crm.functions";
import { useCurrentStore } from "@/lib/pdv-current-store";
import { listWaTemplates } from "@/lib/pdv-wa-templates.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pdv/crm/campanhas")({ component: CampanhasPage });

const CHANNELS = [
  { v: "wa", l: "WhatsApp" },
  { v: "email", l: "E-mail" },
  { v: "inapp", l: "In-app" },
];

const TRIGGERS = [
  { v: "manual", l: "Manual" },
  { v: "birthday", l: "Aniversário" },
  { v: "inactive60", l: "Inativo 60d" },
  { v: "tier_upgrade", l: "Upgrade de tier" },
];

function CampanhasPage() {
  const qc = useQueryClient();
  const { currentStoreId } = useCurrentStore();
  const listFn = useServerFn(listCampaigns);
  const upFn = useServerFn(upsertCampaign);
  const delFn = useServerFn(deleteCampaign);
  const runFn = useServerFn(runCampaign);
  const delivFn = useServerFn(listCampaignDeliveries);
  const segsFn = useServerFn(listSegments);
  const tplFn = useServerFn(listWaTemplates);

  const [editing, setEditing] = React.useState<any | null>(null);
  const [viewDeliv, setViewDeliv] = React.useState<string | null>(null);

  const { data: list } = useQuery({ 
    queryKey: ["camps", currentStoreId], 
    queryFn: () => listFn({ data: { store_id: currentStoreId! } }),
    enabled: !!currentStoreId
  });
  const { data: segs } = useQuery({ queryKey: ["camp-segs"], queryFn: () => segsFn() });
  const { data: stores } = useQuery({
    queryKey: ["stores-min-camp"],
    queryFn: async () => (await supabase.from("stores").select("id,name").order("name")).data ?? [],
  });
  const { data: templates } = useQuery({
    queryKey: ["camp-tpls", editing?.store_id],
    enabled: !!editing?.store_id,
    queryFn: () => tplFn({ data: { store_id: editing.store_id } }),
  });
  const { data: delivs } = useQuery({
    queryKey: ["camp-deliv", viewDeliv, currentStoreId], 
    enabled: !!viewDeliv && !!currentStoreId,
    queryFn: () => delivFn({ data: { campaign_id: viewDeliv!, store_id: currentStoreId! } }),
  });

  const save = useMutation({
    mutationFn: (d: any) => upFn({ data: { ...d, store_id: currentStoreId } }),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["camps"] }); },
  });
  const rm = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, store_id: currentStoreId! } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["camps"] }),
  });
  const run = useMutation({
    mutationFn: (id: string) => runFn({ data: { id, store_id: currentStoreId! } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["camps"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Campanhas</h2>
          <p className="text-xs text-muted-foreground">Disparos manuais ou automáticos por segmento.</p>
        </div>
        <button 
          onClick={() => setEditing({ 
            name: "", 
            segment_key: "all", 
            channel: "wa", 
            trigger: "manual", 
            template: "Olá {{nome}}!", 
            status: "draft",
            store_id: currentStoreId
          })}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          + Nova campanha
        </button>
      </header>

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}
          className="rounded-xl border border-border bg-card p-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Nome</span>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5" required />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Segmento</span>
            <select value={editing.segment_key} onChange={(e) => setEditing({ ...editing, segment_key: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5">
              {segs?.segments.map((s: any) => <option key={s.key} value={s.key}>{s.label} ({s.count})</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Canal</span>
            <select value={editing.channel} onChange={(e) => setEditing({ ...editing, channel: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5">
              {CHANNELS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Gatilho</span>
            <select value={editing.trigger} onChange={(e) => setEditing({ ...editing, trigger: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5">
              {TRIGGERS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Loja (para envio WA)</span>
            <select value={editing.store_id ?? ""} onChange={(e) => setEditing({ ...editing, store_id: e.target.value || null, template_id: null })}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5">
              <option value="">— sem envio real —</option>
              {(stores ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Template Meta aprovado (opcional)</span>
            <select
              value={editing.template_id ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const t = (templates?.rows ?? []).find((x: any) => x.id === id);
                setEditing({
                  ...editing,
                  template_id: id,
                  template_lang: t?.language ?? null,
                  template_params: t ? Array(t.variables_count).fill("{{nome}}") : [],
                });
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5"
              disabled={!editing.store_id}
            >
              <option value="">— free-form (janela 24h) —</option>
              {(templates?.rows ?? []).filter((t: any) => t.status === "APPROVED").map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} · {t.language} · {t.variables_count} vars</option>
              ))}
            </select>
          </label>
          {editing.template_id && Array.isArray(editing.template_params) && editing.template_params.length > 0 && (
            <div className="md:col-span-2 grid gap-2 md:grid-cols-2">
              {editing.template_params.map((p: string, i: number) => (
                <label key={i} className="text-xs space-y-1">
                  <span className="text-muted-foreground">Parâmetro {"{{" + (i + 1) + "}}"}</span>
                  <input
                    value={p}
                    onChange={(e) => {
                      const arr = [...editing.template_params];
                      arr[i] = e.target.value;
                      setEditing({ ...editing, template_params: arr });
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono"
                  />
                </label>
              ))}
            </div>
          )}
          <label className="text-xs space-y-1 md:col-span-2">
            <span className="text-muted-foreground">Mensagem free-form (variáveis: {"{{nome}} {{cpf}} {{telefone}}"})</span>
            <textarea value={editing.template ?? ""} onChange={(e) => setEditing({ ...editing, template: e.target.value })}
              rows={4} className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs" />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="text-xs px-4 py-2 text-muted-foreground">Cancelar</button>
            <button type="submit" disabled={save.isPending} className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
              {save.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Segmento</th>
              <th className="px-3 py-2 text-left">Canal</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Enviados</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(list as any)?.rows?.map((c: any) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 text-xs font-semibold">{c.name}</td>
                <td className="px-3 py-2 text-xs">{c.segment_key}</td>
                <td className="px-3 py-2 text-xs uppercase">{c.channel}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${c.status === "done" ? "bg-emerald-500/15 text-emerald-700" : "bg-muted"}`}>{c.status}</span>
                </td>
                <td className="px-3 py-2 text-right text-xs">{c.sent_count}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => run.mutate(c.id)} className="text-xs text-primary hover:underline">Disparar</button>
                  <button onClick={() => setViewDeliv(c.id)} className="text-xs text-muted-foreground hover:underline">Log</button>
                  <button onClick={() => setEditing(c)} className="text-xs text-muted-foreground hover:underline">Editar</button>
                  <button onClick={() => confirm("Excluir campanha?") && rm.mutate(c.id)} className="text-xs text-destructive hover:underline">×</button>
                </td>
              </tr>
            ))}
            {list && (list as any).rows?.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma campanha ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewDeliv && delivs && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-sm font-semibold">Envios ({delivs.rows.length})</div>
            <button onClick={() => setViewDeliv(null)} className="text-xs text-muted-foreground">Fechar</button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Erro</th>
                <th className="px-3 py-2 text-left">Data</th>
              </tr>
            </thead>
            <tbody>
              {delivs.rows.map((d: any) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2">{d.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="px-3 py-2 text-destructive">{d.error ?? ""}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.created_at.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
