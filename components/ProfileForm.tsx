'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { updateProfileName } from '@/app/actions/profile';

interface CurrentProfile {
  name: string;
  church: string;
  denomination: string;
  contact_phone: string;
  avatarUrl: string | null;
  live_provider: string;
  live_url: string;
  canManageLives: boolean;
}

export function ProfileForm({ currentProfile }: { currentProfile: CurrentProfile }) {
  const [name, setName] = useState(currentProfile.name);
  const [liveProvider, setLiveProvider] = useState(currentProfile.live_provider);
  const [avatarUrl, setAvatarUrl] = useState(currentProfile.avatarUrl);
  const [photoError, setPhotoError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfileName(formData);
      if (result?.error) setMessage({ type: 'error', text: result.error });
      else setMessage({ type: 'ok', text: 'Nome atualizado.' });
    });
  }

  async function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.set('photo', file);
      const response = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) {
        setPhotoError(result.error ?? 'Não foi possível enviar a foto.');
        return;
      }
      setAvatarUrl(result.avatarUrl);
    } catch {
      setPhotoError('Não foi possível enviar a foto.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  }

  return (
    <form action={submit} className="profile-form">
      <div className="profile-photo-field">
        {avatarUrl ? (
          <Image className="profile-avatar" src={avatarUrl} alt="Foto do perfil" width={88} height={88} unoptimized />
        ) : (
          <div className="profile-avatar profile-avatar-empty" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="profile-photo-meta">
          <label htmlFor="avatar">Foto do perfil</label>
          <input id="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={uploadingPhoto} />
          <p className="muted">JPG, PNG ou WebP, até 2 MB. {uploadingPhoto ? 'Enviando…' : ''}</p>
          {photoError && <p role="alert" className="profile-form-error">{photoError}</p>}
        </div>
      </div>

      <div className="profile-grid">
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>
        <div className="field">
          <label htmlFor="contact_phone">Telefone de contato</label>
          <input id="contact_phone" name="contact_phone" type="tel" autoComplete="tel" defaultValue={currentProfile.contact_phone} maxLength={30} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="church">Igreja</label>
          <input id="church" name="church" defaultValue={currentProfile.church} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="denomination">Denominação</label>
          <input id="denomination" name="denomination" defaultValue={currentProfile.denomination} maxLength={120} />
        </div>
      </div>

      {currentProfile.canManageLives && (
        <fieldset className="profile-live-settings">
          <legend>Link das aulas ao vivo</legend>
          <p className="muted">Este link será usado nas lives dos cursos que você gerencia.</p>
          <div className="field">
            <label htmlFor="live_provider">Plataforma</label>
            <select id="live_provider" name="live_provider" value={liveProvider} onChange={(event) => setLiveProvider(event.target.value)}>
              <option value="">Selecione</option>
              <option value="google_meet">Google Meet</option>
              <option value="jitsi">Jitsi</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="live_url">Link da sala</label>
            <input id="live_url" name="live_url" type="url" inputMode="url" placeholder="https://…" defaultValue={currentProfile.live_url} required={liveProvider !== ''} />
          </div>
        </fieldset>
      )}
      {message && <p role={message.type === 'error' ? 'alert' : undefined} className={message.type === 'ok' ? 'muted' : undefined}>{message.text}</p>}
      <button className="button" disabled={pending} aria-busy={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
