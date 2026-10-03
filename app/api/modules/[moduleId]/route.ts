import { NextRequest, NextResponse } from 'next/server';
import { requireModuleManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { moduleUpdateSchema, uuidSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`module-write:${clientKey(req)}`);
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
  const parsed = moduleUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });

  const { data, error } = await supabase
    .from('modules')
    .update(parsed.data)
    .eq('id', moduleId)
    .select('id, title, position, published')
    .single();

  if (error || !data) return NextResponse.json({ error: 'Não foi possível atualizar o módulo.' }, { status: 500 });
  return NextResponse.json({ module: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`module-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { moduleId } = await params;
  if (!uuidSchema.safeParse(moduleId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireModuleManager(moduleId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { error } = await supabase.from('modules').delete().eq('id', moduleId);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir o módulo.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
