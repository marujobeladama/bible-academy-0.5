'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateCourseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100);
    if (!title.trim() || Number.isNaN(priceCents) || priceCents < 0) {
      setError('Preencha um título e um preço válidos.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), price_cents: priceCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível criar o curso.');
        return;
      }
      router.push(`/admin/cursos/${data.course.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="button" onClick={() => setOpen(true)}>
        + Novo curso
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="panel" style={{ padding: 20, margin: '16px 0' }}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="new-title">Título</label>
          <input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
        </div>
        <div className="field">
          <label htmlFor="new-price">Preço (R$)</label>
          <input id="new-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="button" disabled={loading} aria-busy={loading}>{loading ? 'Criando…' : 'Criar curso'}</button>
        <button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        O curso é criado como rascunho (não publicado). Você edita a descrição, imagem e conteúdo em seguida.
      </p>
    </form>
  );
}
