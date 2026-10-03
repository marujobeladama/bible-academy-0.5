import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { courseUpdateSchema, uuidSchema } from '@/lib/validation';

export async function GET(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const rl = await rateLimit(`course:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { courseId } = await params;
  if (!uuidSchema.safeParse(courseId).success) return NextResponse.json({ error: 'Invalid course id' }, { status: 400 });

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.from('courses').select('id,title,description,price_cents').eq('id', courseId).single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ course: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`course-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { courseId } = await params;
  if (!uuidSchema.safeParse(courseId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = courseUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });

  const { data, error } = await supabase
    .from('courses')
    .update(parsed.data)
    .eq('id', courseId)
    .select('id,title,description,price_cents,published,image_url,teacher_id')
    .single();

  if (error || !data) return NextResponse.json({ error: 'Não foi possível atualizar o curso.' }, { status: 500 });
  return NextResponse.json({ course: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`course-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { courseId } = await params;
  if (!uuidSchema.safeParse(courseId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  // ON DELETE CASCADE cuida de módulos, aulas, materiais, matrículas e
  // progresso vinculados — definido na migration 0001.
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir o curso.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
