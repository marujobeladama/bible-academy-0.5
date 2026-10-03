import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireModuleManager } from '@/lib/auth-helpers';
import { clientKey, originGuard, rateLimit } from '@/lib/security';
import { moduleAssessmentSchema, uuidSchema } from '@/lib/validation';

export async function GET(request: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  if (!uuidSchema.safeParse(moduleId).success) return NextResponse.json({ error: 'Módulo inválido.' }, { status: 400 });

  const auth = await requireModuleManager(moduleId);
  if (auth.error) return auth.error;

  const { data: assessment } = await auth.supabase
    .from('module_assessments')
    .select('id, title, pass_percentage, published')
    .eq('module_id', moduleId)
    .maybeSingle();
  if (!assessment) return NextResponse.json({ assessment: null });

  const { data: questions } = await auth.supabase
    .from('assessment_questions')
    .select('id, prompt, options, position')
    .eq('assessment_id', assessment.id)
    .order('position');
  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: answerKeys } = questionIds.length
    ? await auth.supabase.from('module_assessment_answer_keys').select('question_id, correct_option').in('question_id', questionIds)
    : { data: [] as Array<{ question_id: string; correct_option: number }> };
  const answerKeyByQuestion = new Map((answerKeys ?? []).map((key) => [key.question_id, key.correct_option]));

  return NextResponse.json({
    assessment: {
      ...assessment,
      questions: (questions ?? []).map((question) => ({
        ...question,
        correct_option: answerKeyByQuestion.get(question.id) ?? 0,
      })),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const originError = originGuard(request);
  if (originError) return originError;

  const rateLimitResult = await rateLimit(`assessment-write:${clientKey(request)}`);
  if (!rateLimitResult.ok) {
    return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } });
  }

  const { moduleId } = await params;
  if (!uuidSchema.safeParse(moduleId).success) return NextResponse.json({ error: 'Módulo inválido.' }, { status: 400 });
  const auth = await requireModuleManager(moduleId);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  const parsed = moduleAssessmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Confira título, nota mínima e questões.' }, { status: 400 });

  const { data: assessmentId, error } = await auth.supabase.rpc('save_module_assessment', {
    target_module: moduleId,
    assessment_title: parsed.data.title,
    score_threshold: parsed.data.pass_percentage,
    publish_assessment: parsed.data.published,
    question_data: parsed.data.questions,
  });
  if (error || !assessmentId) return NextResponse.json({ error: 'Não foi possível salvar a avaliação.' }, { status: 500 });

  const { data: courseId } = await auth.supabase.rpc('module_course_id', { target_module: moduleId });
  revalidatePath('/admin');
  if (courseId) {
    revalidatePath(`/admin/cursos/${courseId}`);
    revalidatePath(`/dashboard/cursos/${courseId}`);
  }

  return NextResponse.json({ ok: true, assessmentId });
}