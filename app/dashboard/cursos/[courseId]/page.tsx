import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatDuration } from '@/lib/format';
import { isCourseComplete } from '@/lib/progress';
import { ModuleAssessment } from '@/components/ModuleAssessment';

export default async function CourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // A consulta abaixo só retorna algo se a policy RLS "published courses visible"
  // permitir — ou seja, se o aluno tiver matrícula (ou o curso for público).
  // Isso é a segunda camada: mesmo que alguém troque o :courseId na URL para
  // um curso que não possui, o banco simplesmente não devolve a linha.
  const { data: course } = await supabase.from('courses').select('id, title, description').eq('id', courseId).single();
  if (!course) notFound();

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!enrollment) {
    return (
      <div className="panel">
        <div className="eyebrow">Curso</div>
        <h1>{course.title}</h1>
        <p className="muted">Você ainda não tem acesso a este curso.</p>
        <Link className="button" href="/dashboard" style={{ marginTop: 16, display: 'inline-flex' }}>
          Voltar
        </Link>
      </div>
    );
  }

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, position, lessons(id, title, position, duration_seconds)')
    .eq('course_id', courseId)
    .eq('published', true)
    .order('position', { ascending: true });
  const moduleIds = (modules ?? []).map((module) => module.id);
  const { data: assessments } = moduleIds.length
    ? await supabase
        .from('module_assessments')
        .select('id, module_id, title, pass_percentage, assessment_questions(id, prompt, options, position)')
        .in('module_id', moduleIds)
        .eq('published', true)
    : { data: [] };
  const assessmentByModule = new Map((assessments ?? []).map((assessment) => [assessment.module_id, assessment]));

  const { data: liveClasses } = await supabase
    .from('live_classes')
    .select('id, title, description, starts_at, ends_at, status, created_by')
    .eq('course_id', courseId)
    .order('starts_at', { ascending: false });
  const creatorIds = [...new Set((liveClasses ?? []).map((liveClass) => liveClass.created_by).filter(Boolean))];
  const { data: liveCreators } = creatorIds.length
    ? await supabase.from('profiles').select('id, live_provider, live_url').in('id', creatorIds)
    : { data: [] as Array<{ id: string; live_provider: string | null; live_url: string | null }> };
  const liveCreatorMap = new Map((liveCreators ?? []).map((profile) => [profile.id, profile]));

  const lessonIds = (modules ?? []).flatMap((m) => (m.lessons ?? []).map((l: { id: string }) => l.id));
  let completedIds = new Set<string>();
  if (lessonIds.length > 0) {
    const { data: progressRows } = await supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', user.id)
      .eq('completed', true)
      .in('lesson_id', lessonIds);
    completedIds = new Set((progressRows ?? []).map((p) => p.lesson_id));
  }

  const orderedModules = (modules ?? []).slice().sort((a, b) => a.position - b.position);
  const orderedLessons = orderedModules
    .flatMap((m) =>
      (m.lessons ?? [])
        .slice()
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
    ) as { id: string }[];
  const continueLesson = orderedLessons.find((l) => !completedIds.has(l.id)) ?? orderedLessons[orderedLessons.length - 1];
  const courseComplete = isCourseComplete({ totalLessons: orderedLessons.length, completedLessons: completedIds.size });

  return (
    <div className="panel">
      <div className="toolbar">
        <div>
          <div className="eyebrow">Curso</div>
          <h1 style={{ margin: '4px 0' }}>{course.title}</h1>
        </div>
        {continueLesson && (
          <div className="course-detail-actions">
            <Link className="button" href={`/dashboard/cursos/${courseId}/aulas/${continueLesson.id}`}>
              {courseComplete ? 'Rever última aula' : 'Continuar estudando'}
            </Link>
            {courseComplete && <Link className="button secondary" href={`/dashboard/cursos/${courseId}/certificado`}>Emitir certificado</Link>}
          </div>
        )}
      </div>
      <p className="muted">{course.description}</p>

      {(liveClasses ?? []).length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="eyebrow">Aulas ao vivo</div>
          <h3 style={{ margin: '8px 0 18px' }}>Agenda do curso</h3>
          {liveClasses?.map((liveClass) => {
            const creator = liveCreatorMap.get(liveClass.created_by);
            const canJoin = liveClass.status === 'live' && !!creator?.live_url;
            return (
              <div key={liveClass.id} className="live-course-box" style={{ marginTop: 12 }}>
                <div className="live-course-meta">
                  <span className={`badge ${liveClass.status === 'live' ? 'success' : 'warn'}`}>
                    {liveClass.status === 'live' ? 'Ao vivo agora' : 'Agendada'}
                  </span>
                  <strong>{liveClass.title}</strong>
                </div>
                <p className="muted">{liveClass.description || 'Sem descrição.'}</p>
                <p className="muted">
                  {new Date(liveClass.starts_at).toLocaleString('pt-BR')}
                  {liveClass.ends_at ? ` · até ${new Date(liveClass.ends_at).toLocaleString('pt-BR')}` : ''}
                </p>
                <a className="live-calendar-link" href={`/api/live-classes/${liveClass.id}/calendar`} title="Inclui um lembrete 30 minutos antes">
                  <span>Adicionar ao calendário</span>
                  <small>Lembrete 30 min antes</small>
                </a>
                {canJoin ? (
                  <a className="button" href={creator?.live_url ?? '#'} target="_blank" rel="noreferrer noopener">
                    Entrar na live
                  </a>
                ) : (
                  <p className="muted">{liveClass.status === 'live' ? 'A live está ativa para alunos do curso.' : 'A live ainda não abriu para entrada.'}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(modules ?? []).length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>
          O conteúdo deste curso ainda está sendo preparado.
        </p>
      )}

      {orderedModules.map((mod) => (
          <div key={mod.id} style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{mod.title}</h3>
            <div className="lesson-list">
              {(mod.lessons ?? [])
                .slice()
                .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
                .map((lesson: { id: string; title: string; duration_seconds: number | null }) => (
                  <Link
                    key={lesson.id}
                    href={`/dashboard/cursos/${courseId}/aulas/${lesson.id}`}
                    className={`lesson-row${completedIds.has(lesson.id) ? ' done' : ''}`}
                  >
                    <span>{completedIds.has(lesson.id) ? '✓ ' : ''}{lesson.title}</span>
                    <span className="muted">{formatDuration(lesson.duration_seconds)}</span>
                  </Link>
                ))}
            </div>
            {assessmentByModule.get(mod.id) && (
              <ModuleAssessment
                assessmentId={assessmentByModule.get(mod.id)!.id}
                title={assessmentByModule.get(mod.id)!.title}
                passPercentage={assessmentByModule.get(mod.id)!.pass_percentage}
                questions={(assessmentByModule.get(mod.id)!.assessment_questions ?? []).slice().sort((first, second) => first.position - second.position)}
              />
            )}
          </div>
        ))}
    </div>
  );
}
