import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createPayable,
  createReceivable,
  directMovement,
  documentMutate,
  openingBalance,
  saveAccount,
  saveCategory,
  saveCostCenter,
  savePaymentMethod,
  saveRecurrence,
  saveSettings,
  settle,
  transfer,
} from "@/lib/finance/finance.functions";
import type {
  CostCenterRow,
  FinanceSettings,
  FinancialAccountRow,
  FinancialCategoryRow,
  PaymentMethodRow,
} from "@/lib/finance/types";
import type { CompanyRow } from "@/lib/partners/types";

const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const labelClass = "text-sm font-medium text-foreground";
const gridClass = "grid gap-3 sm:grid-cols-2";

function CompanySelect({
  companies,
  value,
  onChange,
  required = true,
}: {
  companies: CompanyRow[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>Empresa {required ? "*" : ""}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{required ? "Selecione..." : "Sem empresa (opcional)"}</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.legal_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GenericSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Selecione...",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CreateReceivableDialog({
  organizationId,
  companies,
  categories,
  costCenters,
  onClose,
  onSaved,
}: {
  organizationId: string;
  companies: CompanyRow[];
  categories: FinancialCategoryRow[];
  costCenters: CostCenterRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(createReceivable);
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      const due = String(f.due_date ?? "");
      if (!due) throw new Error("Vencimento obrigatório.");
      return fn({
        data: {
          organizationId,
          data: {
            company_id: String(f.company_id || ""),
            amount: Number(f.amount),
            description: String(f.description || ""),
            due_date: due,
            competence_date: String(f.competence_date || "") || undefined,
            installments: Number(f.installments || 1),
            financial_category_id: String(f.financial_category_id || "") || undefined,
            cost_center_id: String(f.cost_center_id || "") || undefined,
            notes: String(f.notes || "") || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Conta a receber criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conta a receber</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className={gridClass}>
            <CompanySelect companies={companies} value="" onChange={() => undefined} />
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="100,00"
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Vencimento *</span>
              <Input name="due_date" type="date" required />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Competência</span>
              <Input name="competence_date" type="date" />
            </label>
            <GenericSelect
              label="Categoria"
              value=""
              onChange={() => undefined}
              options={categories.filter((c) => c.type === "REVENUE")}
              placeholder="Sem categoria"
            />
            <GenericSelect
              label="Centro de custo"
              value=""
              onChange={() => undefined}
              options={costCenters}
              placeholder="Sem centro"
            />
            <label className="block space-y-1">
              <span className={labelClass}>Parcelas</span>
              <Input name="installments" type="number" min="1" max="12" defaultValue="1" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Descrição *</span>
            <Input name="description" required placeholder="Ex.: Fechamento de julho — Loja xyz" />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Observações</span>
            <Input name="notes" placeholder="Opcional" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending}>Criar título</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePayableDialog({
  organizationId,
  companies,
  categories,
  costCenters,
  onClose,
  onSaved,
}: {
  organizationId: string;
  companies: CompanyRow[];
  categories: FinancialCategoryRow[];
  costCenters: CostCenterRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(createPayable);
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      const due = String(f.due_date ?? "");
      if (!due) throw new Error("Vencimento obrigatório.");
      return fn({
        data: {
          organizationId,
          data: {
            amount: Number(f.amount),
            description: String(f.description || ""),
            company_id: String(f.company_id || "") || undefined,
            due_date: due,
            competence_date: String(f.competence_date || "") || undefined,
            financial_category_id: String(f.financial_category_id || "") || undefined,
            cost_center_id: String(f.cost_center_id || "") || undefined,
            notes: String(f.notes || "") || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Conta a pagar criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conta a pagar</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className={gridClass}>
            <CompanySelect
              companies={companies}
              value=""
              onChange={() => undefined}
              required={false}
            />
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="100,00"
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Vencimento *</span>
              <Input name="due_date" type="date" required />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Competência</span>
              <Input name="competence_date" type="date" />
            </label>
            <GenericSelect
              label="Categoria"
              value=""
              onChange={() => undefined}
              options={categories.filter((c) => c.type === "EXPENSE")}
              placeholder="Sem categoria"
            />
            <GenericSelect
              label="Centro de custo"
              value=""
              onChange={() => undefined}
              options={costCenters}
              placeholder="Sem centro"
            />
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Descrição *</span>
            <Input name="description" required placeholder="Ex.: Energia — Setembro" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending}>Criar título</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SettleDialog({
  organizationId,
  kind,
  documentId,
  documentNumber,
  accounts,
  categories,
  costCenters,
  paymentMethods,
  onClose,
  onSaved,
}: {
  organizationId: string;
  kind: "receivable" | "payable";
  documentId: string;
  documentNumber: string;
  accounts: FinancialAccountRow[];
  categories: FinancialCategoryRow[];
  costCenters: CostCenterRow[];
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(settle);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [receiptKey, setReceiptKey] = useState("");
  const isReceivable = kind === "receivable";
  const disabled = !accountId || !amount || Number(amount) <= 0;
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          kind,
          id: documentId,
          data: {
            account_id: accountId,
            amount: Number(amount),
            discount_amount: discount ? Number(discount) : undefined,
            receipt_key: receiptKey || undefined,
          },
        },
      }),
    onSuccess: () => {
      toast.success(isReceivable ? "Recebimento registrado" : "Pagamento registrado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isReceivable ? "Registrar recebimento" : "Registrar pagamento"} · {documentNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <GenericSelect
            label="Conta financeira *"
            value={accountId}
            onChange={setAccountId}
            options={accounts.filter((a) => a.status === "ACTIVE")}
          />
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>
            {isReceivable ? null : (
              <label className="block space-y-1">
                <span className={labelClass}>Desconto (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0,00"
                />
              </label>
            )}
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Chave de idempotência (opcional)</span>
            <Input
              value={receiptKey}
              onChange={(e) => setReceiptKey(e.target.value)}
              placeholder="Ex.: TED-1234"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={disabled || mutation.isPending}>
              {isReceivable ? "Registrar recebimento" : "Registrar pagamento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type DocumentOp =
  "cancel" | "write_off" | "discount" | "adjust" | "charges" | "due_date" | "category";

const OP_TITLES: Record<DocumentOp, string> = {
  cancel: "Cancelar título",
  write_off: "Baixa por incobrabilidade",
  discount: "Conceder desconto",
  adjust: "Lançar ajuste",
  charges: "Lançar juros e multa",
  due_date: "Alterar vencimento",
  category: "Classificar categoria",
};

export function DocumentActionDialog({
  organizationId,
  kind,
  documentId,
  op,
  categories,
  costCenters,
  onClose,
  onSaved,
}: {
  organizationId: string;
  kind: "receivable" | "payable";
  documentId: string;
  op: DocumentOp;
  categories: FinancialCategoryRow[];
  costCenters: CostCenterRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(documentMutate);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("CREDIT");
  const [interest, setInterest] = useState("");
  const [penalty, setPenalty] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      const data: Record<string, string | number | undefined> = { reason: reason.trim() };
      if (op === "discount") data.amount = Number(amount);
      if (op === "adjust") {
        data.type = type;
        data.amount = Number(amount);
      }
      if (op === "charges") {
        data.interest_amount = interest ? Number(interest) : undefined;
        data.penalty_amount = penalty ? Number(penalty) : undefined;
      }
      if (op === "due_date") data.due_date = dueDate;
      if (op === "category") {
        data.financial_category_id = categoryId || undefined;
        data.cost_center_id = costCenterId || undefined;
      }
      return fn({ data: { organizationId, kind, id: documentId, op, data } });
    },
    onSuccess: () => {
      toast.success("Título atualizado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const needsReason = op !== "category";
  const disabled = mutation.isPending || (needsReason && !reason.trim());
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{OP_TITLES[op]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {needsReason ? (
            <label className="block space-y-1">
              <span className={labelClass}>Motivo *</span>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Obrigatório"
              />
            </label>
          ) : null}
          {op === "discount" ? (
            <label className="block space-y-1">
              <span className={labelClass}>Valor do desconto (R$) *</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          ) : null}
          {op === "adjust" ? (
            <div className={gridClass}>
              <label className="block space-y-1">
                <span className={labelClass}>Tipo</span>
                <select
                  className={inputClass}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="CREDIT">Crédito (aumenta)</option>
                  <option value="DEBIT">Débito (reduz)</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Valor (R$) *</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          {op === "charges" ? (
            <div className={gridClass}>
              <label className="block space-y-1">
                <span className={labelClass}>Juros (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Multa (R$)</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={penalty}
                  onChange={(e) => setPenalty(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          {op === "due_date" ? (
            <label className="block space-y-1">
              <span className={labelClass}>Nova data de vencimento *</span>
              <input
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          ) : null}
          {op === "category" ? (
            <div className={gridClass}>
              <GenericSelect
                label="Categoria"
                value={categoryId}
                onChange={setCategoryId}
                options={categories}
                placeholder="Sem categoria"
              />
              <GenericSelect
                label="Centro de custo"
                value={costCenterId}
                onChange={setCostCenterId}
                options={costCenters}
                placeholder="Sem centro"
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={disabled}>Confirmar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({
  organizationId,
  accounts,
  onClose,
  onSaved,
}: {
  organizationId: string;
  accounts: FinancialAccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(transfer);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return fn({
        data: {
          organizationId,
          data: {
            from_account_id: from,
            to_account_id: to,
            amount: Number(f.amount),
            notes: notes || undefined,
            transfer_key: String(f.transfer_key || "") || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Transferência realizada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const active = accounts.filter((a) => a.status === "ACTIVE");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (from === to) {
              toast.error("As contas devem ser diferentes.");
              return;
            }
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className={gridClass}>
            <GenericSelect label="De *" value={from} onChange={setFrom} options={active} />
            <GenericSelect label="Para *" value={to} onChange={setTo} options={active} />
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input name="amount" type="number" step="0.01" min="0" required placeholder="0,00" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Chave de idempotência (opcional)</span>
            <Input name="transfer_key" placeholder="Ex.: TED-55" />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Observações</span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!from || !to || from === to || mutation.isPending}>Transferir</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OpeningBalanceDialog({
  organizationId,
  accounts,
  onClose,
  onSaved,
}: {
  organizationId: string;
  accounts: FinancialAccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(openingBalance);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState("");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return fn({
        data: {
          organizationId,
          data: {
            account_id: accountId,
            amount: Number(f.amount),
            date: date || undefined,
            reason: String(f.reason || "Saldo inicial"),
            balance_key: String(f.balance_key || "") || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Saldo inicial lançado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Saldo inicial de conta</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <GenericSelect
            label="Conta *"
            value={accountId}
            onChange={setAccountId}
            options={accounts}
          />
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input name="amount" type="number" step="0.01" min="0" required placeholder="0,00" />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Data</span>
              <Input
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Motivo *</span>
            <Input name="reason" required placeholder="Ex.: Caixa herdado" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!accountId || mutation.isPending}>Lançar saldo</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DirectMovementDialog({
  organizationId,
  accounts,
  companies,
  categories,
  costCenters,
  paymentMethods,
  onClose,
  onSaved,
}: {
  organizationId: string;
  accounts: FinancialAccountRow[];
  companies: CompanyRow[];
  categories: FinancialCategoryRow[];
  costCenters: CostCenterRow[];
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(directMovement);
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState("IN");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      return fn({
        data: {
          organizationId,
          data: {
            account_id: accountId,
            direction: direction as "IN" | "OUT",
            amount: Number(f.amount),
            date: String(f.date || "") || undefined,
            description: String(f.description || "Movimento avulso"),
            receipt_key: String(f.receipt_key || "") || undefined,
            company_id: String(f.company_id || "") || undefined,
            financial_category_id: String(f.financial_category_id || "") || undefined,
            cost_center_id: String(f.cost_center_id || "") || undefined,
            payment_method_id: String(f.payment_method_id || "") || undefined,
          },
        },
      });
    },
    onSuccess: (r) => {
      toast.success("Movimento lançado no ledger");
      onSaved();
      return r;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Movimento avulso no ledger</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className={gridClass}>
            <GenericSelect
              label="Conta *"
              value={accountId}
              onChange={setAccountId}
              options={accounts}
            />
            <label className="block space-y-1">
              <span className={labelClass}>Direção *</span>
              <select
                className={inputClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="IN">Entrada</option>
                <option value="OUT">Saída</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input name="amount" type="number" step="0.01" min="0" required placeholder="0,00" />
            </label>
            <CompanySelect
              companies={companies}
              value=""
              onChange={() => undefined}
              required={false}
            />
          </div>
          <div className={gridClass}>
            <GenericSelect
              label="Categoria"
              value=""
              onChange={() => undefined}
              options={categories}
              placeholder="Sem categoria"
            />
            <GenericSelect
              label="Centro de custo"
              value=""
              onChange={() => undefined}
              options={costCenters}
              placeholder="Sem centro"
            />
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Descrição *</span>
            <Input name="description" required placeholder="Ex.: Receita avulsa" />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Chave de idempotência (opcional)</span>
            <Input name="receipt_key" placeholder="Opcional" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!accountId || mutation.isPending}>Lançar movimento</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaveAccountDialog({
  organizationId,
  isEdit,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  isEdit?: boolean;
  initial?: FinancialAccountRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(saveAccount);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "BANK");
  const [bankName, setBankName] = useState(initial?.bank_name ?? "");
  const [agency, setAgency] = useState(initial?.agency ?? "");
  const [accountReference, setAccountReference] = useState(initial?.account_reference ?? "");
  const [opening, setOpening] = useState(initial?.opening_balance_reference?.toString() ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          id: initial?.id,
          data: {
            name: name.trim(),
            type,
            bank_name: bankName.trim() || undefined,
            agency: agency.trim() || undefined,
            account_reference: accountReference.trim() || undefined,
            opening_balance_reference: opening ? Number(opening) : undefined,
          },
        },
      }),
    onSuccess: () => {
      toast.success(isEdit ? "Conta atualizada" : "Conta criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar conta financeira" : "Nova conta financeira"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Nome *</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Nubank PJ"
            />
          </label>
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Tipo</span>
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="BANK">Banco</option>
                <option value="CASH">Caixa</option>
                <option value="DIGITAL_WALLET">Carteira digital</option>
                <option value="PAYMENT_PROVIDER">Provedor de pagamento</option>
                <option value="OTHER">Outra</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Banco</span>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </label>
          </div>
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Agência</span>
              <Input value={agency} onChange={(e) => setAgency(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Conta</span>
              <Input
                value={accountReference}
                onChange={(e) => setAccountReference(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Saldo inicial de referência (opcional)</span>
            <Input
              type="number"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0,00"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!name.trim() || mutation.isPending}>
              {isEdit ? "Salvar" : "Criar conta"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SaveCategoryDialog({
  organizationId,
  isEdit,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  isEdit?: boolean;
  initial?: FinancialCategoryRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(saveCategory);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "EXPENSE");
  const [sortOrder, setSortOrder] = useState(initial?.sort_order?.toString() ?? "0");
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          id: initial?.id,
          data: { code: code.trim(), name: name.trim(), type, sort_order: Number(sortOrder || 0) },
        },
      }),
    onSuccess: () => {
      toast.success(isEdit ? "Categoria atualizada" : "Categoria criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Código *</span>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: FRETE"
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Tipo</span>
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="EXPENSE">Despesa</option>
                <option value="REVENUE">Receita</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Nome *</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Fretes"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Ordem</span>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!code.trim() || !name.trim() || mutation.isPending}>
              {isEdit ? "Salvar" : "Criar categoria"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SaveCostCenterDialog({
  organizationId,
  isEdit,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  isEdit?: boolean;
  initial?: CostCenterRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(saveCostCenter);
  const [code, setCode] = useState(isEdit ? (initial?.code ?? "") : "");
  const [name, setName] = useState(isEdit ? (initial?.name ?? "") : "");
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          id: initial?.id,
          data: { code: code.trim(), name: name.trim() },
        },
      }),
    onSuccess: () => {
      toast.success(isEdit ? "Centro atualizado" : "Centro criado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Código *</span>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex.: LOJAS"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Nome *</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Lojas"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!code.trim() || !name.trim() || mutation.isPending}>
              {isEdit ? "Salvar" : "Criar centro"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SavePaymentMethodDialog({
  organizationId,
  isEdit,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  isEdit?: boolean;
  initial?: PaymentMethodRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(savePaymentMethod);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          id: initial?.id,
          data: { code: code.trim(), name: name.trim() },
        },
      }),
    onSuccess: () => {
      toast.success(isEdit ? "Forma atualizada" : "Forma criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar forma de pagamento" : "Nova forma de pagamento"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Código *</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: PIX" />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Nome *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pix" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={!code.trim() || !name.trim() || mutation.isPending}>
              {isEdit ? "Salvar" : "Criar forma"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsDialog({
  organizationId,
  initial,
  onClose,
  onSaved,
}: {
  organizationId: string;
  initial: FinanceSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(saveSettings);
  const [dueDays, setDueDays] = useState(String(initial.partner_receivable_due_days));
  const [installments, setInstallments] = useState(String(initial.partner_receivable_installments));
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          organizationId,
          data: {
            partner_receivable_due_days: Number(dueDays),
            partner_receivable_installments: Number(installments),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações do financeiro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define o padrão usado quando um fechamento de parceiro gera a conta a receber.
          </p>
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Vencimento (dias)</span>
              <Input
                type="number"
                min="0"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Parcelas</span>
              <Input
                type="number"
                min="1"
                max="12"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SaveRecurrenceDialog({
  organizationId,
  companies,
  categories,
  costCenters,
  paymentMethods,
  onClose,
  onSaved,
}: {
  organizationId: string;
  companies: CompanyRow[];
  categories: FinancialCategoryRow[];
  costCenters: CostCenterRow[];
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(saveRecurrence);
  const [direction, setDirection] = useState("IN");
  const [companyId, setCompanyId] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = Object.fromEntries(new FormData(form));
      const start = String(f.start_date ?? "");
      if (!start) throw new Error("Data de início obrigatória.");
      return fn({
        data: {
          organizationId,
          data: {
            name: String(f.name || ""),
            direction,
            amount: Number(amount),
            company_id:
              direction === "IN" ? companyId : String(f.company_id_option || "") || undefined,
            financial_category_id: String(f.financial_category_id || "") || undefined,
            cost_center_id: String(f.cost_center_id || "") || undefined,
            payment_method_id: String(f.payment_method_id || "") || undefined,
            day_of_month: Number(dayOfMonth),
            start_date: start,
            end_date: String(f.end_date || "") || undefined,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Recorrência criada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova recorrência mensal</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!amount || Number(amount) <= 0) {
              toast.error("Valor obrigatório.");
              return;
            }
            mutation.mutate(e.currentTarget);
          }}
        >
          <div className={gridClass}>
            <label className="block space-y-1">
              <span className={labelClass}>Direção *</span>
              <select
                className={inputClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="IN">Receita</option>
                <option value="OUT">Despesa</option>
              </select>
            </label>
            <GenericSelect
              label={direction === "IN" ? "Empresa *" : "Empresa"}
              value={companyId}
              onChange={setCompanyId}
              options={companies.map((c) => ({ id: c.id, name: c.legal_name }))}
              placeholder={direction === "IN" ? "Selecione..." : "Opcional"}
            />
            <label className="block space-y-1">
              <span className={labelClass}>Valor (R$) *</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Dia do mês</span>
              <Input
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Início *</span>
              <Input name="start_date" type="date" required />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Fim</span>
              <Input name="end_date" type="date" />
            </label>
          </div>
          <div className={gridClass}>
            <GenericSelect
              label="Categoria"
              value=""
              onChange={() => undefined}
              options={categories}
              placeholder="Sem categoria"
            />
            <GenericSelect
              label="Centro de custo"
              value=""
              onChange={() => undefined}
              options={costCenters}
              placeholder="Sem centro"
            />
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Nome *</span>
            <Input name="name" required placeholder="Ex.: Aluguel da loja" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Voltar
            </Button>
            <Button disabled={mutation.isPending}>Criar recorrência</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
