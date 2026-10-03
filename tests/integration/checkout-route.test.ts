import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientKey: vi.fn(),
  getPaymentGateway: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  originGuard: vi.fn(),
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/payments/gateway", () => ({
  getPaymentGateway: mocks.getPaymentGateway,
}));
vi.mock("@/lib/security", () => ({
  clientKey: mocks.clientKey,
  originGuard: mocks.originGuard,
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/checkout/route";

const courseId = "00000000-0000-4000-8000-000000000001";

function mockQuery<T>(result: T) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function createRequest() {
  return new NextRequest("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ course_id: courseId }),
  });
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientKey.mockReturnValue("test-client");
    mocks.originGuard.mockReturnValue(null);
    mocks.rateLimit.mockReturnValue({ ok: true });
    mocks.getPaymentGateway.mockReturnValue({ configured: false });
  });

  it("does not create a pending payment while no gateway is configured", async () => {
    const courseQuery = mockQuery({
      data: {
        id: courseId,
        title: "Curso",
        price_cents: 2500,
        published: true,
      },
    });
    const enrollmentQuery = mockQuery({ data: null });
    const supabase = {
      from: vi.fn((table: string) =>
        table === "courses" ? courseQuery : enrollmentQuery,
      ),
    };
    mocks.requireUser.mockResolvedValue({
      supabase,
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        email: "student@example.com",
      },
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ configured: false });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects a course the student already owns before starting checkout", async () => {
    const courseQuery = mockQuery({
      data: {
        id: courseId,
        title: "Curso",
        price_cents: 2500,
        published: true,
      },
    });
    const enrollmentQuery = mockQuery({ data: { course_id: courseId } });
    mocks.requireUser.mockResolvedValue({
      supabase: {
        from: vi.fn((table: string) =>
          table === "courses" ? courseQuery : enrollmentQuery,
        ),
      },
      user: {
        id: "00000000-0000-4000-8000-000000000002",
        email: "student@example.com",
      },
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Você já possui este curso.",
    });
    expect(mocks.getPaymentGateway).not.toHaveBeenCalled();
  });
});
