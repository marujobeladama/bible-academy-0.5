'use client';

export type AuthRateLimitAction = 'login' | 'signup' | 'forgot-password';

/**
 * Chama nosso pre-flight (app/api/auth/rate-limit) antes de qualquer
 * chamada ao Supabase Auth a partir do navegador. Retorna null se pode
 * prosseguir, ou uma mensagem de erro pronta para mostrar ao usuário.
 */
export async function checkAuthRateLimit(action: AuthRateLimitAction, identifier?: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, identifier }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return data.error ?? 'Muitas tentativas. Aguarde antes de tentar novamente.';
    }
    return null;
  } catch {
    return 'Não foi possível verificar a solicitação agora. Tente novamente em instantes.';
  }
}
