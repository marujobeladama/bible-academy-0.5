'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  student_name: string;
}

export function ReviewModeration({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function remove(reviewId: string) {
    if (!confirm('Excluir esta avaliação? Esta ação não pode ser desfeita.')) return;
    setBusyId(reviewId);
    setError('');
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Não foi possível excluir a avaliação.');
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (reviews.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>Nenhuma avaliação ainda.</p>;
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Nota</th>
              <th>Comentário</th>
              <th>Data</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review.id}>
                <td>{review.student_name}</td>
                <td>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</td>
                <td className="muted" style={{ maxWidth: 320 }}>{review.comment || '—'}</td>
                <td className="muted">{formatDate(review.created_at)}</td>
                <td>
                  <button
                    className="button small danger"
                    onClick={() => remove(review.id)}
                    disabled={busyId === review.id}
                    aria-busy={busyId === review.id}
                  >
                    {busyId === review.id ? 'Excluindo…' : 'Excluir'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
