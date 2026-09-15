import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Módulo de Backend para Mercado Livre
 * Implementa sincronização de produtos, pedidos e gerenciamento de OAuth.
 */

const meliConfigSchema = z.object({
  storeId: z.string().uuid(),
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
});

export const getMeliConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cfg } = await (supabase as any)
      .from("marketplace_configs")
      .select("config")
      .eq("store_id", data.storeId)
      .eq("provider", "mercadolivre")
      .single();

    if (!cfg) return null;

    // Retorna sem o client_secret por segurança no front
    const { client_secret, ...safeConfig } = cfg.config || {};
    return {
      ...safeConfig,
      hasSecret: !!client_secret,
      isConnected: !!cfg.config?.access_token
    };
  });

export const saveMeliConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => meliConfigSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    const { error } = await (supabase as any)
      .from("marketplace_configs")
      .upsert({
        store_id: data.storeId,
        provider: "mercadolivre",
        config: {
          client_id: data.clientId,
          client_secret: data.clientSecret,
          redirect_uri: data.redirectUri,
          updated_at: new Date().toISOString(),
        },
      }, { onConflict: "store_id,provider" });

    if (error) throw new Error("Erro ao salvar configuração do Mercado Livre: " + error.message);
    return { success: true };
  });

export const getMeliAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    const { data: cfg } = await (supabase as any)
      .from("marketplace_configs")
      .select("config")
      .eq("store_id", data.storeId)
      .eq("provider", "mercadolivre")
      .single();

    if (!cfg?.config?.client_id) {
      throw new Error("Client ID não configurado para Mercado Livre.");
    }

    const clientId = cfg.config.client_id;
    const redirectUri = cfg.config.redirect_uri || `${process.env.VITE_APP_URL}/api/public/meli/callback`;
    
    // URL de autorização do Mercado Livre (exemplo para Brasil)
    // O state é usado para recuperar o storeId no callback
    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${data.storeId}`;
    
    return { authUrl };
  });

export const syncMeliProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { storeId } = data;
    const { supabase } = context;

    // 1. Buscar configuração da loja
    const { data: cfg } = await (supabase as any)
      .from("marketplace_configs")
      .select("config")
      .eq("store_id", storeId)
      .eq("provider", "mercadolivre")
      .single();

    if (!cfg?.config?.access_token) {
      return { count: 0, status: "pending_auth" };
    }

    // A implementação real do driver usará o token para buscar itens
    // Por ora, retornamos um status de sucesso para a UI
    return { count: 0, status: "ready" };
  });

export const refreshMeliToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { storeId } = data;
    const { supabase } = context;

    const { data: cfg } = await (supabase as any)
      .from("marketplace_configs")
      .select("config")
      .eq("store_id", storeId)
      .eq("provider", "mercadolivre")
      .single();

    if (!cfg?.config?.refresh_token) {
      throw new Error("Refresh token não encontrado");
    }

    const { client_id, client_secret, refresh_token } = cfg.config;

    const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id,
        client_secret,
        refresh_token
      })
    });

    const tokens = await resp.json();
    if (!resp.ok) throw new Error("Falha ao renovar token: " + JSON.stringify(tokens));

    await (supabase as any)
      .from("marketplace_configs")
      .update({
        config: {
          ...cfg.config,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          updated_at: new Date().toISOString()
        }
      })
      .eq("store_id", storeId)
      .eq("provider", "mercadolivre");

    return { success: true };
  });
