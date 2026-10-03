import { NextRequest, NextResponse } from 'next/server';
import { getPaymentGateway } from '@/lib/payments/gateway';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, clientKey } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

/**
 * Endpoint chamado pelo gateway de pagamento (servidor a servidor), não por
 * um navegador — por isso NÃO passa por `originGuard` (que protege ações
 * disparadas por um browser autenticado via cookie). A proteção aqui é a
 * assinatura do webhook, verificada com o segredo compartilhado do gateway.
 * Nenhuma sessão de usuário é usada; o cliente de banco é a service role,
 * usada deliberadamente porque este é um fluxo servidor-a-servidor já
 * autenticado pela assinatura — nunca por um token vindo do navegador.
 */
export async function POST(req: NextRequest) {
  // Rate limit por IP como proteção adicional contra abuso/flood, mesmo que
  // a assinatura já seja a defesa principal.
  const rl = await rateLimit(`webhook:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429 });

  const gateway = getPaymentGateway();
  if (!gateway.configured) {
    // Fail closed: sem gateway configurado, nenhum webhook é processado.
    return NextResponse.json({ error: 'Gateway de pagamento não configurado.' }, { status: 503 });
  }

  const rawBody = await req.text();
  const verification = await gateway.verifyWebhook({
    rawBody,
    signatureHeader: req.headers.get('x-signature') ?? req.headers.get('x-webhook-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId: req.nextUrl.searchParams.get('data.id'),
  });

  if (!verification.valid || !verification.event) {
    // Nunca revelamos qual parte da verificação falhou (evita ajudar um
    // atacante a forjar uma assinatura válida por tentativa e erro).
    return NextResponse.json(
      { error: 'Webhook inválido.' },
      { status: verification.retryable ? 503 : 401 },
    );
  }

  const event = verification.event;
  if (!uuidSchema.safeParse(event.paymentId).success) {
    return NextResponse.json({ error: 'Pagamento não encontrado.' }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('amount_cents, provider')
      .eq('id', event.paymentId)
      .maybeSingle();

    if (paymentError) return NextResponse.json({ error: 'Falha ao localizar pagamento.' }, { status: 500 });
    if (!payment || payment.provider !== gateway.name) {
      return NextResponse.json({ error: 'Pagamento não encontrado.' }, { status: 404 });
    }
    if (event.amountCents !== undefined && event.amountCents !== payment.amount_cents) {
      return NextResponse.json({ error: 'Valor do pagamento não confere.' }, { status: 400 });
    }
    if (event.currencyId && event.currencyId !== 'BRL') {
      return NextResponse.json({ error: 'Moeda do pagamento não suportada.' }, { status: 400 });
    }
    if (gateway.name === 'mercadopago' && (event.amountCents === undefined || event.currencyId !== 'BRL')) {
      return NextResponse.json({ error: 'Dados do pagamento incompletos.' }, { status: 400 });
    }

    if (event.type === 'approved') {
      const { data, error } = await supabaseAdmin.rpc('confirm_payment', {
        p_payment_id: event.paymentId,
        p_provider_transaction_id: event.providerTransactionId,
        p_webhook_event_id: event.id,
      });
      if (error) {
        console.error('confirm_payment failed', error);
        return NextResponse.json({ error: 'Falha ao confirmar pagamento.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, result: data });
    }

    const statusMap: Record<string, string> = {
      refused: 'refused',
      cancelled: 'cancelled',
      refunded: 'refunded',
      pending: 'pending',
    };
    const mappedStatus = statusMap[event.type];
    if (mappedStatus) {
      const { error } = await supabaseAdmin.rpc('mark_payment_status', {
        p_payment_id: event.paymentId,
        p_status: mappedStatus,
        p_webhook_event_id: event.id,
      });
      if (error) {
        console.error('mark_payment_status failed', error);
        return NextResponse.json({ error: 'Falha ao registrar status.' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('webhook processing error', err);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
