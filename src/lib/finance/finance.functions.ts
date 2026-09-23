import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { FinanceQueryResult } from "./types";
import { FIN_KINDS } from "./constants";
const org = z.string().uuid();
const money = z.number().nonnegative().max(1e14).multipleOf(0.01);
const filters = z.record(z.string(), z.string().max(200)).default({});

export const queryFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(FIN_KINDS),
        filters,
        page: z.number().int().min(1).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_query", {
      _org: data.organizationId,
      _kind: data.kind,
      _filters: data.filters,
      _page: data.page,
    });
    if (error) throw new Error(error.message);
    return result as unknown as FinanceQueryResult;
  });

const companyRef = z.string().uuid().optional();
const categoryRef = z.string().uuid().optional();
const costCenterRef = z.string().uuid().optional();
const currency = z.literal("BRL").default("BRL");

const receivableSchema = z
  .object({
    company_id: z.string().uuid(),
    amount: money,
    description: z.string().trim().min(1).max(400),
    issue_date: z.iso.date().optional(),
    due_date: z.iso.date(),
    competence_date: z.iso.date().optional(),
    installments: z.number().int().min(1).max(12).default(1),
    financial_category_id: categoryRef,
    cost_center_id: costCenterRef,
    currency,
    notes: z.string().max(4000).optional(),
  })
  .passthrough();
export const createReceivable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: receivableSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_create_receivable", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const payableSchema = z
  .object({
    amount: money,
    description: z.string().trim().min(1).max(400),
    company_id: companyRef,
    issue_date: z.iso.date().optional(),
    due_date: z.iso.date(),
    competence_date: z.iso.date().optional(),
    financial_category_id: categoryRef,
    cost_center_id: costCenterRef,
    currency,
    notes: z.string().max(4000).optional(),
  })
  .passthrough();
export const createPayable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: payableSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_create_payable", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const documentOpSchema = z
  .object({
    reason: z.string().trim().min(1).max(600),
    amount: money.optional(),
    type: z.enum(["CREDIT", "DEBIT"]).optional(),
    interest_amount: money.optional(),
    penalty_amount: money.optional(),
    due_date: z.iso.date().optional(),
    competence_date: z.iso.date().optional(),
    financial_category_id: categoryRef,
    cost_center_id: costCenterRef,
  })
  .passthrough();
export const documentMutate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["receivable", "payable"]),
        id: org,
        op: z.enum([
          "adjust",
          "discount",
          "charges",
          "due_date",
          "competence",
          "cancel",
          "write_off",
          "category",
        ]),
        data: documentOpSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_document_mutate", {
      _org: data.organizationId,
      _kind: data.kind,
      _id: data.id,
      _op: data.op,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const settlementSchema = z
  .object({
    account_id: z.string().uuid(),
    amount: money,
    receipt_key: z.string().max(200).optional(),
    occurred_at: z.iso.datetime().optional(),
    discount_amount: money.optional(),
    interest_amount: money.optional(),
    penalty_amount: money.optional(),
    payment_method_id: z.string().uuid().optional(),
    financial_category_id: categoryRef,
    cost_center_id: costCenterRef,
    description: z.string().max(400).optional(),
  })
  .passthrough();
export const settle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        kind: z.enum(["receivable", "payable"]),
        id: org,
        data: settlementSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_settle", {
      _org: data.organizationId,
      _kind: data.kind,
      _id: data.id,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const reverseTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        transactionId: org,
        reason: z.string().trim().min(1).max(600),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_reverse_transaction", {
      _org: data.organizationId,
      _transaction_id: data.transactionId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const transferSchema = z
  .object({
    from_account_id: z.string().uuid(),
    to_account_id: z.string().uuid(),
    amount: money,
    occurred_at: z.iso.datetime().optional(),
    transfer_key: z.string().max(200).optional(),
    notes: z.string().max(400).optional(),
  })
  .passthrough();
export const transfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: transferSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_transfer", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const openingBalanceSchema = z
  .object({
    account_id: z.string().uuid(),
    amount: money,
    date: z.iso.date().optional(),
    reason: z.string().trim().min(1).max(400),
    balance_key: z.string().max(200).optional(),
  })
  .passthrough();
export const openingBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: openingBalanceSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_opening_balance", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const directMovementSchema = z
  .object({
    account_id: z.string().uuid(),
    direction: z.enum(["IN", "OUT"]),
    amount: money,
    date: z.iso.date().optional(),
    description: z.string().trim().min(1).max(400),
    receipt_key: z.string().max(200).optional(),
    company_id: companyRef,
    financial_category_id: categoryRef,
    cost_center_id: costCenterRef,
    payment_method_id: z.string().uuid().optional(),
  })
  .passthrough();
export const directMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: directMovementSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_direct_movement", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const catalogSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(180),
    type: z.enum(["REVENUE", "EXPENSE"]).optional(),
    parent_id: z.string().uuid().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    sort_order: z.number().int().optional(),
  })
  .passthrough();
export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: catalogSchema, id: org.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_save_category", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const costCenterSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(180),
    parent_id: z.string().uuid().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .passthrough();
export const saveCostCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: costCenterSchema, id: org.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_save_cost_center", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const accountSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    type: z.enum(["BANK", "CASH", "DIGITAL_WALLET", "PAYMENT_PROVIDER", "OTHER"]).optional(),
    bank_name: z.string().max(120).optional(),
    agency: z.string().max(40).optional(),
    account_reference: z.string().max(80).optional(),
    currency: currency.optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"]).optional(),
    opening_balance_reference: money.optional(),
  })
  .passthrough();
export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: accountSchema, id: org.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_save_account", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const paymentMethodSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(180),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .passthrough();
export const savePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: paymentMethodSchema, id: org.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_save_payment_method", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const settingsSchema = z
  .object({
    currency: currency.optional(),
    partner_receivable_due_days: z.number().int().min(0).max(365).optional(),
    partner_receivable_installments: z.number().int().min(1).max(12).optional(),
  })
  .passthrough();
export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: settingsSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_save_settings", {
      _org: data.organizationId,
      _data: data.data,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

const recurrenceSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    direction: z.enum(["IN", "OUT"]),
    amount: money,
    company_id: companyRef,
    financial_category_id: categoryRef,
    cost_center_id: costCenterRef,
    payment_method_id: z.string().uuid().optional(),
    frequency: z.literal("MONTHLY").default("MONTHLY"),
    day_of_month: z.number().int().min(1).max(31).default(1),
    start_date: z.iso.date(),
    end_date: z.iso.date().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .passthrough();
export const saveRecurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, data: recurrenceSchema, id: org.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_save_recurrence", {
      _org: data.organizationId,
      _data: data.data,
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const generateRecurrences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: org,
        period: z.string().regex(/^\d{4}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_generate_recurrences", {
      _org: data.organizationId,
      _period: data.period,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const processReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: org, reconciliationId: org }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("fin_process_reconciliation", {
      _org: data.organizationId,
      _reconciliation_id: data.reconciliationId,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });