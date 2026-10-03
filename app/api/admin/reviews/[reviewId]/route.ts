import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

/**
 * Moderação: só admin pode excluir a avaliação de outra pessoa (o aluno
 * exclui a própria via DELETE /api/courses/[courseId]/review). A policy de
 * RLS "admin moderates course reviews" (migration 0012) reforça o mesmo
 * requisito no banco — mesmo que este requireAdmin tivesse um bug, um
 * teacher ou aluno não conseguiria apagar a avaliação de outra pessoa.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const originError = originGuard(request);
  if (originError) return originError;

  const rateLimitResult = await rateLimit(`review-moderation:${clientKey(request)}`);
  if (!rateLimitResult.ok) {
    return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } });
  }

  const { reviewId } = await params;
  if (!uuidSchema.safeParse(reviewId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { error } = await supabase.from('course_reviews').delete().eq('id', reviewId);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir a avaliação.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
