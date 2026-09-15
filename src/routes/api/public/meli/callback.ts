import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/meli/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state'); // storeId

        if (!code || !state) {
          return new Response('Code or State missing', { status: 400 });
        }

        try {
          // 1. Buscar as credenciais no banco usando o state (storeId)
          const { data: cfg, error: fetchError } = await (supabaseAdmin as any)
            .from('marketplace_configs')
            .select('config')
            .eq('store_id', state)
            .eq('provider', 'mercadolivre')
            .single();

          if (fetchError || !cfg?.config?.client_id || !cfg?.config?.client_secret) {
            console.error('Meli Config Error:', fetchError);
            return new Response('Configuration not found for this store', { status: 404 });
          }

          const { client_id, client_secret, redirect_uri } = cfg.config;

          // 2. Trocar code por token
          const tokenResp = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: client_id,
              client_secret: client_secret,
              code: code,
              redirect_uri: redirect_uri
            })
          });

          const tokens = await tokenResp.json();

          if (!tokenResp.ok) {
            console.error('Meli Token Error:', tokens);
            return new Response('Failed to exchange token: ' + JSON.stringify(tokens), { status: 500 });
          }

          // 3. Salvar tokens no banco
          const { error: updateError } = await (supabaseAdmin as any)
            .from('marketplace_configs')
            .update({
              config: {
                ...cfg.config,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_in: tokens.expires_in,
                user_id: tokens.user_id,
                updated_at: new Date().toISOString()
              }
            })
            .eq('store_id', state)
            .eq('provider', 'mercadolivre');

          if (updateError) {
            throw updateError;
          }

          return new Response(`
            <html>
              <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0A0A0A; color: white; text-align: center;">
                <div>
                  <h1 style="color: #00FFFF;">Conectado com Sucesso!</h1>
                  <p>Sua conta do Mercado Livre foi vinculada ao KS MultiMake.</p>
                  <p>Você será redirecionado em instantes...</p>
                  <script>
                    setTimeout(() => {
                      window.location.href = '/pdv/mercado-livre';
                    }, 3000);
                  </script>
                </div>
              </body>
            </html>
          `, { headers: { 'Content-Type': 'text/html' } });

        } catch (error: any) {
          console.error('Meli OAuth Error:', error);
          return new Response('Internal Server Error: ' + error.message, { status: 500 });
        }
      },
    },
  },
});
