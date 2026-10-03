import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { clientKey, originGuard, rateLimit } from '@/lib/security';
import { moduleAssessmentSubmissionSchema, uuidSchema } from '@/lib/validation';

export async function POST(request: NextRequest, { params }: { params: Promise<{ assessmentId: string }> }) {
  const originError = originGuard(request);
  if (originError) return originError;

  const rateLimitResult = await rateLimit(`assessment-attempt:${clientKey(request)}`);
  if (!rateLimitResult.ok) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } });
  }

  const { assessmentId } = await params;
  if (!uuidSchema.safeParse(assessmentId).success) return NextResponse.json({ error: 'Avaliação inválida.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Respostas inválidas.' }, { status: 400 });
  }
  const parsed = moduleAssessmentSubmissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Respostas inválidas.' }, { status: 400 });

  const { data, error } = await auth.supabase.rpc('submit_module_assessment', {
    target_assessment: assessmentId,
    submitted_answers: parsed.data.answers,
  });
  if (error || !data) return NextResponse.json({ error: 'Avaliação indisponível para esta matrícula.' }, { status: 403 });

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ score: result.score, passed: result.passed });
}