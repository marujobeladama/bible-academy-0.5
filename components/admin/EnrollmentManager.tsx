'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Course {
  id: string;
  title: string;
}

interface Enrollment {
  course_id: string;
  title: string;
  source: string;
  created_at: string;
}

export function EnrollmentManager({
  userId,
  enrollments,
  availableCourses,
}: {
  userId: string;
  enrollments: Enrollment[];
  availableCourses: Course[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(availableCourses[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enroll() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/students/${userId}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível conceder a matrícula.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(courseId: string) {
    if (!confirm('Remover o acesso deste aluno a este curso?')) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/students/${userId}/enrollments/${courseId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Curso</th>
              <th>Origem</th>
              <th>Desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.course_id}>
                <td>{e.title}</td>
                <td><span className="badge neutral">{e.source === 'payment' ? 'Pagamento' : 'Manual'}</span></td>
                <td className="muted">{new Date(e.created_at).toLocaleDateString('pt-BR')}</td>
                <td>
                  <button className="button small danger" onClick={() => revoke(e.course_id)} disabled={busy} aria-busy={busy}>Remover</button>
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">Nenhuma matrícula ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {availableCourses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
            {availableCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button className="button small" onClick={enroll} disabled={busy} aria-busy={busy}>Conceder matrícula</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Conceder matrícula aqui é uma liberação manual (cortesia/administrativa). Matrículas pagas são criadas
        automaticamente pelo backend após confirmação do gateway de pagamento.
      </p>
    </div>
  );
}
