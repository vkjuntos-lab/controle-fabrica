import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import type {
  CountItemStatus,
  CountStatus,
  LocationStatus,
  LocationType,
  MovementDirection,
  MovementStatus,
  MovementType,
} from "@/lib/inventory/constants";
import { PERMISSIONS, type Permission } from "@/lib/rbac";

const movementTypeSchema = z.enum([
  "OPENING_BALANCE",
  "PURCHASE_RECEIPT",
  "PRODUCTION_OUTPUT",
  "PRODUCTION_CONSUMPTION",
  "SALE",
  "SALE_RETURN",
  "PARTNER_SHIPMENT",
  "PARTNER_RETURN",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "LOSS",
  "MANUAL_CORRECTION",
  "REVERSAL",
]);
const directionSchema = z.enum(["IN", "OUT"]);
const movementStatusSchema = z.enum(["PENDING", "POSTED", "REVERSED", "CANCELED"]);
const locationTypeSchema = z.enum([
  "FACTORY",
  "WAREHOUSE",
  "OWN_STORE",
  "MARKETPLACE",
  "PARTNER",
  "TRANSIT",
  "OTHER",
]);
const locationStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const transferTypeSchema = z.enum(["TRANSFER", "PARTNER_SHIPMENT", "PARTNER_RETURN"]);
const transferStatusSchema = z.enum([
  "DRAFT",
  "PENDING",
  "APPROVED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELED",
]);
const countStatusSchema = z.enum(["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELED"]);
const locationCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "Use apenas letras, números, ponto, traço ou sublinhado.");
const quantitySchema = z.coerce.number().positive().max(9_999_999_999.99);

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function num(value: unknown): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type Relation<T> = T | T[] | null;
function first<T>(relation: Relation<T>): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

/**
 * Checagem de permissão server-side (defesa em profundidade).
 * RLS já impõe a política; aqui garantimos que a permissão declarada existe.
 */
async function requireOrgPermission(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  permission: Permission,
  userId: string,
): Promise<void> {
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    _organization_id: organizationId,
    _permission: permission,
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!allowed) throw new Error("Sem permissão para esta operação.");
}

/* ============================================================
 * Leitura — localizações
 * ============================================================ */

export type InventoryLocationRow = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  status: LocationStatus;
  on_hand_total: number;
  created_at: string;
};

export const listInventoryLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        type: locationTypeSchema.optional(),
        includeInactive: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    let builder = context.supabase
      .from("inventory_locations")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("type", { ascending: true })
      .order("name", { ascending: true });
    if (data.type) builder = builder.eq("type", data.type);
    if (!data.includeInactive) builder = builder.eq("status", "ACTIVE");

    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);

    const { data: balances, error: balanceError } = await context.supabase
      .from("inventory_balances")
      .select("location_id, on_hand")
      .eq("organization_id", data.organizationId);
    if (balanceError) throw new Error(balanceError.message);

    const totals = new Map<string, number>();
    for (const b of balances ?? []) {
      totals.set(b.location_id, (totals.get(b.location_id) ?? 0) + num(b.on_hand));
    }

    return (rows ?? []).map((row): InventoryLocationRow => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      status: row.status,
      on_hand_total: totals.get(row.id) ?? 0,
      created_at: row.created_at,
    }));
  });

export const createInventoryLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        code: locationCodeSchema,
        name: z.string().trim().min(2).max(120),
        type: locationTypeSchema.default("WAREHOUSE"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryManageLocations,
      context.userId,
    );

    const { data: created, error } = await context.supabase
      .from("inventory_locations")
      .insert({
        organization_id: data.organizationId,
        code: data.code,
        name: data.name,
        type: data.type,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, code, name, type, status")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "inventory.location.create",
      resource: "inventory_locations",
      resource_id: created.id,
      context: { code: created.code, type: created.type },
    });

    return created;
  });

export const updateInventoryLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        locationId: z.string().uuid(),
        name: z.string().trim().min(2).max(120),
        type: locationTypeSchema,
        status: locationStatusSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryManageLocations,
      context.userId,
    );

    const { error } = await context.supabase
      .from("inventory_locations")
      .update({
        name: data.name,
        type: data.type,
        status: data.status,
        updated_by: context.userId,
      })
      .eq("id", data.locationId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "inventory.location.update",
      resource: "inventory_locations",
      resource_id: data.locationId,
      context: { type: data.type, status: data.status },
    });

    return { ok: true };
  });

