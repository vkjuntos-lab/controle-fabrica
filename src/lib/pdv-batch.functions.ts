import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getBatchLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batch_id: string }) =>
    z.object({ batch_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { data: rows, error } = await supabase
      .from("batch_item_logs")
      .select("*")
      .eq("batch_id", data.batch_id)
      .order("created_at", { ascending: false });
    
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });

export const scheduleBatchReprocess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batch_id: string }) =>
    z.object({ batch_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    
    // Reset batch status and error messages
    const { error: batchErr } = await supabase
      .from("product_batches")
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq("id", data.batch_id);

    if (batchErr) throw new Error(batchErr.message);

    const { error: itemsErr } = await supabase
      .from("batch_items")
      .update({ 
        status: 'idle', 
        error_message: null,
        updated_at: new Date().toISOString() 
      })
      .eq("batch_id", data.batch_id)
      .eq("status", "error");

    return { success: true };
  });




export const cancelBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batch_id: string; reason: string }) =>
    z.object({ batch_id: z.string().uuid(), reason: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase as any;
    const { error } = await supabase.rpc('cancel_product_batch', {
      p_batch_id: data.batch_id,
      p_reason: data.reason
    });
    if (error) throw new Error(error.message);
    return { success: true };
  });
