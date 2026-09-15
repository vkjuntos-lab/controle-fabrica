// Onda 1 — Inbox Omnichannel: painel de conversas WhatsApp + Instagram em tempo real.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "@/lib/pdv-current-store";
import {
  Search,
  MessageCircle,
  StickyNote,
  Send,
  Sparkles,
  UserCheck,
  Clock,
  X,
  Plus,
  ArrowLeftRight,
  CheckCircle2,
  RefreshCw,
  Tag as TagIcon,
} from "lucide-react";
import { Instagram } from "@/components/icons";
import {
  listInboxConversations,
  getInboxThread,
  takeConversation,
  assignConversation,
  addInternalNote,
  setConversationTags,
  closeConversation,
  reopenConversation,
  markConversationRead,
  sendManualReply,
  listStoreOperators,
  listWaTags,
  upsertWaTag,
} from "@/lib/pdv-inbox.functions";

export const Route = createFileRoute("/pdv/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [
      { title: "Inbox Omnichannel · KS MultiMake" },
      { name: "description", content: "Central de atendimento WhatsApp e Instagram em tempo real." },
    ],
  }),
});

type Filter = "mine" | "queue" | "all" | "closed";

// Paleta earth-toned — inspirada no protótipo aprovado
const PALETTE = {
  page: "bg-[#FAF9F6]",
  card: "bg-white",
  panel: "bg-[#FDFBF7]",
  border: "border-[#F0EDE8]",
  borderStrong: "border-[#E8E2D9]",
  softBg: "bg-[#F5F1EB]",
  ink: "text-[#4A3728]",
  inkMid: "text-[#8D7B6D]",
  inkSoft: "text-[#A89F94]",
  accent: "bg-[#8D6E63]",
  accentFg: "text-white",
  ring: "focus:ring-2 focus:ring-[#D4C4B5]",
} as const;

