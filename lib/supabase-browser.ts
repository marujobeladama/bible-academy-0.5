'use client';

import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Retorna um client Supabase para uso em Client Components.
 * Reaproveita a mesma instância entre chamadas (evita recriar sockets/listeners).
 * Usa sempre a chave publicável (anon) — nunca a service role.
 */
export function getSupabaseBrowser() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }
  return client;
}
