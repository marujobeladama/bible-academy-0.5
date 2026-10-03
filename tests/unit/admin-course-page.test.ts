import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, notFoundMock, getSupabaseServerMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  getSupabaseServerMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseServer: getSupabaseServerMock,
}));

import AdminCoursePage from '../../app/admin/cursos/[courseId]/page';

describe('AdminCoursePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getSupabaseServerMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'admin@example.com' } },
        }),
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
              }),
            }),
          };
        }

        if (table === 'courses') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              order: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        };
      },
    });
  });

  it('redirects back to the course list when the course does not exist', async () => {
    await expect(
      AdminCoursePage({ params: Promise.resolve({ courseId: 'missing-course' }) }),
    ).rejects.toThrow('REDIRECT:/admin/cursos');

    expect(redirectMock).toHaveBeenCalledWith('/admin/cursos');
  });
});
