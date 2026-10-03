import { createHmac, timingSafeEqual } from 'node:crypto';
import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from 'mercadopago';

/**
 * Contrato dos adapters de pagamento conectados ao Bible Academy.
 *
 * O adapter Mercado Pago usa credenciais apenas no servidor. Sem configuração
 * completa, `getPaymentGateway()` recusa checkout e webhooks (fail closed).
 */
interface NormalizedWebhookEvent {
  id: string; // identificador único do evento no provedor — chave de idempotência
  type: 'approved' | 'refused' | 'cancelled' | 'refunded' | 'pending';
  providerTransactionId: string;
  paymentId: string; // id interno (tabela payments) repassado como metadata na criação do checkout
  amountCents?: number;
  currencyId?: string;
}

interface WebhookVerificationInput {
  rawBody: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}

interface CheckoutInput {
  paymentId: string;
  courseTitle: string;
  amountCents: number;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
  notificationUrl: string;
}

export interface PaymentGateway {
  name: string;
  configured: boolean;
  createCheckoutSession(input: CheckoutInput): Promise<{ checkoutUrl: string } | { error: string }>;
  verifyWebhook(input: WebhookVerificationInput): Promise<{
    valid: boolean;
    event?: NormalizedWebhookEvent;
    error?: string;
    retryable?: boolean;
  }>;
}

const notConfiguredGateway: PaymentGateway = {
  name: 'none',
  configured: false,
  async createCheckoutSession() {
    return {
      error:
        'CONFIGURAÇÃO NECESSÁRIA DO PROPRIETÁRIO: nenhum gateway de pagamento está configurado. ' +
        'Defina PAYMENT_GATEWAY_PROVIDER e as credenciais correspondentes em variáveis de ambiente.',
    };
  },
  async verifyWebhook() {
    // Fail closed: sem gateway configurado, nenhum webhook é aceito como válido.
    return { valid: false, error: 'Gateway de pagamento não configurado.' };
  },
};

/**
 * Implementação de referência genérica, útil em desenvolvimento/QA para
 * validar toda a tubulação (checkout → payments → webhook → confirm_payment
 * → enrollment) sem depender de nenhum provedor externo real.
 *
 * Ativada só se PAYMENT_GATEWAY_PROVIDER=generic-hmac e
 * PAYMENT_WEBHOOK_SECRET estiverem definidos. O "checkout" aqui é um
 * endpoint local que simula a tela de pagamento — NÃO é um gateway real e
 * NÃO deve ser usado em produção com dinheiro de verdade. A assinatura do
 * webhook segue o padrão comum (HMAC-SHA256 do corpo bruto com um segredo
 * compartilhado, enviado no header `x-webhook-signature`). Esse modo serve
 * apenas para desenvolvimento/QA e não processa dinheiro real.
 */
function genericHmacGateway(secret: string): PaymentGateway {
  return {
    name: 'generic-hmac (referência para desenvolvimento — não é um gateway real)',
    configured: true,
    async createCheckoutSession(input) {
      const url = new URL(input.successUrl);
      url.pathname = '/checkout/simulado';
      url.searchParams.set('payment_id', input.paymentId);
      return { checkoutUrl: url.toString() };
    },
    async verifyWebhook({ rawBody, signatureHeader }) {
      if (!signatureHeader) return { valid: false, error: 'Assinatura ausente.' };
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      const provided = Buffer.from(signatureHeader);
      const expectedBuf = Buffer.from(expected);
      if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
        return { valid: false, error: 'Assinatura inválida.' };
      }
      try {
        const event = JSON.parse(rawBody) as NormalizedWebhookEvent;
        if (!event.id || !event.paymentId || !event.type || !event.providerTransactionId) {
          return { valid: false, error: 'Payload de evento incompleto.' };
        }
        return { valid: true, event };
      } catch {
        return { valid: false, error: 'Payload inválido.' };
      }
    },
  };
}

function mercadoPagoGateway(accessToken: string, webhookSecret: string): PaymentGateway {
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
  const preferenceClient = new Preference(client);
  const paymentClient = new Payment(client);
  const eventTypeByStatus: Record<string, NormalizedWebhookEvent['type']> = {
    approved: 'approved',
    rejected: 'refused',
    cancelled: 'cancelled',
    refunded: 'refunded',
    charged_back: 'refunded',
    pending: 'pending',
    in_process: 'pending',
    authorized: 'pending',
  };

  return {
    name: 'mercadopago',
    configured: true,
    async createCheckoutSession(input) {
      try {
        const preference = await preferenceClient.create({
          body: {
            items: [{
              id: input.paymentId,
              title: input.courseTitle,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: Number((input.amountCents / 100).toFixed(2)),
            }],
            payer: input.userEmail ? { email: input.userEmail } : undefined,
            external_reference: input.paymentId,
            metadata: { payment_id: input.paymentId },
            notification_url: input.notificationUrl,
            back_urls: {
              success: input.successUrl,
              pending: input.successUrl,
              failure: input.cancelUrl,
            },
            auto_return: 'approved',
          },
          requestOptions: { idempotencyKey: input.paymentId },
        });
        const checkoutUrl = accessToken.startsWith('TEST-')
          ? preference.sandbox_init_point ?? preference.init_point
          : preference.init_point;
        return checkoutUrl ? { checkoutUrl } : { error: 'O Mercado Pago não retornou o link do checkout.' };
      } catch {
        return { error: 'Não foi possível criar o checkout no Mercado Pago.' };
      }
    },
    async verifyWebhook(input) {
      if (!input.signatureHeader || !input.requestId || !input.dataId) {
        return { valid: false, error: 'Cabeçalhos do webhook incompletos.' };
      }

      try {
        WebhookSignatureValidator.validate({
          xSignature: input.signatureHeader,
          xRequestId: input.requestId,
          dataId: input.dataId,
          secret: webhookSecret,
          toleranceSeconds: 300,
        });
      } catch {
        return { valid: false, error: 'Webhook do Mercado Pago inválido.' };
      }

      let payment;
      try {
        payment = await paymentClient.get({ id: input.dataId });
      } catch {
        return { valid: false, error: 'Mercado Pago indisponível.', retryable: true };
      }

      const paymentId = payment.external_reference;
      const providerTransactionId = payment.id;
      const type = payment.status ? eventTypeByStatus[payment.status] : undefined;
      if (!paymentId || !providerTransactionId || !type || payment.transaction_amount === undefined || !payment.currency_id) {
        return { valid: false, error: 'Pagamento do Mercado Pago inválido.' };
      }

      return {
        valid: true,
        event: {
          id: `mercadopago:${input.requestId}:${providerTransactionId}:${payment.status}`,
          type,
          providerTransactionId: String(providerTransactionId),
          paymentId,
          amountCents: Math.round(payment.transaction_amount * 100),
          currencyId: payment.currency_id,
        },
      };
    },
  };
}

export function getPaymentGateway(): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY_PROVIDER;
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const mercadoPagoAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const mercadoPagoWebhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (provider === 'mercadopago' && mercadoPagoAccessToken && mercadoPagoWebhookSecret) {
    return mercadoPagoGateway(mercadoPagoAccessToken, mercadoPagoWebhookSecret);
  }

  if (provider === 'generic-hmac' && secret) {
    return genericHmacGateway(secret);
  }

  // Outros provedores podem ser adicionados aqui sem expor credenciais ao cliente.

  return notConfiguredGateway;
}
