'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { signupSchema } from '@/lib/validation';
import { checkAuthRateLimit } from '@/lib/auth-rate-limit-client';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const parsed = signupSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError('Verifique os dados: nome (mín. 2), e-mail válido e senha com pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);

    const rateLimitError = await checkAuthRateLimit('signup', parsed.data.email);
    if (rateLimitError) {
      setError(rateLimitError);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowser();
    // Observação de segurança: "name" vai em user_metadata apenas para exibição.
    // O papel (role) do usuário NUNCA é definido aqui — é sempre 'student' por
    // padrão no banco (trigger handle_new_user), e só um admin pode alterar isso.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { name: parsed.data.name },
        emailRedirectTo: `${appUrl}/auth/confirm?next=/dashboard`,
      },
    });

    if (signUpError) {
      // Mensagem genérica: não revela se o e-mail já existe (evita enumeração).
      setError('Não foi possível concluir o cadastro. Tente novamente em instantes.');
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <main className="auth">
        <div className="auth-card">
          <Link className="brand" href="/">
            Bible <span>Academy</span>
          </Link>
          <h1>Confirme seu e-mail</h1>
          <p className="muted">
            Enviamos um link de confirmação para o e-mail informado. Abra sua caixa de entrada para
            concluir o cadastro.
          </p>
          <p className="muted" style={{ fontSize: 13, marginTop: 20, textAlign: 'center' }}>
            <Link href="/">Voltar ao site</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <Link className="brand" href="/">
          Bible <span>Academy</span>
        </Link>
        <h1>Criar conta</h1>
        <p className="muted">Comece seus estudos bíblicos hoje.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input id="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert">{error}</p>}
          <button className="button" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
            {loading ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 12, textAlign: 'center' }}>
          <Link href="/">Voltar ao site</Link>
        </p>
      </div>
    </main>
  );
}
