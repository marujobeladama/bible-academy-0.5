export type LiveClassStatus = 'scheduled' | 'live' | 'ended';

export function sortLiveClasses<T extends { status: string; starts_at: string }>(liveClasses: readonly T[]): T[] {
  const statusPriority: Record<string, number> = { live: 0, scheduled: 1, ended: 2 };
  return [...liveClasses].sort((first, second) => {
    const priorityDifference = (statusPriority[first.status] ?? 3) - (statusPriority[second.status] ?? 3);
    if (priorityDifference !== 0) return priorityDifference;

    const timeDifference = Date.parse(first.starts_at) - Date.parse(second.starts_at);
    return first.status === 'ended' ? -timeDifference : timeDifference;
  });
}

export function canUserSeeLiveClass({
  status,
  isManager,
  isEnrolled,
}: {
  status: LiveClassStatus;
  isManager?: boolean;
  isEnrolled?: boolean;
}) {
  return status === 'scheduled' || status === 'live' || status === 'ended' || Boolean(isManager) || Boolean(isEnrolled);
}

export function canUserJoinLiveClass({
  status,
  isManager,
  isEnrolled,
}: {
  status: LiveClassStatus;
  isManager?: boolean;
  isEnrolled?: boolean;
}) {
  return status === 'live' && (Boolean(isManager) || Boolean(isEnrolled));
}

export function formatLiveClassStatus(status: LiveClassStatus) {
  switch (status) {
    case 'live':
      return 'Ao vivo';
    case 'scheduled':
      return 'Agendada';
    case 'ended':
      return 'Encerrada';
    default:
      return status;
  }
}

export function formatLiveProvider(provider: string | null | undefined) {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet';
    case 'jitsi':
      return 'Jitsi';
    default:
      return 'Sala de live';
  }
}
