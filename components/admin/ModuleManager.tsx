'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AssessmentManager } from '@/components/admin/AssessmentManager';

interface Lesson {
  id: string;
  title: string;
  position: number;
  published: boolean;
}

interface Module {
  id: string;
  title: string;
  position: number;
  published: boolean;
  lessons: Lesson[];
}

export function ModuleManager({ courseId, initialModules }: { courseId: string; initialModules: Module[] }) {
  const router = useRouter();
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const modules = initialModules.slice().sort((a, b) => a.position - b.position);

  async function createModule() {
    if (!newModuleTitle.trim()) return;
    setBusy('new-module');
    setError('');
    try {
      const res = await fetch(`/api/courses/${courseId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newModuleTitle.trim(), position: modules.length }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Não foi possível criar o módulo.');
        return;
      }
      setNewModuleTitle('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggleModulePublish(mod: Module) {
    setBusy(mod.id);
    try {
      await fetch(`/api/modules/${mod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !mod.published }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function moveModule(mod: Module, direction: -1 | 1) {
    const idx = modules.findIndex((m) => m.id === mod.id);
    const swapWith = modules[idx + direction];
    if (!swapWith) return;
    setBusy(mod.id);
    try {
      await Promise.all([
        fetch(`/api/modules/${mod.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: swapWith.position }),
        }),
        fetch(`/api/modules/${swapWith.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: mod.position }),
        }),
      ]);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteModule(mod: Module) {
    if (!confirm(`Excluir o módulo "${mod.title}" e todas as suas aulas?`)) return;
    setBusy(mod.id);
    try {
      await fetch(`/api/modules/${mod.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function createLesson(mod: Module) {
    const title = newLessonTitle[mod.id]?.trim();
    if (!title) return;
    setBusy(`new-lesson-${mod.id}`);
    try {
      const res = await fetch(`/api/modules/${mod.id}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, position: mod.lessons.length }),
      });
      if (res.ok) {
        setNewLessonTitle((prev) => ({ ...prev, [mod.id]: '' }));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function moveLesson(mod: Module, lesson: Lesson, direction: -1 | 1) {
    const sorted = mod.lessons.slice().sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((l) => l.id === lesson.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    setBusy(lesson.id);
    try {
      await Promise.all([
        fetch(`/api/lessons/${lesson.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: swapWith.position }),
        }),
        fetch(`/api/lessons/${swapWith.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: lesson.position }),
        }),
      ]);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggleLessonPublish(lesson: Lesson) {
    setBusy(lesson.id);
    try {
      await fetch(`/api/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !lesson.published }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteLesson(lesson: Lesson) {
    if (!confirm(`Excluir a aula "${lesson.title}"? Vídeo e materiais associados também serão removidos.`)) return;
    setBusy(lesson.id);
    try {
      await fetch(`/api/lessons/${lesson.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <p role="alert" className="course-manager-error">{error}</p>}
      {modules.map((mod, idx) => (
        <article key={mod.id} className="module-editor-card">
          <div className="toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong>{mod.title}</strong>
              <span className={`badge ${mod.published ? 'success' : 'neutral'}`}>{mod.published ? 'Publicado' : 'Rascunho'}</span>
            </div>
            <div className="module-actions">
              <button className="button small secondary" onClick={() => moveModule(mod, -1)} disabled={idx === 0 || busy === mod.id} aria-busy={busy === mod.id} aria-label={`Mover módulo ${mod.title} para cima`} title="Mover para cima">↑</button>
              <button className="button small secondary" onClick={() => moveModule(mod, 1)} disabled={idx === modules.length - 1 || busy === mod.id} aria-busy={busy === mod.id} aria-label={`Mover módulo ${mod.title} para baixo`} title="Mover para baixo">↓</button>
              <button className="button small secondary" onClick={() => toggleModulePublish(mod)} disabled={busy === mod.id} aria-busy={busy === mod.id}>
                {mod.published ? 'Despublicar' : 'Publicar'}
              </button>
              <button className="button small danger" onClick={() => deleteModule(mod)} disabled={busy === mod.id} aria-busy={busy === mod.id}>Excluir</button>
            </div>
          </div>

          <div className="lesson-list">
            {mod.lessons
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((lesson, lidx, sortedLessons) => (
                <div className="lesson-row" key={lesson.id}>
                  <Link className="lesson-title-link" href={`/admin/cursos/${courseId}/aulas/${lesson.id}`}>{lesson.title}</Link>
                  <div className="lesson-actions">
                    <span className={`badge ${lesson.published ? 'success' : 'neutral'}`}>{lesson.published ? 'Publicada' : 'Rascunho'}</span>
                    <button className="button small secondary" onClick={() => moveLesson(mod, lesson, -1)} disabled={lidx === 0 || busy === lesson.id} aria-busy={busy === lesson.id} aria-label={`Mover aula ${lesson.title} para cima`} title="Mover para cima">↑</button>
                    <button className="button small secondary" onClick={() => moveLesson(mod, lesson, 1)} disabled={lidx === sortedLessons.length - 1 || busy === lesson.id} aria-busy={busy === lesson.id} aria-label={`Mover aula ${lesson.title} para baixo`} title="Mover para baixo">↓</button>
                    <button className="button small secondary" onClick={() => toggleLessonPublish(lesson)} disabled={busy === lesson.id} aria-busy={busy === lesson.id}>
                      {lesson.published ? 'Despublicar' : 'Publicar'}
                    </button>
                    <button className="button small danger" onClick={() => deleteLesson(lesson)} disabled={busy === lesson.id} aria-busy={busy === lesson.id}>Excluir</button>
                  </div>
                </div>
              ))}
            {mod.lessons.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nenhuma aula neste módulo ainda.</p>}
          </div>

          <div className="lesson-create-row">
            <input
              aria-label={`Título da nova aula no módulo ${mod.title}`}
              placeholder="Título da nova aula"
              value={newLessonTitle[mod.id] ?? ''}
              onChange={(e) => setNewLessonTitle((prev) => ({ ...prev, [mod.id]: e.target.value }))}
              style={{ flex: 1, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}
            />
            <button className="button small" onClick={() => createLesson(mod)} disabled={busy === `new-lesson-${mod.id}`} aria-busy={busy === `new-lesson-${mod.id}`}>
              + Aula
            </button>
          </div>
          <AssessmentManager moduleId={mod.id} />
        </article>
      ))}

      <div className="module-create-row">
        <input
          aria-label="Título do novo módulo"
          placeholder="Título do novo módulo"
          value={newModuleTitle}
          onChange={(e) => setNewModuleTitle(e.target.value)}
          style={{ flex: 1, padding: 12, border: '1px solid var(--line)', borderRadius: 12 }}
        />
        <button className="button" onClick={createModule} disabled={busy === 'new-module'} aria-busy={busy === 'new-module'}>
          + Módulo
        </button>
      </div>
    </div>
  );
}
