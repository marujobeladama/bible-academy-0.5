'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postUploadWithProgress } from '@/lib/upload-progress';

interface Material {
  id: string;
  name: string;
}

export function MaterialsManager({ lessonId, initialMaterials }: { lessonId: string; initialMaterials: Material[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await postUploadWithProgress(`/api/lessons/${lessonId}/materials`, form, (fraction) => {
        setUploadProgress(Math.min(95, Math.round(fraction * 95)));
      });
      if (!response.ok) {
        setError(response.data.error ?? 'Não foi possível enviar o material.');
        return;
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível enviar o material.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(materialId: string) {
    if (!confirm('Excluir este material?')) return;
    setDeletingId(materialId);
    setError('');
    try {
      const response = await fetch(`/api/materials/${materialId}`, { method: 'DELETE' });
      if (response.ok) router.refresh();
      else setError('Não foi possível excluir o material.');
    } catch {
      setError('Não foi possível excluir o material.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="material-list">
        {initialMaterials.map((m) => (
          <div className="material-row" key={m.id}>
            <span>{m.name}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a className="button small secondary" href={`/api/materials/${m.id}/download`} target="_blank" rel="noreferrer">Baixar</a>
              <button className="button small danger" onClick={() => remove(m.id)} disabled={deletingId !== null} aria-busy={deletingId === m.id}>{deletingId === m.id ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        ))}
        {initialMaterials.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nenhum material nesta aula ainda.</p>}
      </div>
      <div style={{ marginTop: 12 }}>
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={onFileSelected} disabled={uploading} />
        {uploading && (
          <div aria-live="polite">
            <div className="upload-progress-label"><span>{uploadProgress < 95 ? 'Enviando material…' : 'Finalizando envio…'}</span><span>{uploadProgress}%</span></div>
            <progress className="upload-progress" max={100} value={uploadProgress} aria-label="Progresso do envio do material" />
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>PDF, Word ou imagem, até 50MB.</p>
      </div>
    </div>
  );
}
