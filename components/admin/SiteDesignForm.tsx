'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteDesignSettings } from '@/lib/site-design';

function getImagePreview(imageUrl: string) {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    if (url.hostname === 'i.imgur.com') return imageUrl;
    if (url.hostname === 'imgur.com' || url.hostname === 'www.imgur.com') {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length === 1 && /^[a-zA-Z0-9]+(?:\.(?:jpe?g|png|gif|webp))?$/i.test(segments[0])) {
        return `https://i.imgur.com/${segments[0].includes('.') ? segments[0] : `${segments[0]}.jpg`}`;
      }
    }
    return ['http:', 'https:'].includes(url.protocol) ? imageUrl : null;
  } catch {
    return null;
  }
}

export function SiteDesignForm({
  initial,
  resolvedHeroImage,
}: {
  initial: SiteDesignSettings;
  resolvedHeroImage: string | null;
}) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initial.brand_name);
  const [accentColor, setAccentColor] = useState(initial.accent_color);
  const [accentSecondary, setAccentSecondary] = useState(initial.accent_secondary);
  const [heroTitle, setHeroTitle] = useState(initial.hero_title);
  const [heroDescription, setHeroDescription] = useState(initial.hero_description);
  const [heroImageUrl, setHeroImageUrl] = useState(initial.hero_image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const typedImagePreview = getImagePreview(heroImageUrl.trim());
  const imagePreview = typedImagePreview ?? (heroImageUrl.trim() === (initial.hero_image_url ?? '') ? resolvedHeroImage : null);
  const previewStyle = {
    '--accent': accentColor,
    '--accent2': accentSecondary,
  } as React.CSSProperties;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/design', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: brandName,
          accent_color: accentColor,
          accent_secondary: accentSecondary,
          hero_title: heroTitle,
          hero_description: heroDescription,
          hero_image_url: heroImageUrl.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error ?? 'Não foi possível salvar o design.' });
        return;
      }
      setMessage({ type: 'ok', text: 'Design atualizado no site.' });
      router.refresh();
    } catch {
      setMessage({ type: 'error', text: 'Não foi possível salvar o design.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="design-layout">
      <form className="design-controls" onSubmit={save}>
        <div className="field">
          <label htmlFor="brand-name">Nome da marca</label>
          <input id="brand-name" value={brandName} onChange={(event) => setBrandName(event.target.value)} maxLength={60} required />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="accent-color">Cor principal</label>
            <div className="color-control">
              <input id="accent-color" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
              <span>{accentColor}</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="accent-secondary">Cor de destaque</label>
            <div className="color-control">
              <input id="accent-secondary" type="color" value={accentSecondary} onChange={(event) => setAccentSecondary(event.target.value)} />
              <span>{accentSecondary}</span>
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="hero-title">Título da página inicial</label>
          <input id="hero-title" value={heroTitle} onChange={(event) => setHeroTitle(event.target.value)} maxLength={140} required />
        </div>
        <div className="field">
          <label htmlFor="hero-description">Texto de apresentação</label>
          <textarea id="hero-description" rows={3} value={heroDescription} onChange={(event) => setHeroDescription(event.target.value)} maxLength={500} />
        </div>
        <div className="field">
          <label htmlFor="hero-image">Imagem de destaque</label>
          <input
            id="hero-image"
            type="url"
            value={heroImageUrl}
            onChange={(event) => setHeroImageUrl(event.target.value)}
            placeholder="Link público do Imgur ou de uma imagem"
          />
        </div>

        {message && <p role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <button className="button" disabled={saving} aria-busy={saving}>{saving ? 'Salvando…' : 'Salvar design'}</button>
      </form>

      <section className="design-preview-section" aria-label="Prévia ao vivo">
        <div className="eyebrow">Prévia ao vivo</div>
        <div className="design-preview" style={previewStyle}>
          <div className="design-preview-brand">{brandName || 'Nome da marca'}</div>
          <div className="design-preview-hero">
            <div>
              <h2>{heroTitle || 'Título da página inicial'}</h2>
              <p>{heroDescription || 'Texto de apresentação do site.'}</p>
              <span className="button">Explorar cursos</span>
            </div>
            {imagePreview ? (
              <Image src={imagePreview} alt="Prévia da imagem de destaque" width={480} height={320} unoptimized loading="lazy" />
            ) : (
              <div className="design-preview-placeholder">Imagem de destaque</div>
            )}
          </div>
          <div className="design-preview-swatches">
            <span style={{ backgroundColor: accentColor }} />
            <span style={{ backgroundColor: accentSecondary }} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>As cores atualizam também os botões, links e áreas internas.</p>
      </section>
    </div>
  );
}