/* ============================================================
 * Leitura — posição de estoque
 * ============================================================ */

export type InventoryPositionRow = {
  variant_id: string;
  location_id: string;
  on_hand: number;
  last_movement_at: string | null;
  sku: string;
  product_name: string;
  product_code: string;
  size: string | null;
  color: string | null;
  location_name: string;
  location_code: string;
  location_type: LocationType;
  minimum_stock: number;
  reorder_point: number;
  below_minimum: boolean;
};

export type InventoryPositionResult = {
  rows: InventoryPositionRow[];
  total: number;
  page: number;
  pageSize: number;
  total_on_hand: number;
};

/**
 * Posição física agregada por variante + localização. O saldo NUNCA é lido de
 * uma coluna: vem da view derivada `inventory_balances` (o ledger é a verdade).
 */
export const listInventoryPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        query: z.string().trim().max(120).optional(),
        locationId: z.string().uuid().optional(),
        locationType: locationTypeSchema.optional(),
        onlyBelowMinimum: z.boolean().default(false),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    const [balancesRes, locationsRes, variantsRes] = await Promise.all([
      context.supabase
        .from("inventory_balances")
        .select("variant_id, location_id, on_hand, last_movement_at")
        .eq("organization_id", data.organizationId),
      context.supabase
        .from("inventory_locations")
        .select("id, code, name, type, status")
        .eq("organization_id", data.organizationId),
      context.supabase
        .from("product_variants")
        .select("id, sku, size, color, minimum_stock, reorder_point, products(name, code)")
        .eq("organization_id", data.organizationId),
    ]);
    if (balancesRes.error) throw new Error(balancesRes.error.message);
    if (locationsRes.error) throw new Error(locationsRes.error.message);
    if (variantsRes.error) throw new Error(variantsRes.error.message);

    const locations = new Map((locationsRes.data ?? []).map((l) => [l.id, l]));
    const variants = new Map(
      (variantsRes.data ?? []).map((v) => {
        const product = first(v.products as Relation<{ name: string; code: string }>);
        return [
          v.id,
          {
            sku: v.sku,
            size: v.size,
            color: v.color,
            minimum_stock: num(v.minimum_stock),
            reorder_point: num(v.reorder_point),
            product_name: product?.name ?? "—",
            product_code: product?.code ?? "",
          },
        ];
      }),
    );

    // Agrega por variante + localização (ignora a granularidade de lote).
    const grouped = new Map<
      string,
      { variant_id: string; location_id: string; on_hand: number; last_movement_at: string | null }
    >();
    for (const b of balancesRes.data ?? []) {
      const key = `${b.variant_id}:${b.location_id}`;
      const current = grouped.get(key);
      const onHand = num(b.on_hand);
      if (current) {
        current.on_hand += onHand;
        if (
          b.last_movement_at &&
          (!current.last_movement_at || b.last_movement_at > current.last_movement_at)
        ) {
          current.last_movement_at = b.last_movement_at;
        }
      } else {
        grouped.set(key, {
          variant_id: b.variant_id,
          location_id: b.location_id,
          on_hand: onHand,
          last_movement_at: b.last_movement_at,
        });
      }
    }

    const query = data.query?.toLowerCase();
    let rows: InventoryPositionRow[] = [];
    for (const entry of grouped.values()) {
      const location = locations.get(entry.location_id);
      const variant = variants.get(entry.variant_id);
      if (!location || !variant) continue;
      if (data.locationId && entry.location_id !== data.locationId) continue;
      if (data.locationType && location.type !== data.locationType) continue;

      const belowMinimum = entry.on_hand < variant.minimum_stock;
      if (data.onlyBelowMinimum && !belowMinimum) continue;

      if (query) {
        const haystack = [
          variant.sku,
          variant.product_name,
          variant.product_code,
          variant.size ?? "",
          variant.color ?? "",
          location.name,
          location.code,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) continue;
      }

      rows.push({
        variant_id: entry.variant_id,
        location_id: entry.location_id,
        on_hand: entry.on_hand,
        last_movement_at: entry.last_movement_at,
        sku: variant.sku,
        product_name: variant.product_name,
        product_code: variant.product_code,
        size: variant.size,
        color: variant.color,
        location_name: location.name,
        location_code: location.code,
        location_type: location.type,
        minimum_stock: variant.minimum_stock,
        reorder_point: variant.reorder_point,
        below_minimum: belowMinimum,
      });
    }

    rows.sort((a, b) => a.product_name.localeCompare(b.product_name) || a.sku.localeCompare(b.sku));
    const totalOnHand = rows.reduce((acc, r) => acc + r.on_hand, 0);

    const total = rows.length;
    const from = (data.page - 1) * data.pageSize;
    rows = rows.slice(from, from + data.pageSize);

    return {
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
      total_on_hand: totalOnHand,
    } satisfies InventoryPositionResult;
  });

