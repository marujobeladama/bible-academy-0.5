import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientKey: vi.fn(),
  getPaymentGateway: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/payments/gateway", () => ({
  getPaymentGateway: mocks.getPaymentGateway,
}));
vi.mock("@/lib/security", () => ({
  clientKey: mocks.clientKey,
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/payment/route";

const paymentId = "00000000-0000-4000-8000-000000000001";
const providerTransactionId = "123456789";

function createRequest() {
  return new NextRequest(
    `http://localhost:3000/api/webhooks/payment?data.id=${providerTransactionId}`,
    {
      method: "POST",
      headers: {
        "x-signature": "test-signature",
        "x-request-id": "test-request-id",
      },
      body: JSON.stringify({ action: "payment.updated" }),
    },
  );
}

function configureWebhook(amountCents = 2500) {
  const event = {
    id: "mercadopago:test-request-id:123456789:approved",
    type: "approved",
    providerTransactionId,
    paymentId,
    amountCents,
    currencyId: "BRL",
  } as const;
  const paymentQuery = {
    eq: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({
        data: { amount_cents: 2500, provider: "mercadopago" },
        error: null,
      }),
    select: vi.fn(),
  };
  paymentQuery.select.mockReturnValue(paymentQuery);
  paymentQuery.eq.mockReturnValue(paymentQuery);
  const rpc = vi
    .fn()
    .mockResolvedValue({
      data: [{ already_processed: false, enrollment_created: true }],
      error: null,
    });
  mocks.getPaymentGateway.mockReturnValue({
    configured: true,
    name: "mercadopago",
    verifyWebhook: vi.fn().mockResolvedValue({ valid: true, event }),
  });
  mocks.getSupabaseAdmin.mockReturnValue({
    from: vi.fn(() => paymentQuery),
    rpc,
  });
  return { event, rpc };
}

describe("POST /api/webhooks/payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientKey.mockReturnValue("test-client");
    mocks.rateLimit.mockReturnValue({ ok: true });
  });

  it("confirms only a reconciled approved payment", async () => {
    const { rpc, event } = configureWebhook();

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("confirm_payment", {
      p_payment_id: paymentId,
      p_provider_transaction_id: providerTransactionId,
      p_webhook_event_id: event.id,
    });
  });

  it("does not enroll when the reported amount differs from the stored amount", async () => {
    const { rpc } = configureWebhook(1000);

    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
