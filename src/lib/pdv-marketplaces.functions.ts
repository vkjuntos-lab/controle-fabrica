// Onda S — Server functions para marketplaces (stubs plugáveis).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMarketplaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listMarketplaceProviders } = await import("./marketplaces/registry.server");
    return listMarketplaceProviders();
  });

export const pingMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: string; store_id?: string }) => 
    z.object({ provider: z.string(), store_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { getMarketplaceDriver } = await import("./marketplaces/registry.server");
    const drv = await getMarketplaceDriver(data.provider as any, data.store_id);
    return drv.ping();
  });
