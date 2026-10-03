import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';
import { getPaymentGateway } from '@/lib/payments/gateway';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';

const bodySchema = z.object({ course_id: uuidSchema });

export async function POST(req: NextRequest) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`checkout:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  // "published courses visible" garante que só cursos publicados (ou que o
  // usuário já possui) retornam aqui — não é possível iniciar checkout de
  // um curso em rascunho adivinhando o ID.
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, price_cents, published')
    .eq('id', parsed.data.course_id)
    .single();

  if (!course || !course.published) return NextResponse.json({ error: 'Curso não encontrado.' }, { status: 404 });

  const { data: existingEnrollment } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('course_id', course.id)
    .maybeSingle();

  if (existingEnrollment) return NextResponse.json({ error: 'Você já possui este curso.' }, { status: 409 });

  const gateway = getPaymentGateway();
  if (!gateway.configured) {
    return NextResponse.json({
      configured: false,
      message: 'A compra ainda não está disponível. O administrador precisa configurar um provedor de pagamento compatível.',
    });
  }

  // O preço sempre vem do banco. Reutilizar o pagamento pendente torna
  // tentativas repetidas idempotentes e evita criar preferências duplicadas.
  // RLS bloqueia gravação direta por alunos; service role só é usada depois
  // de validar sessão, publicação, matrícula e preço no servidor.
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
    .from('payments')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', course.id)
    .eq('provider', gateway.name)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingPaymentError) return NextResponse.json({ error: 'Não foi possível consultar o pagamento.' }, { status: 500 });

  let paymentId = existingPayment?.id;
  if (!paymentId) {
    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .insert({ user_id: user.id, course_id: course.id, amount_cents: course.price_cents, status: 'pending', provider: gateway.name })
      .select('id')
      .single();
    if (error || !payment) return NextResponse.json({ error: 'Não foi possível iniciar o pagamento.' }, { status: 500 });
    paymentId = payment.id;
  }

  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin).origin;
  const result = await gateway.createCheckoutSession({
    paymentId,
    courseTitle: course.title,
    amountCents: course.price_cents,
    userEmail: user.email ?? '',
    successUrl: `${origin}/dashboard?matricula=pendente`,
    cancelUrl: `${origin}/dashboard`,
    notificationUrl: `${origin}/api/webhooks/payment`,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ configured: true, checkout_url: result.checkoutUrl, payment_id: paymentId });
}
