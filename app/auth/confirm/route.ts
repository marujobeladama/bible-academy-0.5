import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase-server';

/**
 * Endpoint chamado pelo link enviado por e-mail (confirmação de cadastro ou
 * recuperação de senha). Troca o token_hash por uma sessão real no servidor
 * e redireciona. Nunca expomos o token em uma URL client-side além deste
 * primeiro request.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || origin;

  if (code) {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const safeNext = next.startsWith('/') ? next : '/dashboard';
      return NextResponse.redirect(new URL(safeNext, appOrigin));
    }
  } else if (token_hash && type) {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const safeNext = next.startsWith('/') ? next : '/dashboard';
      return NextResponse.redirect(new URL(safeNext, appOrigin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=link_invalido', appOrigin));
}