/** Posição em poder de terceiros (localizações do tipo PARTNER). */
export const listThirdPartyPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    const { data: partners, error: partnerError } = await context.supabase
      .from("inventory_locations")
      .select("id, code, name, type, status")
      .eq("organization_id", data.organizationId)
      .eq("type", "PARTNER");
    if (partnerError) throw new Error(partnerError.message);

    const partnerIds = (partners ?? []).map((p) => p.id);
    if (!partnerIds.length) return { partners: [], rows: [] as InventoryPositionRow[] };

    const { data: balances, error: balanceError } = await context.supabase
      .from("inventory_balances")
      .select("variant_id, location_id, on_hand, last_movement_at")
      .eq("organization_id", data.organizationId)
      .in("location_id", partnerIds);
    if (balanceError) throw new Error(balanceError.message);

    const variantIds = [...new Set((balances ?? []).map((b) => b.variant_id))];
    const { data: variantRows, error: variantError } = variantIds.length
      ? await context.supabase
          .from("product_variants")
          .select("id, sku, size, color, minimum_stock, reorder_point, products(name, code)")
          .eq("organization_id", data.organizationId)
          .in("id", variantIds)
      : { data: [], error: null };
    if (variantError) throw new Error(variantError.message);

    const variants = new Map(
      (variantRows ?? []).map((v) => {
        const product = first(v.products as Relation<{ name: string; code: string }>);
        return [
          v.id,
          {
            sku: v.sku,
            size: v.size,
            color: v.color,
            minimum_stock: num(v.minimum_stock),
            reorder_point: num(v.reorder_point),
            product_name: product?.name ?? "—",
            product_code: product?.code ?? "",
          },
        ];
      }),
    );
    const locations = new Map((partners ?? []).map((p) => [p.id, p]));

    const rows: InventoryPositionRow[] = [];
    for (const b of balances ?? []) {
      const variant = variants.get(b.variant_id);
      const location = locations.get(b.location_id);
      if (!variant || !location) continue;
      const onHand = num(b.on_hand);
      rows.push({
        variant_id: b.variant_id,
        location_id: b.location_id,
        on_hand: onHand,
        last_movement_at: b.last_movement_at,
        sku: variant.sku,
        product_name: variant.product_name,
        product_code: variant.product_code,
        size: variant.size,
        color: variant.color,
        location_name: location.name,
        location_code: location.code,
        location_type: "PARTNER",
        minimum_stock: variant.minimum_stock,
        reorder_point: variant.reorder_point,
        below_minimum: onHand < variant.minimum_stock,
      });
    }
    rows.sort(
      (a, b) => a.location_name.localeCompare(b.location_name) || a.sku.localeCompare(b.sku),
    );

    return {
      partners: (partners ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
      })),
      rows,
    };
  });

/* ============================================================
 * Escrita no ledger — sempre por RPC transacional
 * ============================================================ */

export type PostMovementInput = {
  organizationId: string;
  variantId: string;
  locationId: string;
  movementType: MovementType;
  quantity: number;
  direction?: MovementDirection;
  reason?: string | null;
  occurredAt?: string;
  unit?: string;
  referenceType?: string | null;
  referenceId?: string | null;
  batchId?: string | null;
  idempotencyKey?: string | null;
  allowNegativeOverride?: boolean;
};

