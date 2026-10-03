import { NextRequest, NextResponse } from 'next/server';
import { requireModuleManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { lessonCreateSchema, uuidSchema } from '@/lib/validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`lesson-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { moduleId } = await params;
  if (!uuidSchema.safeParse(moduleId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireModuleManager(moduleId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = lessonCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  const { data: mod } = await supabase.from('modules').select('id').eq('id', moduleId).single();
  if (!mod) return NextResponse.json({ error: 'Módulo não encontrado.' }, { status: 404 });

  const { data, error } = await supabase
    .from('lessons')
    .insert({ ...parsed.data, module_id: moduleId })
    .select('id, title, position, published, duration_seconds')
    .single();

  if (error) return NextResponse.json({ error: 'Não foi possível criar a aula.' }, { status: 500 });
  return NextResponse.json({ lesson: data }, { status: 201 });
}
