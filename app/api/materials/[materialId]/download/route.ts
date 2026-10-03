import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { rateLimit, clientKey } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

export async function GET(req: NextRequest, { params }: { params: Promise<{ materialId: string }> }) {
  const rl = await rateLimit(`material-download:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { materialId } = await params;
  if (!uuidSchema.safeParse(materialId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  // A policy "enrolled materials" só devolve a linha se a aula/módulo estiverem
  // publicados e o usuário tiver matrícula (ou for admin).
  const { data: material, error } = await supabase.from('materials').select('storage_path, name').eq('id', materialId).single();
  if (error || !material) return NextResponse.json({ error: 'Material não encontrado.' }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from('course-materials')
    .createSignedUrl(material.storage_path, 60 * 5, { download: material.name }); // 5 minutos

  if (signError || !signed) return NextResponse.json({ error: 'Não foi possível gerar o link.' }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
