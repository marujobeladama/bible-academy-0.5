'use client';

import { useState } from 'react';
import { createLiveClass, deleteLiveClass, updateLiveClassStatus } from '@/app/actions/live-classes';
import { formatLiveClassStatus } from '@/lib/live-classes';

interface LiveClassRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: 'scheduled' | 'live' | 'ended';
}

export function LiveClassManager({ courseId, initialLiveClasses }: { courseId: string; initialLiveClasses: LiveClassRow[] }) {
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [liveClasses, setLiveClasses] = useState(initialLiveClasses);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setMessage(null);

    const result = await createLiveClass(courseId, formData);
    setPending(false);

    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    if (result.ok && result.liveClass) {
      setLiveClasses((current) => [result.liveClass, ...current]);
      setMessage({ type: 'ok', text: 'Live criada com sucesso.' });
      form.reset();
    }
  }

  async function handleStatusChange(liveClassId: string, status: 'scheduled' | 'live' | 'ended') {
    const result = await updateLiveClassStatus(liveClassId, status);
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    setLiveClasses((current) =>
      current.map((liveClass) => (liveClass.id === liveClassId ? { ...liveClass, status } : liveClass)),
    );
    setMessage({ type: 'ok', text: 'Status da live atualizado.' });
  }

  async function handleDelete(liveClassId: string) {
    const result = await deleteLiveClass(liveClassId);
    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    setLiveClasses((current) => current.filter((liveClass) => liveClass.id !== liveClassId));
    setMessage({ type: 'ok', text: 'Live removida.' });
  }

  return (
    <section className="panel">
      <div className="course-section-heading">
        <div>
          <div className="eyebrow">Aulas ao vivo</div>
          <h2>Agenda e acesso</h2>
        </div>
      </div>

      <form onSubmit={handleCreate} className="stack gap-md">
        <div className="field-row">
          <div className="field">
            <label htmlFor="live-title">Título</label>
            <input id="live-title" name="title" required minLength={3} maxLength={150} />
          </div>
          <div className="field">
            <label htmlFor="live-status">Status</label>
            <select id="live-status" name="status" defaultValue="scheduled">
              <option value="scheduled">Agendada</option>
              <option value="live">Ao vivo</option>
              <option value="ended">Encerrada</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="live-description">Descrição</label>
          <textarea id="live-description" name="description" rows={3} maxLength={2000} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="live-start">Início</label>
            <input id="live-start" name="starts_at" type="datetime-local" required />
          </div>
          <div className="field">
            <label htmlFor="live-end">Término</label>
            <input id="live-end" name="ends_at" type="datetime-local" />
          </div>
        </div>

        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar live'}
        </button>
      </form>

      {message && (
        <p role={message.type === 'error' ? 'alert' : undefined} className={message.type === 'ok' ? 'muted' : undefined}>
          {message.text}
        </p>
      )}

      <div className="stack gap-md" style={{ marginTop: 20 }}>
        {liveClasses.length === 0 ? (
          <p className="muted">Nenhuma live agendada para este curso.</p>
        ) : (
          liveClasses.map((liveClass) => (
            <div key={liveClass.id} className="card">
              <div className="course-section-heading">
                <div>
                  <div className="eyebrow">{formatLiveClassStatus(liveClass.status)}</div>
                  <h3>{liveClass.title}</h3>
                </div>
              </div>

              <p className="muted">{liveClass.description || 'Sem descrição.'}</p>
              <p className="muted">
                {new Date(liveClass.starts_at).toLocaleString('pt-BR')} {liveClass.ends_at ? `· até ${new Date(liveClass.ends_at).toLocaleString('pt-BR')}` : ''}
              </p>

              <div className="field-row" style={{ marginTop: 12 }}>
                <select
                  defaultValue={liveClass.status}
                  onChange={(event) => handleStatusChange(liveClass.id, event.target.value as 'scheduled' | 'live' | 'ended')}
                >
                  <option value="scheduled">Agendada</option>
                  <option value="live">Ao vivo</option>
                  <option value="ended">Encerrada</option>
                </select>
                <button type="button" className="button secondary" onClick={() => handleDelete(liveClass.id)}>
                  Remover
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
