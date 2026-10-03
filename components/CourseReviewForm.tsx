'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type CourseReviewFormProps = {
  courseId: string;
  initialRating?: number | null;
  initialComment?: string | null;
};

export function CourseReviewForm({ courseId, initialRating = null, initialComment = '' }: CourseReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(initialRating ?? 0);
  const [comment, setComment] = useState(initialComment ?? '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function removeReview() {
    if (!confirm('Excluir sua avaliação deste curso?')) return;
    setError('');
    setStatus('');
    setDeleting(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/review`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? 'Não foi possível excluir sua avaliação.');
        return;
      }
      setRating(0);
      setComment('');
      setDeleted(true);
      router.refresh();
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setStatus('');
    if (rating < 1 || rating > 5) {
      setError('Escolha uma nota de 1 a 5.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? 'Não foi possível salvar sua avaliação.');
        return;
      }
      setStatus('Obrigado. Sua avaliação foi salva.');
      router.refresh();
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="course-review-form" onSubmit={submit}>
      <fieldset className="course-review-rating">
        <legend>Sua nota</legend>
        <div role="radiogroup" aria-label="Nota do curso">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? 'estrela' : 'estrelas'}`}
              className={rating >= value ? 'selected' : ''}
              onClick={() => setRating(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="course-review-comment">Comentário (opcional)</label>
        <textarea
          id="course-review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="O que foi mais útil no curso?"
        />
      </div>
      {error && <p className="course-review-message error" role="alert">{error}</p>}
      {status && <p className="course-review-message" role="status">{status}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="button" type="submit" disabled={saving} aria-busy={saving}>
          {saving ? 'Salvando…' : initialRating ? 'Atualizar avaliação' : 'Enviar avaliação'}
        </button>
        {initialRating && !deleted && (
          <button
            type="button"
            className="button secondary"
            onClick={removeReview}
            disabled={deleting}
            aria-busy={deleting}
          >
            {deleting ? 'Excluindo…' : 'Excluir minha avaliação'}
          </button>
        )}
      </div>
    </form>
  );
}