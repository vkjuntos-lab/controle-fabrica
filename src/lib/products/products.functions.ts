import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ProductStatus, ProductVariantStatus } from "@/lib/products/constants";
import { PERMISSIONS, type Permission } from "@/lib/rbac";

const productStatusSchema = z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED", "DRAFT"]);
const variantStatusSchema = z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED", "DRAFT"]);
const productCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "Use apenas letras, números, ponto, traço ou sublinhado.");
const ncmSchema = z.string().trim().max(20).nullable().optional();
const priceSchema = z.coerce.number().nonnegative().max(9_999_999_999.99).optional();
const weightSchema = z.coerce.number().nonnegative().max(9_999_999).optional();

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Checagem de permissão server-side (defesa em profundidade).
 * RLS já impõe a política; aqui garantimos que a permissão declarada existe,
 * mesmo que uma política futura fique mais permissiva.
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

export type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  product_count: number;
  created_at: string;
};

export type ProductListItem = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  category_name: string | null;
  status: ProductStatus;
  main_image_url: string | null;
  variant_count: number;
  created_at: string;
};

export type ProductVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  cost_price: number | null;
  sell_price: number | null;
  weight_grams: number | null;
  status: ProductVariantStatus;
  attributes: Json;
  created_at: string;
  updated_at: string;
};

export type ProductDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  brand: string | null;
  ncm: string | null;
  status: ProductStatus;
  main_image_url: string | null;
  category_id: string | null;
  category: { id: string; name: string } | null;
  attributes: Json;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  variants: ProductVariant[];
};

export type ProductListResult = {
  rows: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

function toCategory(child: unknown): { id: string; name: string } | null {
  if (!child || !Array.isArray(child)) return null;
  const first = child[0];
  if (!first || typeof first !== "object") return null;
  const row = first as { id?: string; name?: string };
  return row.id && row.name ? { id: row.id, name: row.name } : null;
}

/** Lista paginada do catálogo com busca e filtro de status. */
export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        query: z.string().trim().max(120).optional(),
        status: productStatusSchema.optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.productsRead,
      context.userId,
    );

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let builder = context.supabase
      .from("products")
      .select(
        "id, code, name, brand, category_id, status, main_image_url, created_at, product_categories(id, name), product_variants(id)",
        { count: "exact" },
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.query) {
      const like = `%${data.query}%`;
      builder = builder.or(`code.ilike.${like},name.ilike.${like},brand.ilike.${like}`);
    }
    if (data.status) {
      builder = builder.eq("status", data.status);
    }

    const { data: rows, count, error } = await builder;
    if (error) throw new Error(error.message);

    const items: ProductListItem[] = (rows ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      brand: row.brand,
      category_name: toCategory(row.product_categories)?.name ?? null,
      status: row.status,
      main_image_url: row.main_image_url,
      variant_count: row.product_variants?.length ?? 0,
      created_at: row.created_at,
    }));

    return {
      rows: items,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/** Detalhe do produto com categoria e todas as variantes. */
export const getProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), productId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.productsRead,
      context.userId,
    );

    const { data: row, error } = await context.supabase
      .from("products")
      .select("*, product_categories(id, name), product_variants(*)")
      .eq("id", data.productId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Produto não encontrado.");

    const variants: ProductVariant[] = (row.product_variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      size: v.size,
      color: v.color,
      cost_price: v.cost_price == null ? null : Number(v.cost_price),
      sell_price: v.sell_price == null ? null : Number(v.sell_price),
      weight_grams: v.weight_grams == null ? null : Number(v.weight_grams),
      status: v.status,
      attributes: v.attributes,
      created_at: v.created_at,
      updated_at: v.updated_at,
    }));

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      brand: row.brand,
      ncm: row.ncm,
      status: row.status,
      main_image_url: row.main_image_url,
      category_id: row.category_id,
      category: toCategory(row.product_categories),
      attributes: row.attributes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by: row.created_by,
      updated_by: row.updated_by,
      variants,
    } satisfies ProductDetail;
  });

/** Cria um produto (modelo). As variantes são criadas à parte. */
export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        code: productCodeSchema,
        name: z.string().trim().min(2).max(180),
        description: z.string().trim().max(4000).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        brand: z.string().trim().max(120).optional(),
        ncm: ncmSchema,
        status: productStatusSchema.default("DRAFT"),
        mainImageUrl: z.string().trim().max(1024).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.productsManage,
      context.userId,
    );

    const { data: created, error } = await context.supabase
      .from("products")
      .insert({
        organization_id: data.organizationId,
        code: data.code,
        name: data.name,
        description: emptyToNull(data.description),
        category_id: data.categoryId ?? null,
        brand: emptyToNull(data.brand),
        ncm: emptyToNull(data.ncm),
        status: data.status,
        main_image_url: emptyToNull(data.mainImageUrl),
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, code, name, status")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "product.create",
      resource: "products",
      resource_id: created.id,
      context: { code: created.code },
    });

    return created;
  });

/** Atualiza os dados gerais de um produto. */
export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        productId: z.string().uuid(),
        name: z.string().trim().min(2).max(180),
        description: z.string().trim().max(4000).nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        brand: z.string().trim().max(120).nullable().optional(),
        ncm: ncmSchema,
        mainImageUrl: z.string().trim().max(1024).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.productsManage,
      context.userId,
    );

    const { error } = await context.supabase
      .from("products")
      .update({
        name: data.name,
        description: emptyToNull(data.description),
        category_id: data.categoryId ?? null,
        brand: emptyToNull(data.brand),
        ncm: emptyToNull(data.ncm),
        main_image_url: emptyToNull(data.mainImageUrl),
        updated_by: context.userId,
      })
      .eq("id", data.productId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "product.update",
      resource: "products",
      resource_id: data.productId,
    });

    return { ok: true };
  });

/** Troca o status do produto. Ativar, inativar ou descontinuar — nunca apagar histórico. */
export const setProductStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        productId: z.string().uuid(),
        status: productStatusSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.productsManage,
      context.userId,
    );

    const { error } = await context.supabase
      .from("products")
      .update({ status: data.status, updated_by: context.userId })
      .eq("id", data.productId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "product.status",
      resource: "products",
      resource_id: data.productId,
      context: { status: data.status },
    });

    return { ok: true };
  });

/** Exclui um produto somente quando ele não possui variantes referenciadas. */
export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid(), productId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireOrgPermission(
      context.supabase,
      data.organizationId,
      PERMISSIONS.productsManage,
      context.userId,
    );

    const { data: refs, error: refsError } = await context.supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", data.productId)
      .eq("organization_id", data.organizationId)
      .limit(1);
    if (refsError) throw new Error(refsError.message);
    if (refs?.length) {
      throw new Error(
        "Este produto possui variantes e não pode ser excluído. Use o status Descontinuado para retirá-lo de linha.",
      );
    }

    const { error } = await context.supabase
      .from("products")
      .delete()
      .eq("id", data.productId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      organization_id: data.organizationId,
      user_id: context.userId,
      action: "product.delete",
      resource: "products",
      resource_id: data.productId,
    });

    return { ok: true };
  });