/** Registra um movimento no ledger via RPC (validação de saldo no banco). */
export const postInventoryMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        variantId: z.string().uuid(),
        locationId: z.string().uuid(),
        movementType: movementTypeSchema,
        quantity: quantitySchema,
        direction: directionSchema.optional(),
        reason: z.string().trim().max(500).nullable().optional(),
        occurredAt: z.string().datetime().optional(),
        unit: z.string().trim().max(20).optional(),
        referenceType: z.string().trim().max(60).nullable().optional(),
        referenceId: z.string().uuid().nullable().optional(),
        batchId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().trim().max(160).nullable().optional(),
        allowNegativeOverride: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("inventory_post_movement", {
      _organization_id: data.organizationId,
      _variant_id: data.variantId,
      _location_id: data.locationId,
      _movement_type: data.movementType,
      _quantity: data.quantity,
      _reason: data.reason ?? undefined,
      _occurred_at: data.occurredAt ?? undefined,
      _unit: data.unit ?? undefined,
      _reference_type: data.referenceType ?? undefined,
      _reference_id: data.referenceId ?? undefined,
      _batch_id: data.batchId ?? undefined,
      _idempotency_key: data.idempotencyKey ?? undefined,
      _direction: data.direction ?? undefined,
      _allow_negative_override: data.allowNegativeOverride ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export type PostTransferInput = {
  organizationId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  transferType: "TRANSFER" | "PARTNER_SHIPMENT" | "PARTNER_RETURN";
  items: { variantId: string; quantity: number }[];
  notes?: string | null;
  idempotencyKey?: string | null;
};

/** Transferência/remessa/retorno: par OUT+IN atômico no banco. */
export const postInventoryTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        sourceLocationId: z.string().uuid(),
        destinationLocationId: z.string().uuid(),
        transferType: transferTypeSchema.default("TRANSFER"),
        items: z
          .array(
            z.object({
              variantId: z.string().uuid(),
              quantity: quantitySchema,
            }),
          )
          .min(1),
        notes: z.string().trim().max(500).nullable().optional(),
        idempotencyKey: z.string().trim().max(160).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const items = data.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
    }));
    const { data: result, error } = await context.supabase.rpc("inventory_post_transfer", {
      _organization_id: data.organizationId,
      _source_location_id: data.sourceLocationId,
      _destination_location_id: data.destinationLocationId,
      _items: items as unknown as Json,
      _transfer_type: data.transferType,
      _notes: data.notes ?? undefined,
      _idempotency_key: data.idempotencyKey ?? undefined,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const reverseInventoryMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        movementId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("inventory_reverse_movement", {
      _organization_id: data.organizationId,
      _movement_id: data.movementId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const getInventoryBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        variantId: z.string().uuid(),
        locationId: z.string().uuid().optional(),
        batchId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: balance, error } = await context.supabase.rpc("inventory_get_balance", {
      _organization_id: data.organizationId,
      _variant_id: data.variantId,
      _location_id: data.locationId,
      _batch_id: data.batchId,
    });
    if (error) throw new Error(error.message);
    return num(balance);
  });

/* ============================================================
 * Leitura — movimentações
 * ============================================================ */

export type InventoryMovementRow = {
  id: string;
  occurred_at: string;
  created_at: string;
  movement_type: MovementType;
  direction: MovementDirection;
  quantity: number;
  unit: string;
  status: MovementStatus;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string | null;
  variant_id: string;
  location_id: string;
  batch_id: string | null;
  sku: string;
  product_name: string;
  size: string | null;
  color: string | null;
  location_name: string;
  location_type: LocationType;
  reversal_of_id: string | null;
  reversed_by_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
};

export type InventoryMovementResult = {
  rows: InventoryMovementRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const listInventoryMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        movementType: movementTypeSchema.optional(),
        direction: directionSchema.optional(),
        status: movementStatusSchema.optional(),
        locationId: z.string().uuid().optional(),
        variantId: z.string().uuid().optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryMovementsRead,
      context.userId,
    );

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let builder = context.supabase
      .from("inventory_movements")
      .select(
        "id, occurred_at, created_at, movement_type, direction, quantity, unit, status, reason, reference_type, reference_id, idempotency_key, variant_id, location_id, batch_id, reversal_of_id, reversed_by_id, created_by, product_variants(sku, size, color, products(name)), inventory_locations(name, type)",
        { count: "exact" },
      )
      .eq("organization_id", data.organizationId)
      .order("occurred_at", { ascending: false })
      .range(from, to);

    if (data.movementType) builder = builder.eq("movement_type", data.movementType);
    if (data.direction) builder = builder.eq("direction", data.direction);
    if (data.status) builder = builder.eq("status", data.status);
    if (data.locationId) builder = builder.eq("location_id", data.locationId);
    if (data.variantId) builder = builder.eq("variant_id", data.variantId);
    if (data.dateFrom) builder = builder.gte("occurred_at", data.dateFrom);
    if (data.dateTo) builder = builder.lte("occurred_at", data.dateTo);

    const { data: rows, count, error } = await builder;
    if (error) throw new Error(error.message);

    const userIds = [
      ...new Set((rows ?? []).map((r) => r.created_by).filter((id): id is string => Boolean(id))),
    ];
    const profiles = userIds.length
      ? (await context.supabase.from("profiles").select("id, full_name, email").in("id", userIds))
          .data
      : [];
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const items: InventoryMovementRow[] = (rows ?? []).map((row) => {
      const variant = first(
        row.product_variants as Relation<{
          sku: string;
          size: string | null;
          color: string | null;
          products: Relation<{ name: string }>;
        }>,
      );
      const product = variant ? first(variant.products) : null;
      const location = first(
        row.inventory_locations as Relation<{ name: string; type: LocationType }>,
      );
      const profile = row.created_by ? profileById.get(row.created_by) : null;
      return {
        id: row.id,
        occurred_at: row.occurred_at,
        created_at: row.created_at,
        movement_type: row.movement_type,
        direction: row.direction,
        quantity: num(row.quantity),
        unit: row.unit,
        status: row.status,
        reason: row.reason,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        idempotency_key: row.idempotency_key,
        variant_id: row.variant_id,
        location_id: row.location_id,
        batch_id: row.batch_id,
        sku: variant?.sku ?? "—",
        product_name: product?.name ?? "—",
        size: variant?.size ?? null,
        color: variant?.color ?? null,
        location_name: location?.name ?? "—",
        location_type: location?.type ?? "OTHER",
        reversal_of_id: row.reversal_of_id,
        reversed_by_id: row.reversed_by_id,
        created_by: row.created_by,
        created_by_name: profile?.full_name ?? profile?.email ?? null,
      };
    });

    return {
      rows: items,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    } satisfies InventoryMovementResult;
  });

