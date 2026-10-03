import { describe, expect, it } from "vitest";
import { calcProgressPercent, isCourseComplete, selectResumeLessonId } from "../../lib/progress";

describe("calcProgressPercent", () => {
  it("returns zero when a course has no lessons", () => {
    expect(calcProgressPercent({ totalLessons: 0, completedLessons: 0 })).toBe(
      0,
    );
  });

  it("rounds the completed lesson percentage to the nearest integer", () => {
    expect(calcProgressPercent({ totalLessons: 3, completedLessons: 2 })).toBe(
      67,
    );
  });

  it("returns one hundred when all lessons are complete", () => {
    expect(calcProgressPercent({ totalLessons: 4, completedLessons: 4 })).toBe(
      100,
    );
  });
});

describe("selectResumeLessonId", () => {
  it("resumes the most recently updated unfinished lesson with saved progress", () => {
    expect(selectResumeLessonId(["lesson-1", "lesson-2", "lesson-3"], [
      { lesson_id: "lesson-2", completed: false, progress_seconds: 40, updated_at: "2026-10-01T10:00:00Z" },
      { lesson_id: "lesson-3", completed: false, progress_seconds: 20, updated_at: "2026-10-02T10:00:00Z" },
    ])).toBe("lesson-3");
  });

  it("falls back to the first unfinished lesson", () => {
    expect(selectResumeLessonId(["lesson-1", "lesson-2", "lesson-3"], [
      { lesson_id: "lesson-1", completed: true, progress_seconds: 80, updated_at: "2026-10-01T10:00:00Z" },
    ])).toBe("lesson-2");
  });

  it("returns the last lesson for review when the course is complete", () => {
    expect(selectResumeLessonId(["lesson-1", "lesson-2"], [
      { lesson_id: "lesson-1", completed: true, progress_seconds: 80, updated_at: "2026-10-01T10:00:00Z" },
      { lesson_id: "lesson-2", completed: true, progress_seconds: 90, updated_at: "2026-10-02T10:00:00Z" },
    ])).toBe("lesson-2");
  });

  it("returns null when a course has no lessons", () => {
    expect(selectResumeLessonId([], [])).toBeNull();
  });
});

describe("isCourseComplete", () => {
  it("requires at least one lesson and completion of all lessons", () => {
    expect(isCourseComplete({ totalLessons: 0, completedLessons: 0 })).toBe(false);
    expect(isCourseComplete({ totalLessons: 3, completedLessons: 2 })).toBe(false);
    expect(isCourseComplete({ totalLessons: 3, completedLessons: 3 })).toBe(true);
  });
});
