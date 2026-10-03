import { describe, expect, it } from 'vitest';
import { canUserJoinLiveClass, canUserSeeLiveClass, sortLiveClasses } from '@/lib/live-classes';

describe('live class access rules', () => {
  it('allows course managers and enrolled students to join only when live', () => {
    expect(canUserJoinLiveClass({ status: 'live', isManager: true, isEnrolled: false })).toBe(true);
    expect(canUserJoinLiveClass({ status: 'live', isManager: false, isEnrolled: true })).toBe(true);
    expect(canUserJoinLiveClass({ status: 'scheduled', isManager: true, isEnrolled: false })).toBe(false);
    expect(canUserJoinLiveClass({ status: 'live', isManager: false, isEnrolled: false })).toBe(false);
  });

  it('keeps scheduled and live classes visible to everyone in the public listing', () => {
    expect(canUserSeeLiveClass({ status: 'scheduled', isManager: false, isEnrolled: false })).toBe(true);
    expect(canUserSeeLiveClass({ status: 'live', isManager: false, isEnrolled: false })).toBe(true);
    expect(canUserSeeLiveClass({ status: 'ended', isManager: false, isEnrolled: false })).toBe(true);
  });
});

describe('sortLiveClasses', () => {
  it('places active sessions first and upcoming sessions in nearest-first order', () => {
    const sessions = [
      { id: 'far', status: 'scheduled' as const, starts_at: '2026-10-05T12:00:00Z' },
      { id: 'ended', status: 'ended' as const, starts_at: '2026-09-30T12:00:00Z' },
      { id: 'live', status: 'live' as const, starts_at: '2026-10-02T12:00:00Z' },
      { id: 'near', status: 'scheduled' as const, starts_at: '2026-10-03T12:00:00Z' },
    ];

    expect(sortLiveClasses(sessions).map((session) => session.id)).toEqual(['live', 'near', 'far', 'ended']);
  });
});