export const getInventoryMovement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), movementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryMovementsRead,
      context.userId,
    );

    const { data: row, error } = await context.supabase
      .from("inventory_movements")
      .select(
        "*, product_variants(sku, size, color, products(name, code)), inventory_locations(name, code, type), inventory_batches(batch_code, expires_at)",
      )
      .eq("id", data.movementId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Movimento não encontrado.");

    const variant = first(
      row.product_variants as Relation<{
        sku: string;
        size: string | null;
        color: string | null;
        products: Relation<{ name: string; code: string }>;
      }>,
    );
    const product = variant ? first(variant.products) : null;
    const location = first(
      row.inventory_locations as Relation<{ name: string; code: string; type: LocationType }>,
    );
    const batch = first(
      row.inventory_batches as Relation<{ batch_code: string; expires_at: string | null }>,
    );

    let reversedBy: { id: string; occurred_at: string } | null = null;
    if (row.reversed_by_id) {
      const { data: reversal } = await context.supabase
        .from("inventory_movements")
        .select("id, occurred_at")
        .eq("id", row.reversed_by_id)
        .maybeSingle();
      reversedBy = reversal ?? null;
    }

    let reversalOf: { id: string; occurred_at: string; movement_type: MovementType } | null = null;
    if (row.reversal_of_id) {
      const { data: original } = await context.supabase
        .from("inventory_movements")
        .select("id, occurred_at, movement_type")
        .eq("id", row.reversal_of_id)
        .maybeSingle();
      reversalOf = original ?? null;
    }

    return {
      ...row,
      quantity: num(row.quantity),
      sku: variant?.sku ?? "—",
      product_name: product?.name ?? "—",
      product_code: product?.code ?? "",
      size: variant?.size ?? null,
      color: variant?.color ?? null,
      location_name: location?.name ?? "—",
      location_code: location?.code ?? "",
      location_type: location?.type ?? "OTHER",
      batch_code: batch?.batch_code ?? null,
      batch_expires_at: batch?.expires_at ?? null,
      reversed_by: reversedBy,
      reversal_of: reversalOf,
    };
  });

/* ============================================================
 * Leitura — transferências
 * ============================================================ */

