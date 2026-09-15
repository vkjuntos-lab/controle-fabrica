import { createFileRoute } from '@tanstack/react-router';
import { getMarketplaceDriver } from '@/lib/marketplaces/registry.server';

export const Route = createFileRoute('/api/public/meli/notifications')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json();
          const { resource, user_id, topic } = payload;
          
          console.log(`[Meli Webhook] ${topic}: ${resource} (user: ${user_id})`);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: cfg } = await (supabaseAdmin as any)
            .from("marketplace_configs")
            .select("store_id")
            .eq("provider", "mercadolivre")
            .filter('config->>user_id', 'eq', String(user_id))
            .maybeSingle();

          if (!cfg?.store_id) {
            console.warn(`[Meli Webhook] No store found for user_id ${user_id}`);
            return new Response('Store not found', { status: 200 });
          }

          if (topic === 'orders') {
            const driver = await getMarketplaceDriver('mercadolivre', cfg.store_id);
            const orderId = resource.split('/').pop();
            // Aqui dispararíamos a fila de sync ou processaríamos o pedido
            console.log(`[Meli Webhook] Order update: ${orderId} for store ${cfg.store_id}`);
          }

          return new Response('OK', { status: 200 });
        } catch (error) {
          console.error('Meli Webhook error:', error);
          return new Response('Error', { status: 500 });
        }
      },
    },
  },
});
