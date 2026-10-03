'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { forgotPasswordSchema } from '@/lib/validation';
import { checkAuthRateLimit } from '@/lib/auth-rate-limit-client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);

    const rateLimitError = await checkAuthRateLimit('forgot-password', parsed.data.email);
    if (rateLimitError) {
      setError(rateLimitError);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowser();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${appUrl}/auth/confirm?next=/reset-password`,
    });
    // Sempre mostramos a mesma mensagem de sucesso, exista ou não o e-mail
    // na base — isso evita enumeração de usuários via este formulário.
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <Link className="brand" href="/">
          Bible <span>Academy</span>
        </Link>
        <h1>Recuperar senha</h1>
        {sent ? (
          <p className="muted">
            Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira sua
            caixa de entrada.
          </p>
        ) : (
          <>
            <p className="muted">Informe seu e-mail para receber o link de redefinição.</p>
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p role="alert">{error}</p>}
              <button className="button" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>
          </>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          <Link href="/login">Voltar ao login</Link>
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 12, textAlign: 'center' }}>
          <Link href="/">Voltar ao site</Link>
        </p>
      </div>
    </main>
  );
}
