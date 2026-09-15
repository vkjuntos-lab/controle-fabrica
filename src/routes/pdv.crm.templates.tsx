import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { listWaTemplates, syncWaTemplates, deleteWaTemplate } from "@/lib/pdv-wa-templates.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pdv/crm/templates")({ component: TemplatesPage });

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  REJECTED: "bg-rose-100 text-rose-700 border-rose-200",
  PAUSED: "bg-slate-100 text-slate-700 border-slate-200",
  UNKNOWN: "bg-slate-100 text-slate-700 border-slate-200",
};

function TemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWaTemplates);
  const syncFn = useServerFn(syncWaTemplates);
  const delFn = useServerFn(deleteWaTemplate);

  const [storeId, setStoreId] = React.useState<string>("");
  const [preview, setPreview] = React.useState<any | null>(null);

  const { data: stores } = useQuery({
    queryKey: ["stores-min"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id,name").order("name");
      return data ?? [];
    },
  });

  React.useEffect(() => {
    if (!storeId && stores && stores.length) setStoreId(stores[0].id);
  }, [stores, storeId]);

  const { data: list, isFetching } = useQuery({
    queryKey: ["wa-templates", storeId],
    enabled: !!storeId,
    queryFn: () => listFn({ data: { store_id: storeId } }),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { store_id: storeId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["wa-templates", storeId] });
      alert(`Sincronizados ${r.synced} de ${r.total} templates.`);
    },
    onError: (e: any) => alert(e.message ?? "Falha ao sincronizar"),
  });

  const rm = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-templates", storeId] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Templates WhatsApp</h2>
          <p className="text-xs text-muted-foreground">
            Sincronize seus templates aprovados na Meta para uso em campanhas ativas fora da janela de 24h.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {(stores ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!storeId || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? "Sincronizando…" : "Sincronizar da Meta"}
          </button>
        </div>
      </header>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Nome</th>
              <th className="text-left px-4 py-2">Idioma</th>
              <th className="text-left px-4 py-2">Categoria</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Vars</th>
              <th className="text-left px-4 py-2">Última sync</th>
              <th className="text-right px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(list?.rows ?? []).map((t: any) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{t.name}</td>
                <td className="px-4 py-2">{t.language}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.category ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${STATUS_COLORS[t.status] ?? STATUS_COLORS.UNKNOWN}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-2">{t.variables_count}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {t.synced_at ? new Date(t.synced_at).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button className="text-xs underline" onClick={() => setPreview(t)}>Ver</button>
                  <button className="text-xs text-rose-600 underline" onClick={() => confirm("Excluir template local?") && rm.mutate(t.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {!isFetching && (list?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Nenhum template sincronizado. Configure Token e WABA ID na tela de WhatsApp e clique em <b>Sincronizar da Meta</b>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="bg-background rounded-lg shadow-xl max-w-lg w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{preview.name}</h3>
              <button onClick={() => setPreview(null)} className="text-muted-foreground">✕</button>
            </div>
            <div className="text-xs text-muted-foreground">
              {preview.language} • {preview.category ?? "—"} • {preview.status}
            </div>
            {preview.header_text && (
              <div className="text-sm font-medium border-b pb-2">{preview.header_text}</div>
            )}
            {preview.body_text && (
              <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded p-3">{preview.body_text}</pre>
            )}
            {preview.footer_text && (
              <div className="text-xs text-muted-foreground">{preview.footer_text}</div>
            )}
            {Array.isArray(preview.buttons) && preview.buttons.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {preview.buttons.map((b: any, i: number) => (
                  <span key={i} className="text-xs border rounded px-2 py-1">{b.text}</span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-2">
              Variáveis: <b>{preview.variables_count}</b>. Use este template em campanhas e informe {preview.variables_count} parâmetros na ordem <code>{"{{1}} {{2}}"}</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
