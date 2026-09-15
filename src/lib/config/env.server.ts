import { z } from 'zod';

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Add other server-side env vars here
});

export const getServerEnv = () => {
  return serverEnvSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    META_APP_SECRET: process.env['META_APP_SECRET'],
    GEMINI_API_KEY: process.env['GEMINI_API_KEY'],
  });
};
