import { NextRequest, NextResponse } from 'next/server';
import { requireCourseManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { moduleCreateSchema, uuidSchema } from '@/lib/validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`module-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { courseId } = await params;
  if (!uuidSchema.safeParse(courseId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireCourseManager(courseId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = moduleCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  const { data: course } = await supabase.from('courses').select('id').eq('id', courseId).single();
  if (!course) return NextResponse.json({ error: 'Curso não encontrado.' }, { status: 404 });

  const { data, error } = await supabase
    .from('modules')
    .insert({ ...parsed.data, course_id: courseId })
    .select('id, title, position, published')
    .single();

  if (error) return NextResponse.json({ error: 'Não foi possível criar o módulo.' }, { status: 500 });
  return NextResponse.json({ module: data }, { status: 201 });
}
