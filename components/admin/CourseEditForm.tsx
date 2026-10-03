'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Course {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  published: boolean;
  image_url: string | null;
  teacher_id: string | null;
}

interface TeacherOption {
  id: string;
  name: string | null;
  email: string | null;
}

/**
 * Campos de nível de curso (preço, publicação, imagem, exclusão, professor
 * responsável) são exclusivos de admin — decisão de arquitetura da
 * migration 0007 (um teacher gerencia CONTEÚDO do curso atribuído, não o
 * curso em si). Quando `readOnly` (teacher visualizando), o formulário
 * mostra os valores atuais só como contexto, sem permitir salvar.
 */
export function CourseEditForm({
  course,
  readOnly = false,
  teachers = [],
}: {
  course: Course;
  readOnly?: boolean;
  teachers?: TeacherOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? '');
  const [price, setPrice] = useState((course.price_cents / 100).toFixed(2));
  const [imageUrl, setImageUrl] = useState(course.image_url ?? '');
  const [published, setPublished] = useState(course.published);
  const [teacherId, setTeacherId] = useState(course.teacher_id ?? '');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setMessage(null);
    const priceCents = Math.round(parseFloat(price.replace(',', '.')) * 100);
    if (!title.trim() || Number.isNaN(priceCents) || priceCents < 0) {
      setMessage({ type: 'error', text: 'Verifique o título e o preço.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price_cents: priceCents,
          image_url: imageUrl.trim() || null,
          published,
          teacher_id: teacherId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Não foi possível salvar.' });
        return;
      }
      setMessage({ type: 'ok', text: 'Curso atualizado.' });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (readOnly) return;
    if (!confirm('Excluir este curso? Módulos, aulas, materiais e matrículas associados também serão removidos. Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, { method: 'DELETE' });
      if (res.ok) router.push('/admin/cursos');
      else setMessage({ type: 'error', text: 'Não foi possível excluir o curso.' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={save}>
      {readOnly && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Preço, publicação, imagem e exclusão do curso são gerenciados só por um administrador. Você pode
          gerenciar módulos, aulas, materiais e vídeo abaixo.
        </p>
      )}
      <div className="field">
        <label htmlFor="title">Título</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} disabled={readOnly} />
      </div>
      <div className="field">
        <label htmlFor="description">Descrição</label>
        <textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="price">Preço (R$)</label>
          <input id="price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" disabled={readOnly} />
        </div>
        <div className="field">
          <label htmlFor="image">URL da imagem</label>
          <input id="image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" disabled={readOnly} />
        </div>
      </div>
      {!readOnly && (
        <div className="field">
          <label htmlFor="teacher">Professor responsável</label>
          <select id="teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Nenhum (só administradores gerenciam)</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name ?? t.email ?? t.id}</option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: 12 }}>
            O professor escolhido pode gerenciar módulos, aulas, materiais e vídeo deste curso, mas não preço,
            publicação nem exclusão.
          </p>
        </div>
      )}
      <div className="field-check">
        <input id="published" type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} disabled={readOnly} />
        <label htmlFor="published" style={{ margin: 0 }}>Curso publicado (visível para matrícula)</label>
      </div>
      {message && <p role={message.type === 'error' ? 'alert' : undefined} className={message.type === 'ok' ? 'muted' : undefined}>{message.text}</p>}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="button" disabled={saving} aria-busy={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
          <button type="button" className="button danger" onClick={remove} disabled={deleting} aria-busy={deleting}>
            {deleting ? 'Excluindo…' : 'Excluir curso'}
          </button>
        </div>
      )}
    </form>
  );
}
