import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrganization } from "@/lib/org/org-context";
import { queryPartners } from "@/lib/partners/partners.functions";
import type { PartnerList } from "@/lib/partners/types";
import { listVariantOptions, type VariantOption } from "@/lib/inventory/inventory.functions";
import {
  addReconciliationAdjustment,
  cancelMarketplaceSale,
  cancelReconciliation,
  closeReconciliation,
  createReconciliation,
  linkPartnerPrice,
  previewReconciliation,
  registerMarketplaceSale,
  reopenReconciliation,
  reprocessReconciliationItem,
  resolveReconciliationException,
  reverseReconciliationItem,
  saveMarketplaceStore,
  savePriceItem,
  savePriceTable,
  saveSkuMapping,
  queryReconciliation,
} from "@/lib/reconciliation/reconciliation.functions";
import type {
  MarketplaceStoreList,
  PreviewResult,
  ReconciliationDetail,
  ReconciliationException,
  SkuMappingList,
} from "@/lib/reconciliation/types";
import { formatMoney, formatNumber } from "@/lib/reconciliation/constants";

const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const cls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function PartnerSelect({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const fetch = useServerFn(queryPartners);
  const q = useQuery({
    queryKey: ["partners", "companies", organizationId],
    queryFn: async () =>
      (await fetch({ data: { organizationId, kind: "companies", filters: {}, page: 1 } })) as PartnerList,
  });
  return (
    <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione o parceiro</option>
      {(q.data?.rows as { id: string; legal_name: string }[] | undefined)?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.legal_name}
        </option>
      ))}
    </select>
  );
}

function StoreSelect({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const q = useQuery({
    queryKey: ["reconciliation", "stores", organizationId],
    queryFn: async () =>
      (await queryReconciliation({
        data: { organizationId, kind: "stores", filters: { status: "ACTIVE" }, page: 1 },
      })) as MarketplaceStoreList,
  });
  return (
    <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione a loja</option>
      {q.data?.rows.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.marketplace}
        </option>
      ))}
    </select>
  );
}

