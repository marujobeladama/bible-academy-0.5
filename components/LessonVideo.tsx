'use client';

import { useEffect, useRef, useState } from 'react';

async function saveLessonPosition(lessonId: string, progressSeconds: number, keepalive = false) {
  await fetch(`/api/lessons/${lessonId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress_seconds: progressSeconds }),
    keepalive,
  }).catch(() => undefined);
}

export function LessonVideo({ lessonId }: { lessonId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedPositionRef = useRef(0);
  const latestPositionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [videoResponse, progressResponse] = await Promise.all([
          fetch(`/api/lessons/${lessonId}/video-url`),
          fetch(`/api/lessons/${lessonId}/progress`, { cache: 'no-store' }).catch(() => null),
        ]);
        if (progressResponse?.ok) {
          const progressData = await progressResponse.json().catch(() => null);
          const savedPosition = Number(progressData?.progress_seconds);
          if (!cancelled && Number.isFinite(savedPosition) && savedPosition > 0) {
            lastSavedPositionRef.current = savedPosition;
            setResumePosition(savedPosition);
          }
        }
        if (!videoResponse.ok) {
          if (!cancelled) setError('Não foi possível carregar o vídeo.');
          return;
        }
        const data = await videoResponse.json();
        if (!cancelled) setUrl(data.url);
      } catch {
        if (!cancelled) setError('Não foi possível carregar o vídeo.');
      }
    }
    load();
    return () => {
      cancelled = true;
      const currentPosition = latestPositionRef.current;
      if (currentPosition > 0 && Math.abs(currentPosition - lastSavedPositionRef.current) >= 1) {
        lastSavedPositionRef.current = currentPosition;
        void saveLessonPosition(lessonId, currentPosition, true);
      }
    };
  }, [lessonId]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !resumePosition || !Number.isFinite(videoElement.duration)) return;
    videoElement.currentTime = Math.min(resumePosition, Math.max(0, videoElement.duration - 1));
  }, [resumePosition, url]);

  function restoreSavedPosition() {
    const videoElement = videoRef.current;
    if (!videoElement || !resumePosition || !Number.isFinite(videoElement.duration)) return;
    videoElement.currentTime = Math.min(resumePosition, Math.max(0, videoElement.duration - 1));
  }

  function persistProgress(force = false) {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    const currentPosition = Math.floor(videoElement.currentTime);
    latestPositionRef.current = currentPosition;
    if (currentPosition <= 0 || (!force && currentPosition - lastSavedPositionRef.current < 15)) return;
    lastSavedPositionRef.current = currentPosition;
    void saveLessonPosition(lessonId, currentPosition, force);
  }

  if (error) return <p role="alert">{error}</p>;
  if (!url) return <div className="video-wrap" />;

  // A URL é assinada e expira em poucos minutos (ver /api/lessons/[id]/video-url).
  // Não é permanente e não deve ser compartilhada/copiada com expectativa de reuso.
  return (
    <div className="video-wrap">
      <video
        ref={videoRef}
        src={url}
        controls
        controlsList="nodownload"
        preload="none"
        onLoadedMetadata={() => {
          restoreSavedPosition();
          persistProgress(false);
        }}
        onTimeUpdate={() => persistProgress(false)}
        onPause={() => persistProgress(true)}
        onEnded={() => persistProgress(true)}
      />
    </div>
  );
}
