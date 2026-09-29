import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { mutateFiscal, readFiscal } from "@/lib/fiscal/fiscal.functions";
import { Reference, rows, label, type Row } from "./form";
import type { Json } from "@/integrations/supabase/types";
const cls = "w-full rounded border bg-background p-2 text-sm";
export function Preparation({ org, onSaved }: { org: string; onSaved: () => void }) {
  const [type, setType] = useState("SHIPMENT");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [est, setEst] = useState("");
  const [op, setOp] = useState("");
  const [nature, setNature] = useState("");
  const [layout, setLayout] = useState("");
  const [original, setOriginal] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useQuery({
    queryKey: ["fiscal", org, "source_options", type, search],
    queryFn: () =>
      readFiscal({
        data: {
          organizationId: org,
          kind: "source_options",
          filters: { source_type: type, search },
        },
      }),
  });
  const detail = useQuery({
    queryKey: ["fiscal", org, "source_detail", type, source],
    queryFn: () =>
      readFiscal({
        data: {
          organizationId: org,
          kind: "source_detail",
          filters: { source_type: type, id: source },
        },
      }),
    enabled: !!source,
  });
  const items = rows((detail.data as Row | null)?.items);
  return (
    <form
      className="space-y-3 rounded-xl border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await mutateFiscal({
            data: {
              organizationId: org,
              operation: "prepare",
              values: {
                source_type: type,
                source_id: source,
                establishment_id: est,
                operation_type_id: op,
                nature_id: nature,
                layout_version_id: layout,
                remittance_prices: prices,
                valuation_reason: reason,
                ...(original ? { original_document_id: original } : {}),
              },
            },
          });
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Preparação falhou");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Preparar documento a partir de operação oficial</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          Origem
          <select
            className={cls}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setSource("");
              setPrices({});
            }}
          >
            {[
              ["SHIPMENT", "Expedição de venda"],
              ["PARTNER_SHIPMENT", "Remessa de parceiro"],
              ["CUSTOMER_RETURN", "Devolução de cliente"],
              ["SUPPLIER_RETURN", "Devolução ao fornecedor"],
              ["PARTNER_RETURN", "Retorno de parceiro"],
              ["INTERNAL_TRANSFER", "Transferência entre estabelecimentos"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operação de origem
          <input
            className={cls}
            placeholder="Pesquisar número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            required
            className={cls}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPrices({});
            }}
          >
            <option value="">Selecione…</option>
            {rows(options.data).map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        {[
          ["Estabelecimento", "establishments", est, setEst],
          ["Tipo fiscal", "operations", op, setOp],
          ["Natureza aprovada", "natures", nature, setNature],
          ["Leiaute validado", "layouts", layout, setLayout],
          ["Documento original (quando exigido)", "documents", original, setOriginal],
        ].map(([title, kind, value, change]) => (
          <label key={String(kind)}>
            {String(title)}
            <Reference
              org={org}
              kind={String(kind)}
              value={String(value)}
              onChange={change as (v: string) => void}
            />
          </label>
        ))}
      </div>
      {detail.error && <p role="alert">{detail.error.message}</p>}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((i) => (
            <div
              key={String(i.source_item_id)}
              className="flex flex-wrap items-center gap-3 rounded border p-3"
            >
              <span>
                {String(i.description)} · Quantidade oficial: {String(i.quantity)}
              </span>
              {type === "SHIPMENT" ? (
                <span>Preço comercial: {String(i.unit_price)}</span>
              ) : (
                <label>
                  Valor fiscal unitário
                  <input
                    className={cls}
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={prices[String(i.source_item_id)] ?? ""}
                    onChange={(e) =>
                      setPrices({ ...prices, [String(i.source_item_id)]: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
      {type !== "SHIPMENT" && (
        <label className="grid">
          Justificativa da valoração
          <input
            className={cls}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
      <p className="text-sm text-muted-foreground">
        Quantidades vêm da operação física. Preparar não movimenta estoque nem gera obrigação
        financeira. Devoluções usam classificação e regras vigentes próprias.
      </p>
      <Button disabled={busy || !source || !est || !op || !nature || !layout || !!detail.error}>
        Preparar rascunho
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
export function InboundReview({
  org,
  row,
  onSaved,
}: {
  org: string;
  row: Row;
  onSaved: () => void;
}) {
  const [receipt, setReceipt] = useState("");
  const [supplierDoc, setSupplierDoc] = useState("");
  const [payable, setPayable] = useState("");
  const [mapping, setMapping] = useState<Record<string, { receipt_item_id: string }>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const context = useQuery({
    queryKey: ["fiscal", org, "inbound_context", receipt],
    queryFn: () =>
      readFiscal({
        data: { organizationId: org, kind: "inbound_context", filters: { receipt_id: receipt } },
      }),
    enabled: !!receipt,
  });
  const data = (context.data ?? {}) as Row;
  const items = rows((row.parsed_snapshot as Row)?.items);
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const values: Record<string, Json> = {
            inbound: true,
            goods_receipt_id: receipt,
            item_mapping: mapping,
            ...(supplierDoc ? { supplier_document_id: supplierDoc } : {}),
            ...(payable ? { account_payable_id: payable } : {}),
          };
          await mutateFiscal({
            data: { organizationId: org, operation: "reconcile", id: String(row.id), values },
          });
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Conferência falhou");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">Vincular e conferir compra</h3>
      <label>
        Recebimento existente
        <Reference
          org={org}
          kind="receipt_options"
          value={receipt}
          onChange={(v) => {
            setReceipt(v);
            setSupplierDoc("");
            setPayable("");
            setMapping({});
          }}
        />
      </label>
      {[
        ["Documento de fornecedor", "supplier_documents", supplierDoc, setSupplierDoc],
        ["Obrigação financeira existente", "payables", payable, setPayable],
      ].map(([title, key, value, change]) => (
        <label className="grid" key={String(key)}>
          {String(title)}
          <select
            className={cls}
            value={String(value)}
            onChange={(e) => (change as (v: string) => void)(e.target.value)}
          >
            <option value="">Sem vínculo — manter pendência</option>
            {rows(data[String(key)]).map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
      ))}
      {items.map((i) => (
        <label className="grid" key={String(i.line)}>
          Item {String(i.line)}: {String(i.description)} · {String(i.quantity)} {String(i.unit)}
          <select
            className={cls}
            value={mapping[String(i.line)]?.receipt_item_id ?? ""}
            onChange={(e) =>
              setMapping({ ...mapping, [String(i.line)]: { receipt_item_id: e.target.value } })
            }
          >
            <option value="">Produto não mapeado — manter pendência</option>
            {rows(data.receipt_items).map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                Variante {String(r.variant_id)} · quantidade {String(r.received_quantity)} · custo{" "}
                {String(r.unit_cost)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <Button disabled={busy || !receipt}>Registrar conferência e divergências</Button>
      {(error || context.error) && <p role="alert">{error || context.error?.message}</p>}
    </form>
  );
}

export function LocationMapping({ org, onSaved }: { org: string; onSaved: () => void }) {
  const [location, setLocation] = useState("");
  const [est, setEst] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 rounded border p-4 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await mutateFiscal({
            data: {
              organizationId: org,
              operation: "location_establishment",
              id: location,
              values: { establishment_id: est },
            },
          });
          onSaved();
          setError("Vínculo registrado.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha ao vincular");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold md:col-span-2">
        Vincular localização ao estabelecimento fiscal
      </h3>
      <label>
        Localização física
        <Reference org={org} kind="location_options" value={location} onChange={setLocation} />
      </label>
      <label>
        Estabelecimento
        <Reference org={org} kind="establishments" value={est} onChange={setEst} />
      </label>
      <Button disabled={busy || !location || !est}>Registrar vínculo</Button>
      <p role="status">{error}</p>
    </form>
  );
}
