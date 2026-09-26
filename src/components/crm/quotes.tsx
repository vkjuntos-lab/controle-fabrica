import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { actCrm, type CrmRow } from "@/lib/crm/crm.functions";
import { QUOTE_FLOW, QUOTE_STATUS, quoteStatusLabel } from "@/lib/crm/constants";
import { useOrganization } from "@/lib/org/org-context";
import { areas } from "./config";
import { asNumber, asRecord, asRowsFrom, useCrmDetail, useCrmQuery } from "./data";
import { CrmListPage } from "./list";
import { Picker, ResultState, Shell, StatusBadge, money, percent, str } from "./shared";

const area = areas.propostas;

type DraftItem = { variantId: string; quantity: string };

/**
 * Propostas.
 *
 * A lista é declarativa, mas a criação e a revisão têm uma tela própria: uma
 * proposta carrega itens e o total é calculado no servidor. O cliente envia apenas
 * variante e quantidade — preço unitário, desconto aplicado, frete, tributos e
 * total são resolvidos e consolidados por `crm_action`, a partir da tabela de
 * preços vigente. Informar o preço aqui permitiria propor um valor que o
 * preço oficial não contradiz.
 */
export function QuotesPage() {
  return (
    <CrmListPage
      area={area}
      title="Comercial · Propostas"
      intro="Toda proposta nasce de uma tabela de preços vigente e de um snapshot de produto e preço por item. Revisar cria uma nova versão com o mesmo número; a versão aceita nunca é reescrita."
      extraActions={<NewQuoteButton />}
      rowHref={(row) => `/comercial/propostas/${row.id}`}
    />
  );
}

/** Atalho de criação. Fica fora da área declarativa porque o formulário tem itens. */
function NewQuoteButton() {
  const { currentOrganization, hasPermission } = useOrganization();
  const [creating, setCreating] = useState(false);
  if (!hasPermission("quotes.create")) return null;
  return (
    <>
      <Button onClick={() => setCreating(true)}>Nova proposta</Button>
      {creating && currentOrganization ? (
        <QuoteDialog org={currentOrganization.organization_id} onClose={() => setCreating(false)} />
      ) : null}
    </>
  );
}

