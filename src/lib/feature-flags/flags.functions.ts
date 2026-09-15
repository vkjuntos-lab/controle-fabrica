import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const getFeatureFlags = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: flags, error } = await supabaseAdmin
      .from("pdv_feature_flags" as any)
      .select("*")
      .eq("store_id", data.storeId);

    if (error) {
      console.error("Error fetching feature flags:", error);
      return [] as any[];
    }
    return flags as any[];
  });

export const toggleFeature = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ 
    storeId: z.string().uuid(), 
    featureKey: z.string(),
    enabled: z.boolean()
  }).parse(data))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("pdv_feature_flags" as any)
      .upsert({ 
        store_id: data.storeId, 
        feature_key: data.featureKey, 
        is_enabled: data.enabled,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_id,feature_key' } as any);

    if (error) throw new Error(error.message);
    return { success: true };
  });
