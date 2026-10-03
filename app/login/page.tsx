'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { loginSchema } from '@/lib/validation';
import { checkAuthRateLimit } from '@/lib/auth-rate-limit-client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const linkError = searchParams.get('error');
  const linkErrorMessage =
    linkError === 'email_nao_confirmado'
      ? 'Confirme seu e-mail antes de acessar a plataforma.'
      : 'O link usado expirou ou é inválido. Tente novamente.';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Informe e-mail e senha válidos.');
      return;
    }
    setLoading(true);

    const rateLimitError = await checkAuthRateLimit('login', parsed.data.email);
    if (rateLimitError) {
      setError(rateLimitError);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    if (signInError) {
      // Mensagem genérica: não revela se o problema foi e-mail inexistente
      // ou senha errada (evita enumeração de usuários).
      setError('Não foi possível entrar. Verifique seus dados.');
      setLoading(false);
      return;
    }
    const resolvedNext =
      next && next.startsWith('/')
        ? next
        : '/dashboard';
    const destination = resolvedNext === '/admin' ? '/admin/cursos' : resolvedNext;
    router.push(destination);
    router.refresh();
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <Link className="brand" href="/">
          Bible <span>Academy</span>
        </Link>
        <h1>Entrar</h1>
        <p className="muted">Acesse seus cursos e continue seus estudos.</p>
        {linkError && <p role="alert">{linkErrorMessage}</p>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert">{error}</p>}
          <button className="button" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="muted" style={{ fontSize: 13, marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
          <Link href="/signup">Criar conta</Link>
          <Link href="/forgot-password">Esqueci minha senha</Link>
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 12, textAlign: 'center' }}>
          <Link href="/">Voltar ao site</Link>
        </p>
      </div>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