export type InventoryTransferItemRow = {
  variant_id: string;
  sku: string;
  product_name: string;
  size: string | null;
  color: string | null;
  quantity: number;
};

export type InventoryTransferRow = {
  id: string;
  transfer_type: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  notes: string | null;
  source_location_id: string;
  source_location_name: string;
  destination_location_id: string;
  destination_location_name: string;
  items: InventoryTransferItemRow[];
};

export type InventoryTransferResult = {
  rows: InventoryTransferRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const listInventoryTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        transferType: transferTypeSchema.optional(),
        status: transferStatusSchema.optional(),
        locationId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let builder = context.supabase
      .from("inventory_transfers")
      .select(
        "*, inventory_transfer_items(variant_id, quantity, product_variants(sku, size, color, products(name)))",
        { count: "exact" },
      )
      .eq("organization_id", data.organizationId)
      .order("requested_at", { ascending: false })
      .range(from, to);

    if (data.transferType) builder = builder.eq("transfer_type", data.transferType);
    if (data.status) builder = builder.eq("status", data.status);
    if (data.locationId) {
      builder = builder.or(
        `source_location_id.eq.${data.locationId},destination_location_id.eq.${data.locationId}`,
      );
    }

    const { data: rows, count, error } = await builder;
    if (error) throw new Error(error.message);

    const locationIds = [
      ...new Set((rows ?? []).flatMap((r) => [r.source_location_id, r.destination_location_id])),
    ];
    const locations = locationIds.length
      ? (
          await context.supabase
            .from("inventory_locations")
            .select("id, name, code")
            .in("id", locationIds)
        ).data
      : [];
    const locationById = new Map((locations ?? []).map((l) => [l.id, l]));

    const items: InventoryTransferRow[] = (rows ?? []).map((row) => ({
      id: row.id,
      transfer_type: row.transfer_type,
      status: row.status,
      requested_at: row.requested_at,
      completed_at: row.completed_at,
      notes: row.notes,
      source_location_id: row.source_location_id,
      source_location_name: locationById.get(row.source_location_id)?.name ?? "—",
      destination_location_id: row.destination_location_id,
      destination_location_name: locationById.get(row.destination_location_id)?.name ?? "—",
      items: (row.inventory_transfer_items ?? []).map((item) => {
        const variant = first(
          item.product_variants as Relation<{
            sku: string;
            size: string | null;
            color: string | null;
            products: Relation<{ name: string }>;
          }>,
        );
        const product = variant ? first(variant.products) : null;
        return {
          variant_id: item.variant_id,
          sku: variant?.sku ?? "—",
          product_name: product?.name ?? "—",
          size: variant?.size ?? null,
          color: variant?.color ?? null,
          quantity: num(item.quantity),
        };
      }),
    }));

    return {
      rows: items,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    } satisfies InventoryTransferResult;
  });

/* ============================================================
 * Leitura — lotes e variantes auxiliares
 * ============================================================ */

export type VariantOption = {
  id: string;
  sku: string;
  label: string;
  size: string | null;
  color: string | null;
  product_name: string;
};

export const listVariantOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        query: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    let builder = context.supabase
      .from("product_variants")
      .select("id, sku, size, color, status, products(name)")
      .eq("organization_id", data.organizationId)
      .eq("status", "ACTIVE")
      .order("sku", { ascending: true })
      .limit(500);

    if (data.query) builder = builder.ilike("sku", `%${data.query}%`);

    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row): VariantOption => {
      const product = first(row.products as Relation<{ name: string }>);
      const attrs = [row.size, row.color].filter(Boolean).join(" · ");
      return {
        id: row.id,
        sku: row.sku,
        label: `${row.sku} — ${product?.name ?? "—"}${attrs ? ` (${attrs})` : ""}`,
        size: row.size,
        color: row.color,
        product_name: product?.name ?? "—",
      };
    });
  });

export type BatchRow = {
  id: string;
  batch_code: string;
  variant_id: string;
  sku: string;
  product_name: string;
  manufactured_at: string | null;
  expires_at: string | null;
  status: string;
  created_at: string;
};

