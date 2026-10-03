'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { resetPasswordSchema } from '@/lib/validation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    // O link de recuperação já deixa uma sessão temporária ativa (trocada
    // pelo route handler /auth/confirm). Só confirmamos que ela existe antes
    // de mostrar o formulário — sem isso, alguém sem o link não consegue
    // trocar a senha de ninguém.
    const supabase = getSupabaseBrowser();
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setHasRecoverySession(!!data.user);
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (updateError) {
      setError('Não foi possível atualizar a senha. Solicite um novo link de recuperação.');
    } else {
      setDone(true);
    }
    setLoading(false);
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <Link className="brand" href="/">
          Bible <span>Academy</span>
        </Link>
        <h1>Definir nova senha</h1>
        {done ? (
          <>
            <p className="muted">Senha atualizada com sucesso.</p>
            <Link className="button" href="/dashboard" style={{ marginTop: 16, display: 'inline-flex' }}>
              Ir para o painel
            </Link>
          </>
        ) : hasRecoverySession === false ? (
          <p className="muted">
            Este link expirou ou é inválido. <Link href="/forgot-password">Solicite um novo</Link>.
          </p>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="password">Nova senha</label>
              <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirmar senha</label>
              <input id="confirm" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert">{error}</p>}
            <button className="button" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
              {loading ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 20, textAlign: 'center' }}>
          <Link href="/">Voltar ao site</Link>
        </p>
      </div>
    </main>
  );
}
