import { NextRequest, NextResponse } from 'next/server';
import { requireLessonManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { lessonUpdateSchema, uuidSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`lesson-write:${clientKey(req)}`);
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
  const parsed = lessonUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });

  const { data, error } = await supabase
    .from('lessons')
    .update(parsed.data)
    .eq('id', lessonId)
    .select('id, title, description, position, published, duration_seconds')
    .single();

  if (error || !data) return NextResponse.json({ error: 'Não foi possível atualizar a aula.' }, { status: 500 });
  return NextResponse.json({ lesson: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`lesson-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireLessonManager(lessonId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  // Apaga primeiro os arquivos de storage vinculados (materiais e vídeo),
  // depois a linha — evita deixar arquivo órfão no bucket.
  const { data: lesson } = await supabase.from('lessons').select('video_path').eq('id', lessonId).single();
  const { data: materials } = await supabase.from('materials').select('storage_path').eq('lesson_id', lessonId);

  if (materials && materials.length > 0) {
    await supabase.storage.from('course-materials').remove(materials.map((m) => m.storage_path));
  }
  if (lesson?.video_path) {
    await supabase.storage.from('course-videos').remove([lesson.video_path]);
  }

  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir a aula.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
