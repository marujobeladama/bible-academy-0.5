import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import { EmptyState } from '@/components/EmptyState';
import { calcProgressPercent, selectResumeLessonId, type LessonProgressEntry } from '@/lib/progress';

export default async function Dashboard() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // layout já garante sessão

  // 1) Cursos que o aluno REALMENTE possui (matrícula), não o catálogo inteiro.
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('course_id, courses(id, title, description)')
    .eq('user_id', user.id);

  const courses = (enrollments ?? [])
    .flatMap((e) => {
      const course = Array.isArray(e.courses) ? e.courses[0] : e.courses;
      return course ? [course] : [];
    })
    .filter((c): c is NonNullable<typeof c> => !!c);

  const courseIds = courses.map((c) => c.id);

  // 2) Progresso real: aulas publicadas de cada curso matriculado x lesson_progress do aluno.
  const lessonsByCourse = new Map<string, Array<{ id: string; title: string; modulePosition: number; position: number }>>();
  const lessonTitleById = new Map<string, string>();
  let completedLessonIds = new Set<string>();
  let progressRows: LessonProgressEntry[] = [];

  if (courseIds.length > 0) {
    const { data: modules } = await supabase
      .from('modules')
      .select('id, course_id, position')
      .in('course_id', courseIds)
      .eq('published', true);

    const orderedModules = (modules ?? []).slice().sort((a, b) => a.position - b.position);
    const moduleIds = orderedModules.map((module) => module.id);
    const moduleToCourse = new Map(orderedModules.map((module) => [module.id, module.course_id]));
    const modulePositionById = new Map(orderedModules.map((module, index) => [module.id, index]));

    if (moduleIds.length > 0) {
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, module_id, title, position')
        .in('module_id', moduleIds)
        .eq('published', true);

      for (const lesson of lessons ?? []) {
        const courseId = moduleToCourse.get(lesson.module_id);
        if (!courseId) continue;
        const courseLessons = lessonsByCourse.get(courseId) ?? [];
        courseLessons.push({
          id: lesson.id,
          title: lesson.title,
          modulePosition: modulePositionById.get(lesson.module_id) ?? 0,
          position: lesson.position,
        });
        lessonsByCourse.set(courseId, courseLessons);
        lessonTitleById.set(lesson.id, lesson.title);
      }

      for (const courseLessons of lessonsByCourse.values()) {
        courseLessons.sort((a, b) => a.modulePosition - b.modulePosition || a.position - b.position);
      }

      const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
      if (lessonIds.length > 0) {
        const { data: progressData } = await supabase
          .from('lesson_progress')
          .select('lesson_id, completed, progress_seconds, updated_at')
          .eq('user_id', user.id)
          .in('lesson_id', lessonIds);
        progressRows = (progressData ?? []).map((row) => ({
          lesson_id: row.lesson_id,
          completed: row.completed,
          progress_seconds: row.progress_seconds,
          updated_at: row.updated_at,
        }));
        completedLessonIds = new Set(progressRows.filter((row) => row.completed).map((row) => row.lesson_id));
      }
    }
  }

  return (
    <div className="panel">
      <div className="eyebrow">Área do aluno</div>
      <h1>Continue seus estudos.</h1>
      <p className="muted">Seus cursos liberados aparecem aqui.</p>

      {courses.length === 0 ? (
        <div style={{ marginTop: 20 }}>
          <EmptyState
            title="Você ainda não possui cursos."
            description="Explore o catálogo e comece seus estudos."
          />
          <Link className="button" href="/cursos" style={{ marginTop: 16, display: 'inline-flex' }}>
            Ver cursos disponíveis
          </Link>
        </div>
      ) : (
        <div className="course-grid">
          {courses.map((course) => {
            const courseLessons = lessonsByCourse.get(course.id) ?? [];
            const lessonIds = courseLessons.map((lesson) => lesson.id);
            const total = lessonIds.length;
            const completed = lessonIds.filter((id) => completedLessonIds.has(id)).length;
            const percent = calcProgressPercent({ totalLessons: total, completedLessons: completed });
            const resumeLessonId = selectResumeLessonId(lessonIds, progressRows);
            const resumeLesson = resumeLessonId ? courseLessons.find((lesson) => lesson.id === resumeLessonId) : null;
            const hasPartialProgress = progressRows.some(
              (row) => row.lesson_id === resumeLessonId && !row.completed && row.progress_seconds > 0,
            );
            const courseComplete = total > 0 && completed === total;
            const actionLabel = total === 0
              ? 'Ver curso'
              : courseComplete
                ? 'Rever última aula'
                : hasPartialProgress
                  ? 'Retomar aula'
                  : completed > 0
                    ? 'Continuar estudando'
                    : 'Começar curso';
            const lessonHref = resumeLessonId
              ? `/dashboard/cursos/${course.id}/aulas/${resumeLessonId}`
              : `/dashboard/cursos/${course.id}`;
            return (
              <article className="card course-progress-card" key={course.id}>
                <div className="eyebrow">Curso</div>
                <h3>{course.title}</h3>
                <p className="muted">{course.description}</p>
                <div className="progress">
                  <i style={{ width: `${percent}%` }} />
                </div>
                <p className="muted course-progress-copy">
                  {total > 0 ? `${percent}% concluído (${completed}/${total} aulas)` : 'Conteúdo em preparação'}
                </p>
                {resumeLesson && <p className="course-resume-label">{courseComplete ? 'Revisar' : hasPartialProgress ? 'Retomar' : 'Próxima aula'}: {lessonTitleById.get(resumeLesson.id)}</p>}
                <Link className="button small" href={lessonHref}>{actionLabel}</Link>
                {courseComplete && <Link className="course-outline-link" href={`/dashboard/cursos/${course.id}/certificado`}>Emitir certificado</Link>}
                <Link className="course-outline-link" href={`/dashboard/cursos/${course.id}`}>Ver conteúdo do curso</Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
