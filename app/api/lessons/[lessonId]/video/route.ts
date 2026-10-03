import { NextRequest, NextResponse } from 'next/server';
import { requireLessonManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

// O upload (criação/substituição) de vídeo não é mais feito aqui — ver
// app/api/lessons/[lessonId]/video/init e .../complete. Este arquivo cuida
// só da remoção, que não envolve bytes de arquivo e continua simples.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`video-upload:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireLessonManager(lessonId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { data: lesson } = await supabase.from('lessons').select('video_path').eq('id', lessonId).single();
  if (!lesson?.video_path) return NextResponse.json({ error: 'Esta aula não possui vídeo.' }, { status: 404 });

  const { error } = await supabase.from('lessons').update({ video_path: null }).eq('id', lessonId);
  if (error) return NextResponse.json({ error: 'Não foi possível remover o vídeo.' }, { status: 500 });

  await supabase.storage.from('course-videos').remove([lesson.video_path]);
  return NextResponse.json({ ok: true });
}
