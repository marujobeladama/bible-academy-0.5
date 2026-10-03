'use client';

import { useState } from 'react';

export function CompleteLessonButton({
  lessonId,
  initiallyCompleted,
}: {
  lessonId: string;
  initiallyCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(initiallyCompleted);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const next = !completed;
    try {
      const res = await fetch(`/api/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      });
      if (res.ok) setCompleted(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className={`button${completed ? ' secondary' : ''}`} onClick={toggle} disabled={loading} aria-busy={loading}>
      {loading ? 'Salvando progresso…' : completed ? '✓ Aula concluída' : 'Marcar como concluída'}
    </button>
  );
}
