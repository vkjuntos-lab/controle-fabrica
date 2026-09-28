import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganization } from "@/lib/org/org-context";
import { ReferencePicker } from "@/components/sales/reference-picker";
import { useSalesRead, useSalesWrite, object, rows } from "@/components/sales/shared";
import type { Json } from "@/integrations/supabase/types";

/**
 * Criação de pedido de venda.
 *
 * Duas entradas possíveis e distintas: proposta aceita (conversão, que carrega o
 * preço aceito e os itens da versão) ou pedido manual (cliente, tabela e itens).
 * O preço nunca é digitado: o servidor lê a tabela oficial na data do pedido, e
 * nenhum movimento de estoque, reserva ou recebível nasce aqui — o rascunho é
 * apenas um pedido comercial.
 */
export function NewOrder({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useOrganization();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [company, setCompany] = useState("");
  const [priceTable, setPriceTable] = useState("");
  const [address, setAddress] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState([{ variant: "", quantity: 1 }]);
  const [incomplete, setIncomplete] = useState(false);

  const addresses = useSalesRead(
    organizationId,
    "addresses",
    undefined,
    company ? { company_id: company } : { company_id: "" },
  );

  const write = useSalesWrite(organizationId, {
    alsoCrm: true,
    onSuccess: (data) => {
      toast.success("Pedido criado em rascunho");
      setOpen(false);
      const id = (data as { id?: string } | null)?.id;
      if (id) void navigate({ to: "/vendas/pedidos/$id", params: { id } });
    },
  });

  if (!hasPermission("sales_orders.create")) return null;

  const addressOptions = rows(object(addresses.data).rows).map((row) => ({
    id: String(row.id ?? ""),
    label: [row.street, row.number, row.district, row.city, row.state]
      .filter(Boolean)
      .join(", "),
  }));

  const submit = () => {
    if (quote) {
      write.mutate({ operation: "convert", id: quote, values: {} });
      return;
    }
    // Os seletores de proposta, cliente, tabela e produto são botões: o navegador
    // não valida `required` neles. A verificação é feita aqui para não enviar um
    // pedido incompleto e deixar o servidor recusá-lo.
    const missingItem = items.some(
      (item) => item.variant === "" || !(item.quantity > 0),
    );
    if (company === "" || priceTable === "" || address === "" || terms.trim() === "" || missingItem) {
      setIncomplete(true);
      return;
    }
    setIncomplete(false);
    write.mutate({
      operation: "save",
      values: {
        company_id: company,
        price_table_id: priceTable,
        shipping_address_id: address,
        payment_terms_snapshot: terms,
        items: items.map((item) => ({
          variant_id: item.variant,
          quantity: item.quantity,
        })),
      } as Record<string, Json>,
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo pedido</Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (write.isPending) return;
          if (next) setIncomplete(false);
          setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo pedido</DialogTitle>
            <DialogDescription>
              Escolha uma proposta aceita para converter ou monte um pedido manual. O preço vem
              sempre da tabela oficial.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <ReferencePicker
              organizationId={organizationId}
              kind="quotes"
              label="Proposta aceita (opcional)"
              value={quote}
              onChange={setQuote}
              emptyHint="Nenhuma proposta aceita encontrada. Deixe em branco para montar um pedido manual."
            />
            {quote ? null : (
              <>
                <ReferencePicker
                  organizationId={organizationId}
                  kind="companies"
                  label="Cliente"
                  value={company}
                  onChange={(next) => {
                    setCompany(next);
                    setAddress("");
                  }}
                  emptyHint="Nenhuma empresa encontrada."
                />
                <ReferencePicker
                  organizationId={organizationId}
                  kind="price_tables"
                  label="Tabela de preços"
                  value={priceTable}
                  onChange={setPriceTable}
                  emptyHint="Nenhuma tabela de preços cadastrada."
                />
                <div className="space-y-1">
                  <Label>Endereço de entrega</Label>
                  <select
                    aria-label="Endereço de entrega"
                    required
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    disabled={!company}
                  >
                    <option value="">{company ? "Selecione" : "Escolha o cliente primeiro"}</option>
                    {addressOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {addresses.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {addresses.error.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label>Condição acordada (dias, ex.: 30/60)</Label>
                  <Input
                    required
                    aria-label="Condição acordada em dias"
                    value={terms}
                    onChange={(event) => setTerms(event.target.value)}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fica registrada no pedido como combinado. Parcelas só existem quando a
                    obrigação financeira é gerada.
                  </p>
                </div>
                {items.map((item, index) => (
                  <div key={index} className="space-y-2 rounded border p-3">
                    <ReferencePicker
                      organizationId={organizationId}
                      kind="variants"
                      label="Produto / SKU"
                      value={item.variant}
                      onChange={(next) =>
                        setItems((current) =>
                          current.map((row, position) =>
                            position === index ? { ...row, variant: next } : row,
                          ),
                        )
                      }
                      emptyHint="Nenhuma variante encontrada."
                    />
                    <div className="space-y-1">
                      <Label>Quantidade</Label>
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        required
                        aria-label={`Quantidade do item ${index + 1}`}
                        value={item.quantity}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((row, position) =>
                              position === index
                                ? { ...row, quantity: Number(event.target.value) }
                                : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems((current) => current.filter((_, position) => position !== index))
                      }
                    >
                      Remover item
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setItems((current) => [...current, { variant: "", quantity: 1 }])}
                >
                  Adicionar item
                </Button>
              </>
            )}
            <p className="text-sm text-muted-foreground">
              Nenhuma reserva é criada neste passo: reserva não é baixa de estoque. O preço
              aplicado é o da tabela oficial vigente na data do pedido.
            </p>
            {incomplete ? (
              <p role="alert" className="text-sm text-destructive">
                Informe cliente, tabela de preços, endereço de entrega e condição acordada, e
                escolha um produto com quantidade maior que zero em todos os itens.
              </p>
            ) : null}
            {write.error ? (
              <p role="alert" className="text-sm text-destructive">
                {write.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={write.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={write.isPending}>
                {write.isPending ? "Criando…" : "Criar rascunho"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
