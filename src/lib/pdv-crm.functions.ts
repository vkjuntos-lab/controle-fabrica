import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Módulo de CRM 360° (Customer Relationship Management)
 */

export type SegmentKey = "all" | "active" | "inactive" | "vip" | "churn_risk" | "new";

export const listSegments = createServerFn({ method: "GET" })
  .handler(async () => {
    return {
      segments: [
        { key: "all" as SegmentKey, label: "Todos", count: 0, description: "Base total de clientes." },
        { key: "active" as SegmentKey, label: "Ativos", count: 0, description: "Compraram nos últimos 30 dias." },
        { key: "vip" as SegmentKey, label: "VIPs", count: 0, description: "Top 5% em receita acumulada." },
      ]
    };
  });

export const listSegmentCustomers = createServerFn({ method: "POST" })
  .inputValidator((d: { key: SegmentKey }) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data }) => {
    console.log("Listing customers for segment:", data.key);
    return { rows: [] as any[] };
  });

const CustomerSegmentSchema = z.object({
  id: z.string().optional(),
  storeId: z.string(),
  name: z.string(),
  criteria: z.object({
    minPurchaseValue: z.number().optional(),
    lastPurchaseDays: z.number().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const saveCustomerSegment = createServerFn({ method: "POST" })
  .inputValidator((data) => CustomerSegmentSchema.parse(data))
  .handler(async ({ data }) => {
    return { success: true, segmentId: data.id || "seg_" + Math.random().toString(36).substr(2, 9) };
  });

export const getCustomerInsight = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ 
    customerId: z.string(),
    storeId: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    return {
      score: 85,
      loyaltyLevel: "Gold",
      churnRisk: "low",
      suggestedProducts: ["Batom Velvet", "Base Matte Pro"],
      nextBestAction: "Enviar cupom de aniversário"
    };
  });

export const logCustomerInteraction = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    customerId: z.string(),
    type: z.enum(["call", "whatsapp", "store_visit", "complaint", "feedback"]),
    description: z.string(),
    metadata: z.any().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    return { success: true };
  });

export const triggerMarketingAutomation = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    customerId: z.string(),
    automationKey: z.enum(["welcome", "abandoned_cart", "re-engagement", "birthday"]),
    channel: z.enum(["whatsapp", "email", "sms"])
  }).parse(data))
  .handler(async ({ data }) => {
    return { status: "queued" };
  });

