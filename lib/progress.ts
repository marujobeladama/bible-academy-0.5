export interface ProgressInput {
  totalLessons: number;
  completedLessons: number;
}

export function calcProgressPercent({ totalLessons, completedLessons }: ProgressInput): number {
  if (totalLessons <= 0) return 0;
  return Math.round((completedLessons / totalLessons) * 100);
}

export interface LessonProgressEntry {
  lesson_id: string;
  completed: boolean;
  progress_seconds: number;
  updated_at: string;
}

export function selectResumeLessonId(
  orderedLessonIds: readonly string[],
  progressEntries: readonly LessonProgressEntry[],
): string | null {
  if (orderedLessonIds.length === 0) return null;

  const courseLessonIds = new Set(orderedLessonIds);
  const latestUnfinishedProgress = progressEntries
    .filter((entry) => courseLessonIds.has(entry.lesson_id) && !entry.completed && entry.progress_seconds > 0)
    .slice()
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

  if (latestUnfinishedProgress) return latestUnfinishedProgress.lesson_id;

  const completedLessonIds = new Set(progressEntries.filter((entry) => entry.completed).map((entry) => entry.lesson_id));
  return orderedLessonIds.find((lessonId) => !completedLessonIds.has(lessonId)) ?? orderedLessonIds.at(-1) ?? null;
}

export function isCourseComplete({ totalLessons, completedLessons }: ProgressInput) {
  return totalLessons > 0 && completedLessons >= totalLessons;
}
