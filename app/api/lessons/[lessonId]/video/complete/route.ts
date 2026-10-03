import { NextRequest, NextResponse } from 'next/server';
import { requireLessonManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard, RATE_LIMIT_PRESETS } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';
import { z } from 'zod';

const completeSchema = z.object({ path: z.string().min(1).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`video-upload-complete:${clientKey(req)}`, RATE_LIMIT_PRESETS.upload);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireLessonManager(lessonId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });

  // Nunca aceitamos "de bandeja" que o upload aconteceu: o caminho
  // informado precisa (a) pertencer a esta aula especificamente — mesmo
  // padrão de segurança usado pela RLS (migration 0007) — e (b) existir de
  // fato no bucket, checado tentando assinar uma URL para ele.
  const expectedPrefix = `lesson-${lessonId}/video/`;
  if (!parsed.data.path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Caminho de arquivo não corresponde a esta aula.' }, { status: 400 });
  }

  const { data: lesson } = await supabase.from('lessons').select('id, video_path').eq('id', lessonId).single();
  if (!lesson) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });

  const { error: signError } = await supabase.storage.from('course-videos').createSignedUrl(parsed.data.path, 30);
  if (signError) {
    return NextResponse.json({ error: 'O arquivo enviado não foi encontrado no Storage.' }, { status: 400 });
  }

  const { error } = await supabase.from('lessons').update({ video_path: parsed.data.path }).eq('id', lessonId);
  if (error) {
    return NextResponse.json({ error: 'Não foi possível associar o vídeo à aula.' }, { status: 500 });
  }

  const previousPath = lesson.video_path;
  if (previousPath && previousPath !== parsed.data.path) {
    await supabase.storage.from('course-videos').remove([previousPath]);
  }

  return NextResponse.json({ ok: true });
}
