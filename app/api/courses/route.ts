import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { courseCreateSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`course-create:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = courseCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  // published sempre começa false — publicar é uma ação explícita separada
  // (PATCH), nunca implícita na criação.
  const { data, error } = await supabase
    .from('courses')
    .insert({ ...parsed.data, published: false })
    .select('id, title, description, price_cents, published, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Não foi possível criar o curso.' }, { status: 500 });
  return NextResponse.json({ course: data }, { status: 201 });
}
