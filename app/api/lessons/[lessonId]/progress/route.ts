import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { progressUpdateSchema, uuidSchema } from '@/lib/validation';

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const rl = await rateLimit(`progress-read:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { data: lesson } = await supabase.from('lessons').select('id').eq('id', lessonId).single();
  if (!lesson) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });

  const { data: progress, error } = await supabase
    .from('lesson_progress')
    .select('progress_seconds, completed')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível carregar o progresso.' }, { status: 500 });

  return NextResponse.json(
    { progress_seconds: progress?.progress_seconds ?? 0, completed: progress?.completed ?? false },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`progress:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = progressUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  // Confirma que a aula existe e é acessível (RLS de "lessons" já cobre
  // publicação + matrícula). Sem isso, um lessonId de outro curso não
  // devolveria nada e não deveríamos criar progresso para ele.
  const { data: lesson } = await supabase.from('lessons').select('id').eq('id', lessonId).single();
  if (!lesson) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });

  // upsert: a policy "own progress" (for all, using/with check user_id = auth.uid())
  // garante que ninguém grava progresso em nome de outro usuário, mesmo que
  // o campo user_id fosse manipulado no payload — por isso nem aceitamos
  // user_id do corpo da requisição, sempre usamos o da sessão.
  const { data: existing } = await supabase
    .from('lesson_progress')
    .select('started_at')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  const update: Record<string, unknown> = {
    user_id: user.id,
    lesson_id: lessonId,
    updated_at: new Date().toISOString(),
    started_at: existing?.started_at ?? new Date().toISOString(),
  };
  if (parsed.data.completed !== undefined) update.completed = parsed.data.completed;
  if (parsed.data.progress_seconds !== undefined) update.progress_seconds = parsed.data.progress_seconds;

  const { error } = await supabase.from('lesson_progress').upsert(update, { onConflict: 'user_id,lesson_id' });
  if (error) return NextResponse.json({ error: 'Não foi possível salvar o progresso.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