function initials(name?: string | null, phone?: string | null) {
  const src = (name && name.trim()) || phone || "?";
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function relativeTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const today = now.toDateString() === d.toDateString();
  if (today) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (yest.toDateString() === d.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function InboxPage() {
  const qc = useQueryClient();
  const { currentStore } = useCurrentStore();
  const storeId: string | undefined = currentStore?.id;

  const listFn = useServerFn(listInboxConversations);
  const threadFn = useServerFn(getInboxThread);
  const takeFn = useServerFn(takeConversation);
  const assignFn = useServerFn(assignConversation);
  const noteFn = useServerFn(addInternalNote);
  const tagsFn = useServerFn(setConversationTags);
  const closeFn = useServerFn(closeConversation);
  const reopenFn = useServerFn(reopenConversation);
  const readFn = useServerFn(markConversationRead);
  const sendFn = useServerFn(sendManualReply);
  const opsFn = useServerFn(listStoreOperators);
  const tagsListFn = useServerFn(listWaTags);
  const upsertTagFn = useServerFn(upsertWaTag);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [channel, setChannel] = React.useState<"whatsapp" | "instagram" | "">("");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const { data: list } = useQuery({
    enabled: !!storeId,
    queryKey: ["inbox", storeId, filter, channel, search],
    queryFn: () => listFn({ data: { store_id: storeId!, filter, channel: (channel || null) as any, search: search || null } }),
    refetchInterval: 30_000,
  });

  const { data: thread } = useQuery({
    enabled: !!selectedId,
    queryKey: ["inbox-thread", selectedId],
    queryFn: () => threadFn({ data: { conversation_id: selectedId! } }),
  });

  const { data: ops } = useQuery({
    enabled: !!storeId,
    queryKey: ["inbox-ops", storeId],
    queryFn: () => opsFn({ data: { store_id: storeId! } }),
    staleTime: 60_000,
  });

  const { data: tags } = useQuery({
    enabled: !!storeId,
    queryKey: ["inbox-tags", storeId],
    queryFn: () => tagsListFn({ data: { store_id: storeId! } }),
    staleTime: 60_000,
  });

  // Realtime subscribe
  React.useEffect(() => {
    if (!storeId) return;
    const ch = supabase
      .channel(`inbox-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_conversations", filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["inbox", storeId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" },
        (payload) => {
          const convId = (payload.new as any)?.conversation_id;
          qc.invalidateQueries({ queryKey: ["inbox", storeId] });
          if (convId === selectedId) qc.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_internal_notes" },
        (payload) => {
          const convId = (payload.new as any)?.conversation_id;
          if (convId === selectedId) qc.invalidateQueries({ queryKey: ["inbox-thread", selectedId] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId, selectedId, qc]);

  React.useEffect(() => {
    if (selectedId) { readFn({ data: { id: selectedId } }).catch(() => {}); }
  }, [selectedId, readFn]);

  const take = useMutation({ mutationFn: (id: string) => takeFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }) });
  const assign = useMutation({ mutationFn: (v: { id: string; user_id: string | null }) => assignFn({ data: v }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["inbox"] }); qc.invalidateQueries({ queryKey: ["inbox-thread", selectedId] }); } });
  const note = useMutation({ mutationFn: (v: { conversation_id: string; body: string }) => noteFn({ data: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-thread", selectedId] }) });
  const setTags = useMutation({ mutationFn: (v: { id: string; tags: string[] }) => tagsFn({ data: v }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["inbox"] }); qc.invalidateQueries({ queryKey: ["inbox-thread", selectedId] }); } });
  const close = useMutation({ mutationFn: (id: string) => closeFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }) });
  const reopen = useMutation({ mutationFn: (id: string) => reopenFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }) });
  const send = useMutation({ mutationFn: (v: { conversation_id: string; text: string }) => sendFn({ data: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-thread", selectedId] }) });
  const newTag = useMutation({ mutationFn: (v: { store_id: string; label: string }) => upsertTagFn({ data: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-tags"] }) });

  if (!storeId) return <div className={`p-6 text-sm ${PALETTE.inkMid}`}>Selecione uma loja.</div>;

  const conv = thread?.conversation as any;
  const items = list?.conversations ?? [];
  const totals = {
    mine: items.filter((c: any) => c.assigned_to).length,
    queue: items.filter((c: any) => !c.assigned_to && c.status !== "closed").length,
  };

  return (
    <div className={`${PALETTE.page} h-[calc(100dvh-4rem)] p-3 sm:p-5`}>
      <div className={`h-full grid grid-cols-1 md:grid-cols-[300px_1fr] 2xl:grid-cols-[320px_1fr_300px] gap-3 sm:gap-4 rounded-3xl border ${PALETTE.borderStrong} ${PALETTE.card} shadow-[0_20px_50px_rgba(74,55,40,0.05)] overflow-hidden`}>

        {/* Coluna 1 — Lista */}
        <aside className={`flex flex-col border-r ${PALETTE.border} ${PALETTE.panel} min-w-0`}>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className={`text-xl font-semibold ${PALETTE.ink} truncate`}>Atendimento</h1>
                <p className={`text-[11px] ${PALETTE.inkSoft} mt-0.5`}>{totals.mine} atendendo · {totals.queue} na fila</p>
              </div>
              <div className={`h-9 w-9 rounded-full ${PALETTE.softBg} grid place-items-center shrink-0`}>
                <Sparkles className={`w-4 h-4 ${PALETTE.ink}`} />
              </div>
            </div>

            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${PALETTE.inkSoft}`} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar conversa..."
                className={`w-full bg-white border ${PALETTE.borderStrong} rounded-xl py-2.5 pl-10 pr-3 text-sm focus:outline-none ${PALETTE.ring} transition-all placeholder:text-[#A89F94] ${PALETTE.ink}`}
              />
            </div>

            <div className={`flex gap-1 p-1 ${PALETTE.softBg} rounded-lg`}>
              {(["mine", "queue", "all", "closed"] as Filter[]).map((f) => {
                const label = f === "mine" ? "Minhas" : f === "queue" ? "Fila" : f === "all" ? "Todas" : "Fechadas";
                const active = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${active ? `bg-white ${PALETTE.ink} shadow-sm` : `${PALETTE.inkMid} hover:${PALETTE.ink}`}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1 text-[11px]">
              {([
                { v: "", label: "Todos canais", icon: null },
                { v: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                { v: "instagram", label: "Instagram", icon: Instagram },
              ] as const).map((opt) => {
                const active = channel === opt.v;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.v}
                    onClick={() => setChannel(opt.v as any)}
                    className={`flex-1 py-1.5 rounded-md border transition-all inline-flex items-center justify-center gap-1 ${active ? `${PALETTE.borderStrong} bg-white ${PALETTE.ink} shadow-sm` : `border-transparent ${PALETTE.inkMid} hover:bg-white/60`}`}
                  >
                    {Icon && <Icon className="w-3 h-3" />}<span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <div className="space-y-1.5">
              {items.map((c: any) => {
                const isActive = selectedId === c.id;
                const isIg = c.channel === "instagram";
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-3 flex gap-3 rounded-2xl transition-all group ${
                      isActive
                        ? `bg-white border ${PALETTE.border} shadow-sm`
                        : "hover:bg-[#F5F1EB]/70"
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${isIg ? "from-[#f5b78b] to-[#c4654a]" : "from-[#D4C4B5] to-[#8D6E63]"} grid place-items-center text-white text-xs font-semibold`}>
                        {initials(c.wa_name, c.phone)}
                      </div>
                      {c.unread_count > 0 && (
                        <span className={`absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#8D6E63] text-white text-[9px] font-semibold grid place-items-center border-2 border-white`}>
                          {c.unread_count > 9 ? "9+" : c.unread_count}
                        </span>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${isIg ? "bg-[#E1306C]" : "bg-[#25D366]"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <p className={`text-sm font-semibold ${PALETTE.ink} truncate`}>{c.wa_name ?? c.phone}</p>
                        <span className={`text-[10px] ${PALETTE.inkSoft} shrink-0`}>{relativeTime(c.last_message_at ?? c.updated_at)}</span>
                      </div>
                      <p className={`text-xs ${PALETTE.inkMid} truncate mt-0.5`}>{c.last_snippet ?? c.phone}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {c.handoff_to_human && (
                          <span className="text-[9px] rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 font-medium">🙋 humano</span>
                        )}
                        {c.assigned_to && (
                          <span className="text-[9px] rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.5 font-medium">atendido</span>
                        )}
                        {!c.assigned_to && !c.handoff_to_human && c.status !== "closed" && (
                          <span className={`text-[9px] rounded-full ${PALETTE.softBg} ${PALETTE.inkMid} px-1.5 py-0.5 font-medium`}>🤖 Bella</span>
                        )}
                        {(c.tags ?? []).slice(0, 2).map((t: string) => (
                          <span key={t} className="text-[9px] rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 font-medium">{t}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
              {items.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className={`w-14 h-14 rounded-full ${PALETTE.softBg} grid place-items-center mx-auto mb-3`}>
                    <MessageCircle className={`w-6 h-6 ${PALETTE.inkSoft}`} />
                  </div>
                  <p className={`text-xs ${PALETTE.inkMid} leading-relaxed`}>Nenhuma conversa<br />neste filtro.</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Coluna 2 — Thread */}
        <section className="flex flex-col overflow-hidden bg-[#FDFCFB] min-w-0">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-8 relative">
                <div className={`absolute inset-0 ${PALETTE.softBg} blur-3xl opacity-40 rounded-full`}></div>
                <div className={`relative w-40 h-40 border ${PALETTE.borderStrong} rounded-full flex items-center justify-center bg-white shadow-inner`}>
                  <MessageCircle className="w-16 h-16 text-[#D4C4B5]" strokeWidth={1} />
                </div>
              </div>
              <h2 className={`text-2xl font-semibold ${PALETTE.ink} mb-2`} style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}>
                Selecione uma conversa
              </h2>
              <p className={`max-w-xs text-sm ${PALETTE.inkMid} leading-relaxed`}>
                Escolha um atendimento na lista lateral para iniciar a conversa com o cliente.
              </p>
            </div>
          ) : (
            <>
              <header className={`border-b ${PALETTE.border} px-5 py-3.5 flex items-center justify-between gap-3 bg-white/60 backdrop-blur-sm`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${conv?.channel === "instagram" ? "from-[#f5b78b] to-[#c4654a]" : "from-[#D4C4B5] to-[#8D6E63]"} grid place-items-center text-white text-xs font-semibold shrink-0`}>
                    {initials(conv?.wa_name, conv?.phone)}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${PALETTE.ink} truncate`}>{conv?.wa_name ?? conv?.phone}</div>
                    <div className={`text-[11px] ${PALETTE.inkMid} flex items-center gap-1.5`}>
                      {conv?.channel === "instagram"
                        ? <Instagram className="w-3 h-3" />
                        : <MessageCircle className="w-3 h-3" />}
                      <span className="truncate">{conv?.phone}</span>
                      {conv?.assigned_to && <span className="text-emerald-600">· atendido</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 text-xs shrink-0">
                  {!conv?.assigned_to
                    ? <button onClick={() => take.mutate(selectedId)} className={`inline-flex items-center gap-1.5 rounded-lg ${PALETTE.accent} px-3 py-1.5 ${PALETTE.accentFg} font-medium hover:opacity-90 transition`}><UserCheck className="w-3.5 h-3.5" />Assumir</button>
                    : <button onClick={() => assign.mutate({ id: selectedId, user_id: null })} className={`inline-flex items-center gap-1.5 rounded-lg ${PALETTE.softBg} px-3 py-1.5 ${PALETTE.ink} font-medium hover:bg-[#EDE6DC] transition`}><ArrowLeftRight className="w-3.5 h-3.5" />Devolver</button>}
                  {conv?.status === "closed"
                    ? <button onClick={() => reopen.mutate(selectedId)} className={`inline-flex items-center gap-1.5 rounded-lg border ${PALETTE.borderStrong} bg-white px-3 py-1.5 ${PALETTE.ink} font-medium hover:${PALETTE.softBg} transition`}><RefreshCw className="w-3.5 h-3.5" />Reabrir</button>
                    : <button onClick={() => close.mutate(selectedId)} className={`inline-flex items-center gap-1.5 rounded-lg border ${PALETTE.borderStrong} bg-white px-3 py-1.5 ${PALETTE.ink} font-medium hover:${PALETTE.softBg} transition`}><CheckCircle2 className="w-3.5 h-3.5" />Fechar</button>}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {mergeThread(thread?.messages, thread?.notes).map((item) => {
                  if (item.kind === "note") {
                    return (
                      <div key={`n-${item.id}`} className="mx-auto max-w-[85%] bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-1 flex items-center gap-1 font-semibold">
                          <StickyNote className="w-3 h-3" /> Nota interna
                        </div>
                        <div className="whitespace-pre-wrap text-amber-950">{item.body}</div>
                      </div>
                    );
                  }
                  const isOut = item.direction === "outbound";
                  const isBot = isOut && !item.meta?.author_id;
                  return (
                    <div key={`m-${item.id}`} className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
                          isOut
                            ? isBot
                              ? "bg-gradient-to-br from-violet-50 to-violet-100 text-violet-950 rounded-br-md border border-violet-200/60"
                              : "bg-[#8D6E63] text-white rounded-br-md"
                            : `bg-white ${PALETTE.ink} rounded-bl-md border ${PALETTE.border}`
                        }`}
                      >
                        {item.text}
                        <div className={`text-[9px] mt-1 flex items-center gap-1 ${isOut ? (isBot ? "text-violet-600" : "text-white/70") : PALETTE.inkSoft}`}>
                          {isBot ? "🤖 Bella" : isOut ? "Atendente" : "Cliente"} · {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Composer
                onSend={(text) => send.mutate({ conversation_id: selectedId, text })}
                onNote={(body) => note.mutate({ conversation_id: selectedId, body })}
                disabled={send.isPending}
              />
            </>
          )}
        </section>

        {/* Coluna 3 — Painel lateral */}
        <aside className={`hidden 2xl:flex flex-col border-l ${PALETTE.border} ${PALETTE.card} overflow-y-auto`}>
          {conv ? (
            <div className="p-5 space-y-6 text-xs">
              <section className="text-center space-y-3">
                <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-br ${conv.channel === "instagram" ? "from-[#f5b78b] to-[#c4654a]" : "from-[#D4C4B5] to-[#8D6E63]"} grid place-items-center text-white text-lg font-semibold ring-4 ${PALETTE.softBg.replace("bg-", "ring-")}`}>
                  {initials(conv.wa_name, conv.phone)}
                </div>
                <div>
                  <h3 className={`text-sm font-semibold ${PALETTE.ink}`}>{conv.customers?.name ?? conv.wa_name ?? "Cliente"}</h3>
                  <p className={`text-[11px] ${PALETTE.inkMid}`}>{conv.phone}</p>
                </div>
              </section>

              <section className={`space-y-2.5 pt-4 border-t ${PALETTE.border}`}>
                <Row label="CPF" value={conv.customers?.cpf ?? "—"} />
                <Row label="E-mail" value={conv.customers?.email ?? "—"} />
                <Row label="Cashback" value={`R$ ${Number(conv.customers?.cashback_balance ?? 0).toFixed(2)}`} />
                <Row label="Canal" value={conv.channel === "instagram" ? "Instagram" : "WhatsApp"} />
              </section>

              <section className="space-y-2">
                <label className={`text-[10px] font-bold uppercase tracking-wider ${PALETTE.inkSoft}`}>Atribuir a</label>
                <select
                  value={conv.assigned_to ?? ""}
                  onChange={(e) => assign.mutate({ id: selectedId!, user_id: e.target.value || null })}
                  className={`w-full rounded-xl border ${PALETTE.borderStrong} bg-white px-3 py-2 text-xs ${PALETTE.ink} focus:outline-none ${PALETTE.ring}`}
                >
                  <option value="">— Fila (sem atendente) —</option>
                  {(ops?.operators ?? []).map((o: any) => (
                    <option key={o.id} value={o.id}>{o.email ?? o.id.slice(0, 8)} · {o.role}</option>
                  ))}
                </select>
              </section>

              <section className="space-y-2">
                <label className={`text-[10px] font-bold uppercase tracking-wider ${PALETTE.inkSoft} flex items-center gap-1.5`}>
                  <TagIcon className="w-3 h-3" /> Etiquetas
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(conv.tags ?? []).map((t: string) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-medium">
                      {t}
                      <button
                        onClick={() => setTags.mutate({ id: selectedId!, tags: (conv.tags ?? []).filter((x: string) => x !== t) })}
                        className="hover:text-violet-900"
                        aria-label={`Remover ${t}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = Array.from(new Set([...(conv.tags ?? []), e.target.value]));
                    setTags.mutate({ id: selectedId!, tags: next });
                    e.target.value = "";
                  }}
                  className={`w-full rounded-xl border ${PALETTE.borderStrong} bg-white px-3 py-2 text-[11px] ${PALETTE.ink} focus:outline-none ${PALETTE.ring}`}
                >
                  <option value="">+ Adicionar tag…</option>
                  {(tags?.tags ?? []).filter((t: any) => !(conv.tags ?? []).includes(t.label)).map((t: any) => (
                    <option key={t.id} value={t.label}>{t.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const label = prompt("Nova etiqueta:");
                    if (label && storeId) newTag.mutate({ store_id: storeId, label });
                  }}
                  className={`inline-flex items-center gap-1 text-[10px] ${PALETTE.inkMid} hover:${PALETTE.ink} transition`}
                >
                  <Plus className="w-3 h-3" /> Criar etiqueta
                </button>
              </section>

              <section className={`space-y-2 pt-4 border-t ${PALETTE.border}`}>
                <label className={`text-[10px] font-bold uppercase tracking-wider ${PALETTE.inkSoft} flex items-center gap-1.5`}>
                  <Clock className="w-3 h-3" /> SLA
                </label>
                <div className={`rounded-xl ${PALETTE.panel} border ${PALETTE.border} p-3`}>
                  <div className={`text-[10px] ${PALETTE.inkSoft} mb-1`}>Primeira resposta</div>
                  <div className={`text-xs font-medium ${conv.first_response_at ? PALETTE.ink : "text-amber-600"}`}>
                    {conv.first_response_at ? new Date(conv.first_response_at).toLocaleString("pt-BR") : "pendente"}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className={`p-6 text-xs ${PALETTE.inkMid} text-center`}>
              Selecione uma conversa para ver os detalhes.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${PALETTE.inkSoft} text-[10px] uppercase tracking-wider`}>{label}</span>
      <span className={`${PALETTE.ink} text-xs font-medium truncate max-w-[60%] text-right`}>{value}</span>
    </div>
  );
}

type ThreadItem =
  | { kind: "msg"; id: string; direction: string; text: string; meta: any; created_at: string }
  | { kind: "note"; id: string; body: string; created_at: string };

function mergeThread(messages?: any[], notes?: any[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  for (const m of messages ?? []) items.push({ kind: "msg", ...m });
  for (const n of notes ?? []) items.push({ kind: "note", id: n.id, body: n.body, created_at: n.created_at });
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return items;
}

function Composer({ onSend, onNote, disabled }: { onSend: (t: string) => void; onNote: (t: string) => void; disabled: boolean }) {
  const [mode, setMode] = React.useState<"reply" | "note">("reply");
  const [text, setText] = React.useState("");
  const submit = () => {
    if (!text.trim()) return;
    if (mode === "reply") onSend(text.trim()); else onNote(text.trim());
    setText("");
  };
  const isNote = mode === "note";
  return (
    <div className={`border-t ${PALETTE.border} p-4 space-y-2.5 bg-white/60 backdrop-blur-sm`}>
      <div className={`inline-flex gap-1 p-1 ${PALETTE.softBg} rounded-lg text-[11px]`}>
        <button
          onClick={() => setMode("reply")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${mode === "reply" ? `bg-white ${PALETTE.ink} shadow-sm` : `${PALETTE.inkMid}`}`}
        >
          <MessageCircle className="w-3 h-3" /> Responder
        </button>
        <button
          onClick={() => setMode("note")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${isNote ? "bg-amber-500 text-white shadow-sm" : PALETTE.inkMid}`}
        >
          <StickyNote className="w-3 h-3" /> Nota interna
        </button>
      </div>
      <div className={`flex gap-2 items-end rounded-2xl border p-2 transition-all ${isNote ? "bg-amber-50 border-amber-200" : `bg-white ${PALETTE.borderStrong}`}`}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          rows={2}
          placeholder={isNote ? "Nota interna (invisível ao cliente)…" : "Sua resposta ao cliente… (Ctrl+Enter envia)"}
          className={`flex-1 resize-none bg-transparent px-2 py-1 text-sm focus:outline-none placeholder:text-[#A89F94] ${PALETTE.ink}`}
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label={isNote ? "Salvar nota" : "Enviar mensagem"}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isNote ? "bg-amber-500 text-white hover:bg-amber-600" : `${PALETTE.accent} ${PALETTE.accentFg} hover:opacity-90`
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          {isNote ? "Salvar" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
