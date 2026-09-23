import type { Json } from "@/integrations/supabase/types";

export type FinancePeriod = { from: string; to: string };

export type DashboardSummary = {
  period: FinancePeriod;
  balance: number;
  receivable_open: number;
  receivable_overdue: number;
  payable_open: number;
  payable_overdue: number;
  inflows_period: number;
  outflows_period: number;
  projected_30d: number;
};

export type ReceivableRow = {
  id: string;
  organization_id: string;
  company_id: string;
  source_type: string;
  source_id: string;
  source_status: string;
  document_number: string;
  description: string;
  issue_date: string;
  due_date: string;
  competence_date: string | null;
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  penalty_amount: number;
  adjustment_amount: number;
  open_amount: number;
  currency: string;
  status: string;
  financial_category_id: string | null;
  cost_center_id: string | null;
  installment_number: number;
  total_installments: number;
  parent_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company_name: string;
  status_effective: string;
  received_amount: number;
};
export type ReceivableList = { rows: ReceivableRow[]; total: number };

export type ReceivableSettlement = {
  id: string;
  organization_id: string;
  receivable_id: string;
  financial_transaction_id: string;
  amount: number;
  discount_amount: number;
  interest_amount: number;
  penalty_amount: number;
  settled_at: string;
  is_reversal: boolean;
  reversal_of_id: string | null;
  created_by: string | null;
  created_at: string;
  account_name: string;
};
export type ReceivableDetail = ReceivableRow & { settlements: ReceivableSettlement[] };

export type PayableRow = {
  id: string;
  organization_id: string;
  company_id: string | null;
  source_type: string;
  source_id: string;
  source_status: string;
  document_number: string;
  description: string;
  issue_date: string;
  due_date: string;
  competence_date: string | null;
  original_amount: number;
  discount_amount: number;
  interest_amount: number;
  penalty_amount: number;
  adjustment_amount: number;
  open_amount: number;
  currency: string;
  status: string;
  financial_category_id: string | null;
  cost_center_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company_name: string | null;
  status_effective: string;
  paid_amount: number;
};
export type PayableList = { rows: PayableRow[]; total: number };

export type PayableSettlement = {
  id: string;
  organization_id: string;
  payable_id: string;
  financial_transaction_id: string;
  amount: number;
  discount_amount: number;
  interest_amount: number;
  penalty_amount: number;
  settled_at: string;
  is_reversal: boolean;
  reversal_of_id: string | null;
  created_by: string | null;
  created_at: string;
  account_name: string;
};
export type PayableDetail = PayableRow & { settlements: PayableSettlement[] };

export type FinanceRow = {
  document_number: string;
  description: string;
  due_date: string;
  company_name: string;
  original_amount: number;
  open_amount: number;
  days_overdue: number;
  status_base: string;
  last_receipt: string | null;
};

export type AgingRow = { bucket: string; documents: number; total: number };
export type AgingSummary = { side: string; rows: AgingRow[] };

export type FinancialTransactionRow = {
  id: string;
  organization_id: string;
  financial_account_id: string;
  type: string;
  direction: string;
  company_id: string | null;
  operation_company_id: string | null;
  amount: number;
  occurred_at: string;
  reference_type: string | null;
  reference_id: string | null;
  payment_method_id: string | null;
  financial_category_id: string | null;
  cost_center_id: string | null;
  description: string | null;
  status: string;
  reversal_of_id: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  account_name: string;
  company_name: string | null;
  document_number: string | null;
};
export type TransactionList = { rows: FinancialTransactionRow[]; total: number };

export type FinancialAccountRow = {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  bank_name: string | null;
  agency: string | null;
  account_reference: string | null;
  currency: string;
  status: string;
  opening_balance_reference: number | null;
  created_at: string;
  updated_at: string;
  balance: number;
};
export type FinancialAccountList = { rows: FinancialAccountRow[]; total: number };

export type FinancialCategoryRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children: number;
};
export type CostCenterRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  parent_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
export type PaymentMethodRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FinanceSettings = {
  organization_id: string;
  currency: string;
  partner_receivable_due_days: number;
  partner_receivable_installments: number;
  updated_by: string | null;
  updated_at: string;
};

export type RecurrenceRow = {
  id: string;
  organization_id: string;
  name: string;
  direction: string;
  company_id: string | null;
  amount: number;
  financial_category_id: string | null;
  cost_center_id: string | null;
  payment_method_id: string | null;
  frequency: string;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company_name: string | null;
  category_name: string | null;
};

export type CashflowDay = {
  dt: string;
  opening: number;
  realized_in: number;
  realized_out: number;
  projected_in: number;
  projected_out: number;
};
export type CashflowSummary = {
  from: string;
  to: string;
  balance: number;
  realized_from: number;
  realized_in: number;
  realized_out: number;
  days: CashflowDay[];
};

export type PartnerFinanceSummary = {
  company_id: string;
  company_name: string;
  receivable_open: number;
  receivable_overdue: number;
  received_period: number;
  next_due: {
    document_number: string;
    due_date: string;
    open_amount: number;
    status: string;
  }[];
  history: {
    document_number: string;
    description: string;
    issue_date: string;
    due_date: string;
    original_amount: number;
    status: string;
    received: number;
  }[];
};

export type CategoryReportRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  inflows_realized: number;
  outflows_realized: number;
  inflows_projected: number;
  outflows_projected: number;
};
export type CategoryReport = { from: string; to: string; rows: CategoryReportRow[] };

export type CostCenterReportRow = {
  id: string;
  code: string;
  name: string;
  inflows_realized: number;
  outflows_realized: number;
};
export type CostCenterReport = { from: string; to: string; rows: CostCenterReportRow[] };

export type FinanceHistoryRow = {
  action: string;
  created_at: string;
  user_id: string;
  context: Json;
};

export type FinanceQueryResult =
  | DashboardSummary
  | ReceivableList
  | ReceivableDetail
  | PayableList
  | PayableDetail
  | { rows: FinanceRow[]; total: number }
  | AgingSummary
  | TransactionList
  | FinancialAccountList
  | FinancialCategoryRow[]
  | CostCenterRow[]
  | PaymentMethodRow[]
  | FinanceSettings
  | RecurrenceRow[]
  | CashflowSummary
  | PartnerFinanceSummary
  | CategoryReport
  | CostCenterReport
  | FinanceHistoryRow[];
