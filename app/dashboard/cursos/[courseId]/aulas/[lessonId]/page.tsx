import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { LessonVideo } from '@/components/LessonVideo';
import { CompleteLessonButton } from '@/components/CompleteLessonButton';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS ("enrolled lessons") já garante que isto só retorna dado se o aluno
  // tiver matrícula no curso E a aula/módulo estiverem publicados.
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, description, video_path, modules(course_id, title)')
    .eq('id', lessonId)
    .single();

  const lessonModule = Array.isArray(lesson?.modules) ? lesson.modules[0] : lesson?.modules;

  if (!lesson || (lessonModule as { course_id?: string } | null)?.course_id !== courseId) {
    notFound();
  }

  const { data: courseModules } = await supabase
    .from('modules')
    .select('id, position, lessons(id, title, position)')
    .eq('course_id', courseId)
    .eq('published', true)
    .order('position', { ascending: true });
  const orderedCourseLessons = (courseModules ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((module) =>
      (module.lessons ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((courseLesson) => ({ id: courseLesson.id, title: courseLesson.title })),
    );
  const currentLessonIndex = orderedCourseLessons.findIndex((courseLesson) => courseLesson.id === lessonId);
  const previousLesson = currentLessonIndex > 0 ? orderedCourseLessons[currentLessonIndex - 1] : null;
  const nextLesson = currentLessonIndex >= 0 ? orderedCourseLessons[currentLessonIndex + 1] ?? null : null;

  const { data: materials } = await supabase
    .from('materials')
    .select('id, name')
    .eq('lesson_id', lessonId);

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('completed')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  return (
    <div className="panel">
      <Link href={`/dashboard/cursos/${courseId}`} className="lesson-course-back">
        ← Conteúdo do curso
      </Link>
      <h1 style={{ marginTop: 10 }}>{lesson.title}</h1>

      {lesson.video_path && (
        <div style={{ marginTop: 16 }}>
          <LessonVideo lessonId={lessonId} />
        </div>
      )}

      {lesson.description && <p className="muted" style={{ marginTop: 16 }}>{lesson.description}</p>}

      {(materials ?? []).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16 }}>Materiais</h3>
          <div className="material-list">
            {(materials ?? []).map((m) => (
              <div className="material-row" key={m.id}>
                <span>{m.name}</span>
                <a className="button small secondary" href={`/api/materials/${m.id}/download`} target="_blank" rel="noreferrer">
                  Baixar
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <CompleteLessonButton lessonId={lessonId} initiallyCompleted={!!progress?.completed} />
      </div>

      <nav className="lesson-navigation" aria-label="Navegação entre aulas">
        {previousLesson ? (
          <Link className="lesson-navigation-link lesson-navigation-previous" href={`/dashboard/cursos/${courseId}/aulas/${previousLesson.id}`}>
            <span>AULA ANTERIOR</span>
            <strong>{previousLesson.title}</strong>
          </Link>
        ) : (
          <span className="lesson-navigation-edge">Início do curso</span>
        )}
        <Link className="lesson-navigation-course" href={`/dashboard/cursos/${courseId}`}>Ver todas as aulas</Link>
        {nextLesson ? (
          <Link className="lesson-navigation-link lesson-navigation-next" href={`/dashboard/cursos/${courseId}/aulas/${nextLesson.id}`}>
            <span>PRÓXIMA AULA</span>
            <strong>{nextLesson.title}</strong>
          </Link>
        ) : (
          <span className="lesson-navigation-edge lesson-navigation-next">Fim do curso</span>
        )}
      </nav>
    </div>
  );
}