export const listBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    let builder = context.supabase
      .from("inventory_batches")
      .select("*, product_variants(sku, products(name))")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.variantId) builder = builder.eq("variant_id", data.variantId);

    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row): BatchRow => {
      const variant = first(
        row.product_variants as Relation<{
          sku: string;
          products: Relation<{ name: string }>;
        }>,
      );
      const product = variant ? first(variant.products) : null;
      return {
        id: row.id,
        batch_code: row.batch_code,
        variant_id: row.variant_id,
        sku: variant?.sku ?? "—",
        product_name: product?.name ?? "—",
        manufactured_at: row.manufactured_at,
        expires_at: row.expires_at,
        status: row.status,
        created_at: row.created_at,
      };
    });
  });

export const createBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        variantId: z.string().uuid(),
        batchCode: z.string().trim().min(1).max(60),
        manufacturedAt: z.string().datetime().nullable().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryMove,
      context.userId,
    );

    const { data: created, error } = await context.supabase
      .from("inventory_batches")
      .insert({
        organization_id: data.organizationId,
        variant_id: data.variantId,
        batch_code: data.batchCode,
        manufactured_at: data.manufacturedAt ?? null,
        expires_at: data.expiresAt ?? null,
        created_by: context.userId,
      })
      .select("id, batch_code")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "inventory.batch.create",
      resource: "inventory_batches",
      resource_id: created.id,
      context: { batch_code: created.batch_code, variant_id: data.variantId },
    });

    return created;
  });

/* ============================================================
 * Configuração organizacional
 * ============================================================ */

export type InventorySettings = {
  allow_negative_inventory: boolean;
};

export const getInventorySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    const { data: row, error } = await context.supabase
      .from("organization_inventory_settings")
      .select("allow_negative_inventory")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return {
      allow_negative_inventory: row?.allow_negative_inventory ?? false,
    } satisfies InventorySettings;
  });

export const updateInventorySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        allowNegativeInventory: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryManageLocations,
      context.userId,
    );

    const { error } = await context.supabase.from("organization_inventory_settings").upsert(
      {
        organization_id: data.organizationId,
        allow_negative_inventory: data.allowNegativeInventory,
        updated_by: context.userId,
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "inventory.settings.update",
      resource: "organization_inventory_settings",
      context: { allow_negative_inventory: data.allowNegativeInventory },
    });

    return { ok: true };
  });

/* ============================================================
 * Inventário físico (contagem)
 * ============================================================ */

export type InventoryCountRow = {
  id: string;
  status: CountStatus;
  location_id: string;
  location_name: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  items_count: number;
  counted_count: number;
};

export const listInventoryCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        status: countStatusSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    let builder = context.supabase
      .from("inventory_counts")
      .select(
        "id, status, location_id, created_at, started_at, completed_at, inventory_locations(name), inventory_count_items(id, counted_quantity)",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) builder = builder.eq("status", data.status);

    const { data: rows, error } = await builder;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((row): InventoryCountRow => {
      const location = first(row.inventory_locations as Relation<{ name: string }>);
      const items = row.inventory_count_items ?? [];
      return {
        id: row.id,
        status: row.status,
        location_id: row.location_id,
        location_name: location?.name ?? "—",
        created_at: row.created_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        items_count: items.length,
        counted_count: items.filter((i) => i.counted_quantity != null).length,
      };
    });
  });

export type InventoryCountItemRow = {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  size: string | null;
  color: string | null;
  system_quantity: number;
  counted_quantity: number | null;
  difference: number | null;
  status: CountItemStatus;
};

export const getInventoryCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), countId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryRead,
      context.userId,
    );

    const { data: count, error } = await context.supabase
      .from("inventory_counts")
      .select("*, inventory_locations(name, code, type)")
      .eq("id", data.countId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Contagem não encontrada.");

    const { data: items, error: itemError } = await context.supabase
      .from("inventory_count_items")
      .select(
        "id, variant_id, system_quantity, counted_quantity, difference, status, product_variants(sku, size, color, products(name))",
      )
      .eq("inventory_count_id", data.countId)
      .order("created_at", { ascending: true });
    if (itemError) throw new Error(itemError.message);

    const location = first(
      count.inventory_locations as Relation<{ name: string; code: string; type: LocationType }>,
    );

    const rows: InventoryCountItemRow[] = (items ?? []).map((item) => {
      const variant = first(
        item.product_variants as Relation<{
          sku: string;
          size: string | null;
          color: string | null;
          products: Relation<{ name: string }>;
        }>,
      );
      const product = variant ? first(variant.products) : null;
      return {
        id: item.id,
        variant_id: item.variant_id,
        sku: variant?.sku ?? "—",
        product_name: product?.name ?? "—",
        size: variant?.size ?? null,
        color: variant?.color ?? null,
        system_quantity: num(item.system_quantity),
        counted_quantity: item.counted_quantity == null ? null : num(item.counted_quantity),
        difference: item.difference == null ? null : num(item.difference),
        status: item.status,
      };
    });

    return {
      id: count.id,
      status: count.status,
      location_id: count.location_id,
      location_name: location?.name ?? "—",
      location_code: location?.code ?? "",
      created_at: count.created_at,
      started_at: count.started_at,
      completed_at: count.completed_at,
      items: rows,
    };
  });

