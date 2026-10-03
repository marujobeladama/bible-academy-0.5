'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  published: boolean;
}

export function LessonEditForm({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description ?? '');
  const [duration, setDuration] = useState(lesson.duration_seconds ? Math.round(lesson.duration_seconds / 60).toString() : '');
  const [published, setPublished] = useState(lesson.published);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          duration_seconds: duration ? Number(duration) * 60 : null,
          published,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Não foi possível salvar.' });
        return;
      }
      setMessage({ type: 'ok', text: 'Aula atualizada.' });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="field">
        <label htmlFor="title">Título</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
      </div>
      <div className="field">
        <label htmlFor="description">Descrição</label>
        <textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="duration">Duração (minutos)</label>
        <input id="duration" value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" style={{ maxWidth: 160 }} />
      </div>
      <div className="field-check">
        <input id="published" type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        <label htmlFor="published" style={{ margin: 0 }}>Aula publicada</label>
      </div>
      {message && <p role={message.type === 'error' ? 'alert' : undefined} className={message.type === 'ok' ? 'muted' : undefined}>{message.text}</p>}
      <button className="button" disabled={saving} aria-busy={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
    </form>
  );
}
