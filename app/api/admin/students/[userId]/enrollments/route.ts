import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';
import { z } from 'zod';

const bodySchema = z.object({ course_id: uuidSchema });

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`enrollment-write:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { userId } = await params;
  if (!uuidSchema.safeParse(userId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  const { data: student } = await supabase.from('profiles').select('id').eq('id', userId).single();
  if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });

  const { data: course } = await supabase.from('courses').select('id').eq('id', parsed.data.course_id).single();
  if (!course) return NextResponse.json({ error: 'Curso não encontrado.' }, { status: 404 });

  // Matrícula concedida manualmente pelo admin (ex.: cortesia). Matrículas
  // originadas de pagamento real são criadas pelo webhook, com service role,
  // source='payment' e payment_id preenchido — nunca por este endpoint.
  const { error } = await supabase
    .from('enrollments')
    .insert({ user_id: userId, course_id: parsed.data.course_id, source: 'manual' });

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'O aluno já possui este curso.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível conceder a matrícula.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
