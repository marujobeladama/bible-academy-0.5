'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BuyButton({ courseId, isLoggedIn }: { courseId: string; isLoggedIn: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function buy() {
    if (!isLoggedIn) {
      router.push(`/login?next=/cursos/${courseId}`);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Não foi possível iniciar a compra.');
        return;
      }
      if (data.configured) {
        window.location.href = data.checkout_url;
      } else {
        setMessage(data.message ?? 'A compra ainda não está disponível. Fale com o administrador.');
      }
    } catch {
      setMessage('Não foi possível conectar ao checkout. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="button" onClick={buy} disabled={loading} aria-busy={loading}>
        {loading ? 'Processando…' : 'Comprar curso'}
      </button>
      {message && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{message}</p>}
    </div>
  );
}
