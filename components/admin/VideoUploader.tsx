'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as tus from 'tus-js-client';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

/**
 * Upload resumível direto para o Supabase Storage via protocolo TUS — os
 * bytes do vídeo nunca passam pela API do Next.js. Fluxo:
 *   1. POST /api/lessons/[id]/video/init — autoriza e recebe um caminho
 *      seguro gerado pelo servidor.
 *   2. tus-js-client envia o arquivo em pedaços direto ao Storage, usando a
 *      sessão do próprio usuário logado (nunca a service role). Suporta
 *      pausa/retomada automática em caso de queda de rede.
 *   3. POST /api/lessons/[id]/video/complete — confirma no banco.
 */
export function VideoUploader({ lessonId, hasVideo }: { lessonId: string; hasVideo: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      const initRes = await fetch(`/api/lessons/${lessonId}/video/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime_type: file.type, size_bytes: file.size }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        setError(initData.error ?? 'Não foi possível iniciar o envio.');
        setUploading(false);
        return;
      }

      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError('Sessão expirada. Recarregue a página e faça login novamente.');
        setUploading(false);
        return;
      }

      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: `${projectUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            'x-upsert': 'false',
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: initData.bucket,
            objectName: initData.path,
            contentType: initData.contentType,
            cacheControl: '3600',
          },
          chunkSize: 6 * 1024 * 1024, // requisito do endpoint resumível do Supabase Storage
          onError: (err) => reject(err),
          onProgress: (bytesUploaded, bytesTotal) => {
            setUploadProgress(Math.min(95, Math.round((bytesUploaded / bytesTotal) * 95)));
          },
          onSuccess: () => resolve(),
        });
        uploadRef.current = upload;

        // Retoma automaticamente um upload anterior interrompido do mesmo
        // arquivo (mesmo tamanho/nome/data de modificação), em vez de
        // recomeçar do zero — é o ponto central de ser "resumível".
        upload.findPreviousUploads().then((previous) => {
          if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        });
      });

      setUploadProgress(97);

      const completeRes = await fetch(`/api/lessons/${lessonId}/video/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: initData.path }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        setError(completeData.error ?? 'O upload terminou, mas não foi possível associar o vídeo à aula.');
        return;
      }

      setUploadProgress(100);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Não foi possível enviar o vídeo.');
    } finally {
      setUploading(false);
      uploadRef.current = null;
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function cancelUpload() {
    uploadRef.current?.abort(false);
    setUploading(false);
    setError('Envio cancelado.');
  }

  async function removeVideo() {
    if (!confirm('Remover o vídeo desta aula?')) return;
    setRemoving(true);
    setError('');
    try {
      const response = await fetch(`/api/lessons/${lessonId}/video`, { method: 'DELETE' });
      if (!response.ok) setError('Não foi possível remover o vídeo.');
      else router.refresh();
    } catch {
      setError('Não foi possível remover o vídeo.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      {hasVideo && <p className="badge success" style={{ marginBottom: 10 }}>Vídeo anexado</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={onFileSelected} disabled={uploading || removing} />
        {uploading && (
          <button type="button" className="button small secondary" onClick={cancelUpload}>
            Cancelar
          </button>
        )}
        {hasVideo && !uploading && (
          <button type="button" className="button small danger" onClick={removeVideo} disabled={removing} aria-busy={removing}>
            {removing ? 'Removendo…' : 'Remover vídeo'}
          </button>
        )}
      </div>
      {uploading && (
        <div aria-live="polite">
          <div className="upload-progress-label"><span>{uploadProgress < 97 ? 'Enviando vídeo (retomável se a conexão cair)…' : 'Finalizando…'}</span><span>{uploadProgress}%</span></div>
          <progress className="upload-progress" max={100} value={uploadProgress} aria-label="Progresso do envio do vídeo" />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>MP4, WebM ou MOV, até 2GB. O envio pausa e retoma sozinho se a conexão cair.</p>
    </div>
  );
}