export const createInventoryCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        locationId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryCount,
      context.userId,
    );

    const { data: count, error } = await context.supabase
      .from("inventory_counts")
      .insert({
        organization_id: data.organizationId,
        location_id: data.locationId,
        status: "IN_PROGRESS",
        started_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const [variantsRes, balancesRes] = await Promise.all([
      context.supabase
        .from("product_variants")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("status", "ACTIVE")
        .limit(2000),
      context.supabase
        .from("inventory_balances")
        .select("variant_id, on_hand")
        .eq("organization_id", data.organizationId)
        .eq("location_id", data.locationId),
    ]);
    if (variantsRes.error) throw new Error(variantsRes.error.message);
    if (balancesRes.error) throw new Error(balancesRes.error.message);

    const balanceByVariant = new Map<string, number>();
    for (const b of balancesRes.data ?? []) {
      balanceByVariant.set(
        b.variant_id,
        (balanceByVariant.get(b.variant_id) ?? 0) + num(b.on_hand),
      );
    }

    const items = (variantsRes.data ?? []).map((v) => ({
      organization_id: data.organizationId,
      inventory_count_id: count.id,
      variant_id: v.id,
      batch_id: null,
      system_quantity: balanceByVariant.get(v.id) ?? 0,
      status: "PENDING" as const,
    }));

    if (items.length) {
      const { error: itemError } = await context.supabase
        .from("inventory_count_items")
        .insert(items);
      if (itemError) throw new Error(itemError.message);
    }

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "inventory.count.create",
      resource: "inventory_counts",
      resource_id: count.id,
      context: { location_id: data.locationId, items: items.length },
    });

    return { id: count.id, items: items.length };
  });

export const updateInventoryCountItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        countId: z.string().uuid(),
        itemId: z.string().uuid(),
        countedQuantity: z.coerce.number().min(0).max(9_999_999_999.99).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryCount,
      context.userId,
    );

    const { data: item, error } = await context.supabase
      .from("inventory_count_items")
      .select("id, system_quantity")
      .eq("id", data.itemId)
      .eq("inventory_count_id", data.countId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) throw new Error("Item de contagem não encontrado.");

    const systemQuantity = num(item.system_quantity);
    const patch =
      data.countedQuantity == null
        ? {
            counted_quantity: null,
            difference: null,
            status: "PENDING" as const,
            updated_at: new Date().toISOString(),
          }
        : {
            counted_quantity: data.countedQuantity,
            difference: data.countedQuantity - systemQuantity,
            status: "COUNTED" as const,
            updated_at: new Date().toISOString(),
          };

    const { error: updateError } = await context.supabase
      .from("inventory_count_items")
      .update(patch)
      .eq("id", data.itemId)
      .eq("inventory_count_id", data.countId)
      .eq("organization_id", data.organizationId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, difference: patch.difference ?? null };
  });

export const completeInventoryCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), countId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryCount,
      context.userId,
    );

    const { data: result, error } = await context.supabase.rpc("inventory_complete_count", {
      _organization_id: data.organizationId,
      _count_id: data.countId,
    });
    if (error) throw new Error(error.message);
    return result as Json;
  });

export const cancelInventoryCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), countId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.inventoryCount,
      context.userId,
    );

    const { error } = await context.supabase
      .from("inventory_counts")
      .update({ status: "CANCELED" })
      .eq("id", data.countId)
      .eq("organization_id", data.organizationId)
      .in("status", ["DRAFT", "IN_PROGRESS", "REVIEW"]);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "inventory.count.cancel",
      resource: "inventory_counts",
      resource_id: data.countId,
    });

    return { ok: true };
  });
