import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; courseId: string }> }
) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`enrollment-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { userId, courseId } = await params;
  if (!uuidSchema.safeParse(userId).success || !uuidSchema.safeParse(courseId).success) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { error } = await supabase.from('enrollments').delete().eq('user_id', userId).eq('course_id', courseId);
  if (error) return NextResponse.json({ error: 'Não foi possível remover a matrícula.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