function VariantPicker({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const fetch = useServerFn(listVariantOptions);
  const q = useQuery({
    queryKey: ["variant-options", organizationId, query],
    queryFn: () => fetch({ data: { organizationId, activeOnly: true, query } }),
  });
  const options = (q.data as VariantOption[] | undefined) ?? [];
  return (
    <div className="space-y-2">
      <Input
        value={query}
        placeholder="Buscar por SKU, produto..."
        onChange={(e) => setQuery(e.target.value)}
      />
      {value ? (
        <p className="text-xs text-muted-foreground">
          Variante selecionada: {options.find((v) => v.id === value)?.label ?? value}
        </p>
      ) : null}
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione a variante</option>
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.sku} · {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NewReconciliationDialog({
  organizationId,
  partnerId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  partnerId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useServerFn(createReconciliation);
  const preview = useServerFn(previewReconciliation);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [partner, setPartner] = useState(partnerId ?? "");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [frequency, setFrequency] = useState("MONTHLY");
  const [p, setP] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          organizationId,
          data: { partner_id: partner, period_start: from, period_end: to, frequency },
        },
      }),
    onSuccess: () => {
      toast.success("Fechamento criado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  async function loadPreview() {
    if (!partner || !from || !to || from > to) {
      toast.error("Selecione parceiro e período válido");
      return;
    }
    setBusy(true);
    try {
      setP(await preview({ data: { organizationId, partnerId: partner, from, to } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo fechamento comercial</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Parceiro</Label>
            <PartnerSelect
              organizationId={organizationId}
              value={partner}
              onChange={setPartner}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              De
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Até
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label>
              Frequência
              <select
                className={cls}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {[
                  ["WEEKLY", "Semanal"],
                  ["BIWEEKLY", "Quinzenal"],
                  ["MONTHLY", "Mensal"],
                  ["CUSTOM", "Personalizado"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button variant="outline" disabled={busy} onClick={() => void loadPreview()}>
            {busy ? "Carregando..." : "Visualizar prévia"}
          </Button>
          {p ? (
            <div className="space-y-2 rounded border p-3">
              <p className="font-semibold">Prévia do período</p>
              <p>
                {p.sales} pedidos/linhas · {formatNumber(p.units)} unidades · gross{" "}
                {formatMoney(p.gross)}
              </p>
              <p className="text-xs text-muted-foreground">
                A prévia não baixa estoque nem gera valor; a movimentação só acontece ao processar a
                reconciliação.
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button
              disabled={!partner || !from || !to || from > to || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Criar fechamento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RegisterSaleDialog({
  organizationId,
  storeId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  storeId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutation = useServerFn(registerMarketplaceSale);
  const [store, setStore] = useState(storeId ?? "");
  const created = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return mutation({
        data: {
          organizationId,
          sale: {
            store_id: store,
            sale_date: String(f.sale_date),
            external_order_id: String(f.external_order_id),
            external_sku: String(f.external_sku),
            external_event_id: String(f.external_event_id) || undefined,
            quantity: Number(f.quantity),
            gross_amount: Number(f.gross_amount) || 0,
            shipping_fee: Number(f.shipping_fee) || 0,
            discount_amount: Number(f.discount_amount) || 0,
            platform_fee: Number(f.platform_fee) || 0,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Venda registrada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar venda do marketplace</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            created.mutate(e.currentTarget);
          }}
        >
          <div className="space-y-2">
            <Label>Loja</Label>
            <StoreSelect organizationId={organizationId} value={store} onChange={setStore} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Data da venda
              <Input type="date" name="sale_date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </label>
            <label>
              Pedido externo
              <Input name="external_order_id" required placeholder="ID do pedido" />
            </label>
            <label className="sm:col-span-2">
              SKU externo
              <Input name="external_sku" required placeholder="SKU informado pelo marketplace" />
            </label>
            <label className="sm:col-span-2">
              Evento externo (deduplicação)
              <Input name="external_event_id" placeholder="ID único do evento, se houver" />
            </label>
            <label>
              Quantidade
              <Input name="quantity" type="number" step="0.001" min="0.001" required />
            </label>
            <label>
              Valor bruto (R$)
              <Input name="gross_amount" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <label>
              Frete (R$)
              <Input name="shipping_fee" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <label>
              Desconto (R$)
              <Input name="discount_amount" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <label className="sm:col-span-2">
              Taxa da plataforma (R$)
              <Input name="platform_fee" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
          </div>
          <div className="flex justify-end">
            <Button disabled={created.isPending}>Registrar venda</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResolveExceptionDialog({
  organizationId,
  exception,
  onClose,
  onSaved,
}: {
  organizationId: string;
  exception: ReconciliationException | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const resolve = useServerFn(resolveReconciliationException);
  const reprocess = useServerFn(reprocessReconciliationItem);
  const [resolution, setResolution] = useState("REPROCESS");
  const [notes, setNotes] = useState("");
  const busy = useMutation({
    mutationFn: () =>
      resolve({ data: { organizationId, exceptionId: exception!.id, resolution, notes } }),
    onSuccess: () => {
      toast.success("Exceção resolvida");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!exception) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolver exceção</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{exception.message}</p>
          <label>
            Resolução
            <select className={inputClass} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="REPROCESS">Reprocessar item (após correção)</option>
              <option value="MANUAL">Correção manual</option>
              <option value="SUPPLY_MOVEMENT">Movimento de suprimento</option>
              <option value="IGNORED_BY_ADMIN">Ignorar com autorização de admin</option>
            </select>
          </label>
          <label>
            Observações
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {resolution === "IGNORED_BY_ADMIN" ? (
            <p className="rounded border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              Ignorar uma exceção crítica exige autorização e fica registrado no auditoria.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={busy.isPending} onClick={() => busy.mutate()}>
              Aplicar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenDialog({
  organizationId,
  reconciliationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  reconciliationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const reopen = useServerFn(reopenReconciliation);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => reopen({ data: { organizationId, reconciliationId, reason } }),
    onSuccess: () => {
      toast.success("Fechamento reaberto");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reabrir fechamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reabrir não desfaz automaticamente efeitos de estoque. A reabertura permite correção
            controlada com motivo obrigatório e registro de auditoria.
          </p>
          <label>
            Motivo (obrigatório)
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!reason.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
              Reabrir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CloseReconciliationDialog({
  organizationId,
  reconciliationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  reconciliationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const close = useServerFn(closeReconciliation);
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: () => close({ data: { organizationId, reconciliationId, notes } }),
    onSuccess: () => {
      toast.success("Período fechado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fechar período com o parceiro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ao fechar, o sistema congela o snapshot do período (unidades, valores, itens e
            exceções) e publica o evento PARTNER_RECONCILIATION_CLOSED para o futuro módulo
            financeiro. Não é possível incluir vendas novas sem reabrir e revalidar.
          </p>
          <label>
            Observações
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              Fechar período
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CancelReconciliationDialog({
  organizationId,
  reconciliationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  reconciliationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cancel = useServerFn(cancelReconciliation);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => cancel({ data: { organizationId, reconciliationId, reason } }),
    onSuccess: () => {
      toast.success("Fechamento cancelado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar fechamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Só é permitido cancelar fechamentos sem baixa de estoque aplicada. Para períodos com
            baixas, use o estorno de itens.
          </p>
          <label>
            Motivo
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              Cancelar fechamento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustmentDialog({
  organizationId,
  reconciliationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  reconciliationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const add = useServerFn(addReconciliationAdjustment);
  const [type, setType] = useState("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      add({
        data: {
          organizationId,
          reconciliationId,
          adjustment_type: type as "CREDIT" | "DEBIT",
          amount: Number(amount),
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Ajuste aplicado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajuste comercial</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crédito reduz o valor cobrável; débito aumenta. O ajuste não altera a quantidade vendida.
            Motivo é obrigatório.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Tipo
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="CREDIT">Crédito (−) </option>
                <option value="DEBIT">Débito (+)</option>
              </select>
            </label>
            <label>
              Valor (R$)
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>
          <label>
            Motivo (obrigatório)
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button
              disabled={!amount || Number(amount) < 0 || !reason.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Aplicar ajuste
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseItemDialog({
  organizationId,
  itemId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const reverse = useServerFn(reverseReconciliationItem);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => reverse({ data: { organizationId, itemId, reason } }),
    onSuccess: () => {
      toast.success("Baixa estornada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Estornar venda reconciliada</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A baixa original não é apagada: um movimento compensatório (IN) é criado e o item passa a
            REVERSED. Motivo obrigatório.
          </p>
          <label>
            Motivo (obrigatório)
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!reason.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
              Estornar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SaveStoreDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveMarketplaceStore);
  const [partner, setPartner] = useState("");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return save({
        data: {
          organizationId,
          store: {
            code: String(f.code),
            name: String(f.name),
            marketplace: String(f.marketplace),
            marketplace_store_id: String(f.marketplace_store_id) || undefined,
            ownership_type: String(f.ownership_type) as "FACTORY" | "OWN" | "PARTNER",
            partner_id: partner || undefined,
            status: String(f.status) as "ACTIVE" | "INACTIVE" | "BLOCKED",
            notes: String(f.notes) || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Loja salva");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova loja de marketplace</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Código
              <Input name="code" required />
            </label>
            <label>
              Nome
              <Input name="name" required />
            </label>
            <label>
              Marketplace
              <Input name="marketplace" defaultValue="MERCADO_LIVRE" />
            </label>
            <label>
              ID na plataforma
              <Input name="marketplace_store_id" />
            </label>
            <label>
              Titularidade
              <select name="ownership_type" className={inputClass} defaultValue="PARTNER">
                {[
                  ["FACTORY", "Fábrica"],
                  ["OWN", "Loja própria"],
                  ["PARTNER", "Parceiro"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" className={inputClass} defaultValue="ACTIVE">
                {[
                  ["ACTIVE", "Ativa"],
                  ["INACTIVE", "Inativa"],
                  ["BLOCKED", "Bloqueada"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Parceiro (se titularidade PARTNER)
              <PartnerSelect organizationId={organizationId} value="" onChange={() => {}} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending}>Salvar loja</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaveMappingDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveSkuMapping);
  const [sku, setSku] = useState("");
  const [variant, setVariant] = useState("");
  const [store, setStore] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          organizationId,
          external_sku: sku,
          variant_id: variant,
          store_id: store || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Mapeamento salvo");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mapear SKU externo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label>
            SKU externo (obrigatório)
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU do report" />
          </label>
          <label>
            Loja (opcional — global se vazio)
            <select className={inputClass} value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">Todas as lojas</option>
              {(queryReconciliation.data as never) ?? null}
            </select>
          </label>
          <VariantPicker organizationId={organizationId} value={variant} onChange={setVariant} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!sku.trim() || !variant || mutation.isPending} onClick={() => mutation.mutate()}>
              Salvar mapeamento
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PriceTableDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(savePriceTable);
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return save({
        data: {
          organizationId,
          table: {
            code: String(f.code),
            name: String(f.name),
            status: String(f.status) as "ACTIVE" | "INACTIVE",
            valid_from: String(f.valid_from) || undefined,
            valid_to: String(f.valid_to) || undefined,
            notes: String(f.notes) || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Tabela criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova tabela de preço</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Código
              <Input name="code" required />
            </label>
            <label>
              Nome
              <Input name="name" required />
            </label>
            <label>
              Vigência inicial
              <Input name="valid_from" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
            <label>
              Vigência final (opcional)
              <Input name="valid_to" type="date" />
            </label>
            <label className="sm:col-span-2">
              Status
              <select name="status" className={inputClass} defaultValue="ACTIVE">
                <option value="ACTIVE">Ativa</option>
                <option value="INACTIVE">Inativa</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending}>Salvar tabela</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PriceItemDialog({
  organizationId,
  priceTableId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  priceTableId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(savePriceItem);
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          organizationId,
          item: {
            price_table_id: priceTableId,
            variant_id: variant,
            unit_price: Number(price),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Preço adicionado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar preço unitário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <VariantPicker organizationId={organizationId} value={variant} onChange={setVariant} />
          <label>
            Preço unitário (R$)
            <Input type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!variant || !Number(price) || mutation.isPending} onClick={() => mutation.mutate()}>
              Adicionar preço
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LinkPriceDialog({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const link = useServerFn(linkPartnerPrice);
  const tables = useQuery({
    queryKey: ["reconciliation", "price_tables", organizationId],
    queryFn: async () =>
      (await queryReconciliation({
        data: { organizationId, kind: "price_tables", filters: { status: "ACTIVE" }, page: 1 },
      })) as { rows: { id: string; code: string; name: string }[]; total: number },
  });
  const [partner, setPartner] = useState("");
  const [table, setTable] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      link({
        data: {
          organizationId,
          data: { partner_id: partner, price_table_id: table },
        },
      }),
    onSuccess: () => {
      toast.success("Parceiro vinculado à tabela");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular parceiro a tabela de preço</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label>
            Parceiro
            <PartnerSelect organizationId={organizationId} value={partner} onChange={setPartner} />
          </label>
          <label>
            Tabela de preço
            <select className={inputClass} value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">Selecione a tabela</option>
              {tables.data?.rows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!partner || !table || mutation.isPending} onClick={() => mutation.mutate()}>
              Vincular
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReconciliationContextMessage() {
  return (
    <p className="text-sm text-muted-foreground">
      Remessa não é venda. Venda importada não é automaticamente reconciliada. Uma venda reconciliada
      produz no máximo uma baixa oficial de estoque. O valor do marketplace é referência — o valor
      cobrável segue a regra comercial (tabela de preço).
    </p>
  );
}