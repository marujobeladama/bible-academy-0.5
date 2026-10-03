import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com a service role key. Ignora RLS por definição — por isso só
 * pode ser usado no servidor, em fluxos que já são intrinsecamente
 * confiáveis (ex.: checkout autenticado e validado no servidor ou um webhook
 * de pagamento cuja assinatura já foi verificada). NUNCA importar este arquivo de um Client Component, e nunca
 * devolver este client (ou dados obtidos com privilégio elevado sem
 * refiltrar) diretamente para o navegador.
 *
 * A env var SUPABASE_SERVICE_ROLE_KEY não tem o prefixo NEXT_PUBLIC_, então
 * o Next.js já impede que ela seja incluída no bundle do cliente por
 * padrão — mas o pacote 'server-only' adiciona uma segunda trava: importar
 * este arquivo de código client-side quebra o build.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada. Necessária para checkout e webhook de pagamentos.'
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
