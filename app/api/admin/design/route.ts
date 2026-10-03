import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { clientKey, originGuard, rateLimit } from '@/lib/security';
import { siteDesignSchema } from '@/lib/validation';

export async function PUT(req: NextRequest) {
  const originError = originGuard(req);
  if (originError) return originError;

  const limit = await rateLimit(`site-design:${clientKey(req)}`);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Muitas requisições.' }, {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfter) },
    });
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const parsed = siteDesignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Revise os campos do design.' }, { status: 400 });

  const { error } = await auth.supabase
    .from('site_design_settings')
    .upsert({ id: true, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: 'Não foi possível salvar o design.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}