function QuoteDialog({
  org,
  quote,
  onClose,
}: {
  org: string;
  /** Ausente na criação; presente na revisão. */
  quote?: CrmRow;
  onClose: () => void;
}) {
  const api = useServerFn(actCrm);
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({
    valid_until: "",
    discount_percent: "0",
    freight: "0",
    tax_amount: "0",
    notes: "",
  });
  const [companyId, setCompanyId] = useState("");
  const [priceTableId, setPriceTableId] = useState("");
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ variantId: "", quantity: "1" }]);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const submit = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "quote",
          id: quote?.id ?? null,
          action: quote ? "revise" : "create",
          values: {
            ...(quote ? {} : { company_id: companyId, price_table_id: priceTableId }),
            ...(contactId ? { primary_contact_id: contactId } : {}),
            ...(opportunityId ? { opportunity_id: opportunityId } : {}),
            valid_until: values.valid_until,
            discount_percent: values.discount_percent || "0",
            freight: values.freight || "0",
            tax_amount: values.tax_amount || "0",
            notes: values.notes,
            items: items
              .filter((item) => item.variantId)
              .map((item) => ({ variant_id: item.variantId, quantity: item.quantity || "1" })),
          },
          key,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        quote
          ? "Nova versão criada. A anterior continua no histórico."
          : "Proposta criada em rascunho.",
      );
      onClose();
      void client.invalidateQueries({ queryKey: ["crm"] });
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
      toast.error(error.message);
    },
  });

  const ready = Boolean(
    values.valid_until &&
    items.some((item) => item.variantId) &&
    (quote || (companyId && priceTableId)),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{quote ? "Revisar proposta" : "Nova proposta"}</DialogTitle>
          <DialogDescription>
            {quote
              ? `A revisão cria a versão ${asNumber(quote.version) + 1} da proposta ${str(quote.quote_number)}, com a mesma empresa, tabela de preços e total recalculado. A versão anterior não é apagada.`
              : "O servidor resolve o preço vigente de cada variante, calcula o total e grava o snapshot do produto. Nenhum valor é informado manualmente."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {quote ? (
            <Card>
              <CardContent className="pt-6 text-sm">
                <p className="text-muted-foreground">Proposta</p>
                <p className="font-medium">
                  {str(quote.quote_number)} · versão {str(quote.version)}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Picker
                org={org}
                kind="companies"
                value={companyId}
                onChange={setCompanyId}
                label="Cliente"
              />
              <Picker
                org={org}
                kind="price_tables"
                value={priceTableId}
                onChange={setPriceTableId}
                label="Tabela de preços"
              />
              <Picker
                org={org}
                kind="contacts"
                value={contactId}
                onChange={setContactId}
                label="Contato"
              />
              <Picker
                org={org}
                kind="opportunities"
                value={opportunityId}
                onChange={setOpportunityId}
                label="Oportunidade"
              />
            </>
          )}
        </div>

        <ItemsEditor items={items} setItems={setItems} org={org} />

        <div className="grid gap-4 sm:grid-cols-4">
          <Text
            id="quote-valid"
            label="Válida até"
            type="date"
            value={values.valid_until}
            onChange={(next) => setValues({ ...values, valid_until: next })}
          />
          <Text
            id="quote-discount"
            label="Desconto %"
            type="number"
            value={values.discount_percent}
            onChange={(next) => setValues({ ...values, discount_percent: next })}
          />
          <Text
            id="quote-freight"
            label="Frete (R$)"
            type="number"
            value={values.freight}
            onChange={(next) => setValues({ ...values, freight: next })}
          />
          <Text
            id="quote-tax"
            label="Tributos (R$)"
            type="number"
            value={values.tax_amount}
            onChange={(next) => setValues({ ...values, tax_amount: next })}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          O subtotal sai da tabela de preços vigente. Desconto maior que a sua alçada é recusado na
          aprovação, não na criação — a criação registra a intenção, a aprovação registra a decisão.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={submit.isPending || !ready} onClick={() => submit.mutate()}>
            {submit.isPending ? "Enviando..." : quote ? "Criar nova versão" : "Criar rascunho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Text({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Editor de itens: somente variante e quantidade. O preço vem da tabela oficial. */
function ItemsEditor({
  items,
  setItems,
  org,
}: {
  items: DraftItem[];
  setItems: (items: DraftItem[]) => void;
  org: string;
}) {
  const update = (index: number, patch: Partial<DraftItem>) =>
    setItems(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return (
    <fieldset className="space-y-3">
      <legend className="font-heading text-base font-semibold">Itens</legend>
      {items.map((item, index) => (
        <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_auto]">
          <Picker
            org={org}
            kind="variants"
            value={item.variantId}
            onChange={(next) => update(index, { variantId: next })}
            label={index === 0 ? "Variante" : undefined}
            id={`quote-item-${index}`}
          />
          <Text
            id={`quote-item-qty-${index}`}
            label="Quantidade"
            type="number"
            value={item.quantity}
            onChange={(next) => update(index, { quantity: next })}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setItems(items.filter((_, at) => at !== index))}
            disabled={items.length === 1}
          >
            Remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => setItems([...items, { variantId: "", quantity: "1" }])}
      >
        Adicionar item
      </Button>
    </fieldset>
  );
}

/**
 * Detalhe da proposta: consolidation, itens com snapshot, fluxo de estados
 * permitido, margem e comissão estimada atrás de `commercial_sensitive.read`, e o
 * histórico de aprovação. Uma proposta aceita não tem ação disponível — o
 * servidor não reabre, e a interface não oferece o que não existe.
 */
export function QuoteDetailPage({ id }: { id: string }) {
  return (
    <Shell title="Comercial · Proposta" permission={area.permission}>
      {(org) => <QuoteDetail org={org} id={id} />}
    </Shell>
  );
}

function QuoteDetail({ org, id }: { org: string; id: string }) {
  const { hasPermission } = useOrganization();
  const client = useQueryClient();
  const rows = useCrmQuery(org, "quotes", { id }, 1);
  const quote = (rows.data?.rows ?? [])[0] as CrmRow | undefined;
  const items = useCrmQuery(org, "quote_items", { quote_id: id });
  const approvals = useCrmQuery(org, "approvals", { quote_id: id });
  const versions = useCrmQuery(
    org,
    "quotes",
    quote ? { company_id: String(quote.company_id) } : {},
    1,
  );
  const [revising, setRevising] = useState(false);
  const [action, setAction] = useState<"approve" | "accept" | null>(null);

  const sensitive = hasPermission("commercial_sensitive.read");
  const margin = useCrmDetail(org, "margin", { id }, sensitive);
  const commission = useCrmDetail(org, "commission", { id }, sensitive);

  const refresh = () => void client.invalidateQueries({ queryKey: ["crm"] });
  const quoteRows = asRowsFrom(versions.data);
  const siblings = quoteRows.filter(
    (row) => String(row.quote_number) === String(quote?.quote_number) && row.id !== id,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            Proposta {str(quote?.quote_number)} · versão {str(quote?.version)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {quoteStatusLabel(str(quote?.status))} · válida até {str(quote?.valid_until)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={quote?.status} kind="status" />
          {quote && quote.status !== "ACCEPTED" && hasPermission("quotes.update") ? (
            <Button variant="outline" onClick={() => setRevising(true)}>
              Revisar
            </Button>
          ) : null}
        </div>
      </div>

      <ResultState loading={rows.isLoading} error={rows.error} empty={!quote}>
        <QuoteFlow status={str(quote?.status)} />
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Subtotal" value={money(quote?.subtotal)} />
          <Stat
            label="Desconto"
            value={`${percent(quote?.discount_percent)} · ${money(quote?.discount_amount)}`}
          />
          <Stat
            label="Frete e tributos"
            value={money(asNumber(quote?.freight) + asNumber(quote?.tax_amount))}
          />
          <Stat label="Total" value={money(quote?.total)} />
        </div>
        <QuoteActions
          org={org}
          quote={quote!}
          onRevise={() => setRevising(true)}
          onApprove={() => setAction("approve")}
          onAccept={() => setAction("accept")}
          onDone={refresh}
        />
      </ResultState>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Itens e snapshots</h3>
        <ResultState
          loading={items.isLoading}
          error={items.error}
          empty={!asRowsFrom(items.data).length}
        >
          <ul className="space-y-1 text-sm">
            {asRowsFrom(items.data).map((item) => {
              const product = asRecord(item.product_snapshot);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-1"
                >
                  <span>
                    {str(product.name ?? item.variant_id)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {str(product.sku)} {str(product.size)} {str(product.color)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {asNumber(item.quantity)} × {money(item.unit_price)} ={" "}
                    {money(asNumber(item.quantity) * asNumber(item.unit_price))}
                  </span>
                </li>
              );
            })}
          </ul>
        </ResultState>
      </section>

      {siblings.length ? (
        <section className="space-y-2">
          <h3 className="font-heading text-base font-semibold">Outras versões</h3>
          <ul className="space-y-1 text-sm">
            {siblings.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 border-b py-1">
                <a href={`/comercial/propostas/${row.id}`} className="hover:underline">
                  versão {str(row.version)} · {money(row.total)}
                </a>
                <StatusBadge value={row.status} kind="status" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Aprovações</h3>
        <ResultState
          loading={approvals.isLoading}
          error={approvals.error}
          empty={!asRowsFrom(approvals.data).length}
        >
          <ul className="space-y-1 text-sm">
            {asRowsFrom(approvals.data).map((row) => (
              <li key={row.id} className="border-b py-1">
                <span className="font-medium">{str(row.decision)}</span> · {str(row.reason)} ·{" "}
                <span className="text-xs text-muted-foreground">
                  {str(row.decided_at ?? row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </ResultState>
      </section>

      {sensitive ? (
        <section className="space-y-2">
          <h3 className="font-heading text-base font-semibold">Margem e comissão estimada</h3>
          <MarginPanel margin={asRecord(margin.data)} commission={asRowsFrom(commission.data)} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Margem e comissão estimada exigem a permissão comercial sensível. Nenhum valor foi
          consultado.
        </p>
      )}

      {revising ? <QuoteDialog org={org} quote={quote} onClose={() => setRevising(false)} /> : null}
      {action === "approve" ? (
        <ReasonDialog
          org={org}
          id={id}
          action="approve"
          title="Aprovar proposta"
          description="A alçada de desconto e a política de crédito do cliente são verificadas pelo servidor. Aprovação sem motivo é recusada."
          confirmLabel="Aprovar"
          onClose={() => setAction(null)}
          onDone={refresh}
        />
      ) : null}
      {action === "accept" ? (
        <AcceptDialog org={org} id={id} onClose={() => setAction(null)} onDone={refresh} />
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Fluxo permitido por status, lido de `QUOTE_FLOW`. A interface mostra apenas as
 * transições que o servidor aceita, e cada botão carrega a permissão exigida pela
 * transição — mas a decisão continua sendo do servidor.
 */
function QuoteFlow({ status }: { status: string }) {
  const flow = QUOTE_FLOW[status];
  if (!flow?.length) return null;
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {flow.map((step) => (
        <li
          key={step}
          className={
            step === status
              ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
              : "rounded-full bg-muted px-3 py-1 text-muted-foreground"
          }
        >
          {QUOTE_STATUS[step] ?? step}
        </li>
      ))}
    </ol>
  );
}

function QuoteActions({
  org,
  quote,
  onRevise,
  onApprove,
  onAccept,
  onDone,
}: {
  org: string;
  quote: CrmRow;
  onRevise: () => void;
  onApprove: () => void;
  onAccept: () => void;
  onDone: () => void;
}) {
  const { hasPermission } = useOrganization();
  const api = useServerFn(actCrm);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<string | null>(null);

  const transition = useMutation({
    mutationFn: async (action: string) => {
      await api({
        data: { organizationId: org, kind: "quote", id: quote.id, action, values: {}, key },
      });
    },
    onSuccess: (_result, action) => {
      toast.success("Status da proposta atualizado.");
      onDone();
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
      toast.error(error.message);
    },
    onMutate: (action) => setPending(action),
    onSettled: () => setPending(null),
  });

  const status = String(quote.status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && hasPermission("quotes.update") ? (
        <Button
          variant="outline"
          onClick={() => transition.mutate("submit")}
          disabled={transition.isPending}
        >
          Enviar para aprovação
        </Button>
      ) : null}
      {status === "PENDING_APPROVAL" && hasPermission("quotes.approve") ? (
        <Button onClick={onApprove}>Aprovar</Button>
      ) : null}
      {status === "APPROVED" && hasPermission("quotes.send") ? (
        <Button onClick={() => transition.mutate("send")} disabled={transition.isPending}>
          Marcar como enviada
        </Button>
      ) : null}
      {status === "SENT" && hasPermission("quotes.accept") ? (
        <>
          <Button onClick={onAccept}>Registrar aceite</Button>
          {hasPermission("quotes.update") ? (
            <Button
              variant="outline"
              onClick={() => transition.mutate("reject")}
              disabled={transition.isPending}
            >
              Rejeitar
            </Button>
          ) : null}
        </>
      ) : null}
      {status !== "ACCEPTED" && status !== "CANCELED" && hasPermission("quotes.update") ? (
        <Button variant="outline" onClick={onRevise} disabled={Boolean(pending)}>
          Revisar
        </Button>
      ) : null}
      {status === "ACCEPTED" ? (
        <p className="text-sm text-muted-foreground">
          Proposta aceita: o servidor não reabre uma proposta com aceite registrado.
        </p>
      ) : null}
    </div>
  );
}

/** Aprovação: só o motivo. Alçada e crédito são decididos pelo servidor. */
function ReasonDialog({
  org,
  id,
  action,
  title,
  description,
  confirmLabel,
  onClose,
  onDone,
}: {
  org: string;
  id: string;
  action: string;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useServerFn(actCrm);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());

  const send = useMutation({
    mutationFn: async () => {
      await api({
        data: { organizationId: org, kind: "quote", id, action, values: { reason }, key },
      });
    },
    onSuccess: () => {
      toast.success("Aprovação registrada.");
      onClose();
      onDone();
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="text-sm" htmlFor="reason">
            Motivo
          </label>
          <Textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={send.isPending || !reason.trim()} onClick={() => send.mutate()}>
            {send.isPending ? "Registrando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aceite. Exige o contato que aceitou — o servidor confere que ele pertence à
 * empresa e está ativo — e a evidência textual do aceite. O evento de domínio
 * `SALES_QUOTE_ACCEPTED` é emitido pelo servidor, de forma idempotente; esta tela
 * não grava pedido nem recebível.
 */
function AcceptDialog({
  org,
  id,
  onClose,
  onDone,
}: {
  org: string;
  id: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useServerFn(actCrm);
  const [contactId, setContactId] = useState("");
  const [evidence, setEvidence] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());

  const accept = useMutation({
    mutationFn: async () => {
      await api({
        data: {
          organizationId: org,
          kind: "quote",
          id,
          action: "accept",
          values: { contact_id: contactId, evidence },
          key,
        },
      });
    },
    onSuccess: () => {
      toast.success("Aceite registrado.");
      onClose();
      onDone();
    },
    onError: (error: Error) => {
      setKey(crypto.randomUUID());
      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar aceite</DialogTitle>
          <DialogDescription>
            O contato precisa pertencer à empresa da proposta e estar ativo. O aceite não cria
            pedido, não baixa estoque e não gera contas a receber: ele registra a decisão comercial
            e publica o evento para os módulos que reagem a ele.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Picker
            org={org}
            kind="contacts"
            value={contactId}
            onChange={setContactId}
            label="Contato que aceitou"
          />
          <div className="space-y-1">
            <label className="text-sm" htmlFor="evidence">
              Evidência do aceite
            </label>
            <Textarea
              id="evidence"
              rows={3}
              value={evidence}
              placeholder="E-mail, protocolo, referência da reunião"
              onChange={(event) => setEvidence(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={accept.isPending || !contactId} onClick={() => accept.mutate()}>
            {accept.isPending ? "Registrando..." : "Registrar aceite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Margem estimada e cenários de comissão.
 *
 * A margem só existe quando toda a linha tem custo vigente — o servidor marca
 * `INCOMPLETE` caso contrário, em vez de estimar um custo que não tem. A comissão
 * é cenário por regra, não soma: as regras são independentes por construção e o
 * servidor devolve o método explicitamente para que ninguém some cenários
 * incompatíveis e anuncie um número que não vai ser pago.
 */
function MarginPanel({
  margin,
  commission,
}: {
  margin: Record<string, unknown>;
  commission: CrmRow[];
}) {
  const complete = margin.status !== "INCOMPLETE";
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h4 className="font-medium">Margem</h4>
          {complete ? (
            <>
              <Stat label="Custo estimado" value={money(margin.cost)} />
              <Stat label="Margem bruta estimada" value={money(margin.gross_margin)} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Incompleta: ao menos um item não tem custo vigente na data da proposta. O servidor não
              estima o que não tem preço de custo registrado.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Custo estimado a partir das versões de custo vigentes. Não é custo realizado: o custo
            real aparece quando a venda entra em produção e consumo.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h4 className="font-medium">Cenários de comissão estimada</h4>
          <ul className="space-y-1 text-sm">
            {commission.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 border-b py-1">
                <span>
                  {str(row.name)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {str(row.trigger_event)}
                  </span>
                </span>
                <span className="tabular-nums">{money(row.estimated_commission)}</span>
              </li>
            ))}
            {!commission.length ? (
              <li className="text-muted-foreground">Nenhuma regra de comissão aplicável.</li>
            ) : null}
          </ul>
          <p className="text-xs text-muted-foreground">
            Cenários independentes por regra, não acumuláveis. Comissão a pagar depende de venda
            confirmada e recebimento, fatos que o MASTER 012 não gera sozinho.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
