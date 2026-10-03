import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseServer } from '@/lib/supabase-server';
import { canUserJoinLiveClass, formatLiveClassStatus, formatLiveProvider, sortLiveClasses } from '@/lib/live-classes';
import { resolvePublicImageUrl } from '@/lib/imgur';

export default async function DashboardLiveClassesPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, enrollmentsResult, courseResult, liveClassesResult] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('enrollments').select('course_id').eq('user_id', user.id),
    supabase.from('courses').select('id, title, teacher_id').eq('teacher_id', user.id),
    supabase.from('live_classes').select('id, course_id, title, description, starts_at, ends_at, status, created_by').order('starts_at', { ascending: false }),
  ]);

  const profile = profileResult.data;
  const enrolledCourseIds = new Set((enrollmentsResult.data ?? []).map((row) => row.course_id));
  const managedCourseIds = new Set((courseResult.data ?? []).map((course) => course.id));
  if (profile?.role === 'admin') {
    const { data: courses } = await supabase.from('courses').select('id').order('created_at', { ascending: false });
    (courses ?? []).forEach((course) => managedCourseIds.add(course.id));
  }

  const courseRows = (await supabase.from('courses').select('id, title, image_url')).data ?? [];
  const profileRows = (await supabase.from('profiles').select('id, name, live_provider, live_url')).data ?? [];
  const courseCards = await Promise.all(courseRows.map(async (course) => ({
    title: course.title,
    imageSrc: await resolvePublicImageUrl(course.image_url),
  })));
  const courseInfo = new Map<string, { title: string; imageSrc: string | null }>(
    courseRows.map((course, index) => [course.id, courseCards[index]]),
  );
  const profileMap = new Map<string, { id: string; name: string | null; live_provider: string | null; live_url: string | null }>(
    profileRows.map((profileRow) => [profileRow.id, profileRow]),
  );

  const visibleLiveClasses = sortLiveClasses((liveClassesResult.data ?? []).filter(
    (item) => enrolledCourseIds.has(item.course_id) || managedCourseIds.has(item.course_id),
  ));

  return (
    <main className="panel">
      <div className="eyebrow">Aulas ao vivo</div>
      <h1>Agenda do seu acesso</h1>
      <p className="muted">Veja as lives do curso e entre quando a sessão estiver aberta.</p>

      {visibleLiveClasses.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Ainda não há aulas ao vivo para os cursos do seu acesso.</p>
      ) : (
        <div className="cards" style={{ marginTop: 16 }}>
          {visibleLiveClasses.map((item) => {
            const creatorProfile = item.created_by ? profileMap.get(item.created_by) : null;
            const course = courseInfo.get(item.course_id);
            const courseTitle = course?.title ?? 'Curso';
            const canJoin = canUserJoinLiveClass({
              status: item.status,
              isManager: managedCourseIds.has(item.course_id),
              isEnrolled: enrolledCourseIds.has(item.course_id),
            });

            return (
              <article key={item.id} className="card live-event-card">
                <div className="live-event-cover">
                  {course?.imageSrc && (
                    <Image src={course.imageSrc} alt={`Capa do curso ${courseTitle}`} fill unoptimized sizes="(max-width: 800px) 100vw, 33vw" />
                  )}
                  <div className="live-event-cover-label">
                    <span>CURSO</span>
                    <strong>{courseTitle}</strong>
                  </div>
                </div>
                <div className="eyebrow">{formatLiveClassStatus(item.status as any)}</div>
                <h3>{item.title}</h3>
                <p className="muted">{item.description || 'Sem descrição.'}</p>
                <p className="muted">
                  {new Date(item.starts_at).toLocaleString('pt-BR')}
                  {item.ends_at ? ` · até ${new Date(item.ends_at).toLocaleString('pt-BR')}` : ''}
                </p>
                {creatorProfile && <p className="muted">Plataforma: {formatLiveProvider(creatorProfile.live_provider)}</p>}

                {canJoin && creatorProfile?.live_url ? (
                  <a className="button" href={creatorProfile.live_url} target="_blank" rel="noreferrer noopener">
                    Entrar na aula ao vivo
                  </a>
                ) : (
                  <p className="muted">{item.status === 'live' ? 'Acesso restrito' : 'Ainda não está liberada para entrada.'}</p>
                )}
                <a className="live-calendar-link" href={`/api/live-classes/${item.id}/calendar`} title="Inclui um lembrete 30 minutos antes">
                  <span>Adicionar ao calendário</span>
                  <small>Lembrete 30 min antes</small>
                </a>
              </article>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Link className="button secondary" href="/dashboard">Voltar</Link>
      </div>
    </main>
  );
}
