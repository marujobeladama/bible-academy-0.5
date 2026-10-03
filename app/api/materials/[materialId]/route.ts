import { NextRequest, NextResponse } from 'next/server';
import { requireMaterialManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`material-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { materialId } = await params;
  if (!uuidSchema.safeParse(materialId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireMaterialManager(materialId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { data: material } = await supabase.from('materials').select('storage_path').eq('id', materialId).single();
  if (!material) return NextResponse.json({ error: 'Material não encontrado.' }, { status: 404 });

  // Remove primeiro o registro (autorização/visibilidade), depois o arquivo
  // físico — se o delete do banco falhar, não removemos o arquivo do bucket.
  const { error } = await supabase.from('materials').delete().eq('id', materialId);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir o material.' }, { status: 500 });

  await supabase.storage.from('course-materials').remove([material.storage_path]);

  return NextResponse.json({ ok: true });
}
