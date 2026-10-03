import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { courseReviewSchema, uuidSchema } from '@/lib/validation';

export async function POST(request: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const originError = originGuard(request);
  if (originError) return originError;

  const rateLimitResult = await rateLimit(`course-review:${clientKey(request)}`);
  if (!rateLimitResult.ok) {
    return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } });
  }

  const { courseId } = await params;
  if (!uuidSchema.safeParse(courseId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!enrollment) return NextResponse.json({ error: 'A avaliação está disponível para alunos matriculados.' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = courseReviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Nota ou comentário inválido.' }, { status: 400 });

  const { error } = await supabase.from('course_reviews').upsert({
    course_id: courseId,
    user_id: user.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'course_id,user_id' });

  if (error) return NextResponse.json({ error: 'Não foi possível salvar sua avaliação.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const originError = originGuard(request);
  if (originError) return originError;

  const rateLimitResult = await rateLimit(`course-review:${clientKey(request)}`);
  if (!rateLimitResult.ok) {
    return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } });
  }

  const { courseId } = await params;
  if (!uuidSchema.safeParse(courseId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  // Só a própria avaliação — RLS ("enrolled students delete own course
  // review") reforça o mesmo filtro no banco; o .eq('user_id', ...) aqui é
  // defesa em profundidade, não a única proteção.
  const { error } = await supabase
    .from('course_reviews')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: 'Não foi possível excluir sua avaliação.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}