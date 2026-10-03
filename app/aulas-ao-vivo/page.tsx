import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseServer } from '@/lib/supabase-server';
import { canUserJoinLiveClass, formatLiveClassStatus, formatLiveProvider, sortLiveClasses } from '@/lib/live-classes';
import { resolvePublicImageUrl } from '@/lib/imgur';
import { MobileSiteMenu } from '@/components/MobileSiteMenu';

export default async function LiveClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; status?: string }>;
}) {
  const params = await searchParams;
  const selectedCourseId = params.courseId ?? '';
  const selectedStatus = params.status ?? 'all';

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [coursesResult, profilesResult, liveClassesResult, enrollmentResult] = await Promise.all([
    supabase.from('courses').select('id, title, image_url').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, name, live_provider, live_url').order('name'),
    supabase.from('live_classes').select('id, course_id, title, description, starts_at, ends_at, status, created_by').order('starts_at', { ascending: false }),
    user
      ? supabase.from('enrollments').select('course_id').eq('user_id', user.id)
      : Promise.resolve({ data: [] as Array<{ course_id: string }> }),
  ]);

  const courseRows = coursesResult.data ?? [];
  const profileRows = profilesResult.data ?? [];
  const courseCards = await Promise.all(courseRows.map(async (course) => ({
    title: course.title,
    imageSrc: await resolvePublicImageUrl(course.image_url),
  })));
  const courseInfo = new Map<string, { title: string; imageSrc: string | null }>(
    courseRows.map((course, index) => [course.id, courseCards[index]]),
  );
  const profileMap = new Map<string, { id: string; name: string | null; live_provider: string | null; live_url: string | null }>(
    profileRows.map((profile) => [profile.id, profile]),
  );
  const enrolledCourseIds = new Set((enrollmentResult.data ?? []).map((row) => row.course_id));

  const isAdmin = user ? ((await supabase.from('profiles').select('role').eq('id', user.id).single()).data?.role === 'admin') : false;
  const managedCourseIds = new Set<string>();
  if (isAdmin) {
    courseRows.forEach((course) => managedCourseIds.add(course.id));
  } else if (user) {
    const { data: teacherCourses } = await supabase.from('courses').select('id').eq('teacher_id', user.id);
    (teacherCourses ?? []).forEach((course) => managedCourseIds.add(course.id));
  }

  const liveClasses = sortLiveClasses((liveClassesResult.data ?? []).filter((item) => {
    const matchCourse = selectedCourseId ? item.course_id === selectedCourseId : true;
    const matchStatus = selectedStatus === 'all' ? true : item.status === selectedStatus;
    return matchCourse && matchStatus;
  }));

  return (
    <>
      <header className="site-header live-site-header">
        <div className="container nav">
          <Link className="brand" href="/">Bible <span>Academy</span></Link>
          <nav className="navlinks">
            <Link href="/">Início</Link>
            <Link href="/cursos">Cursos</Link>
            {user ? <Link href="/dashboard">Meu painel</Link> : <Link href="/login">Entrar</Link>}
          </nav>
          <MobileSiteMenu
            links={[
              { href: '/', label: 'Início' },
              { href: '/cursos', label: 'Cursos' },
              ...(user ? [{ href: '/dashboard', label: 'Meu painel' }] : [{ href: '/login', label: 'Entrar' }]),
            ]}
            action={{ href: '/', label: 'Voltar para home' }}
          />
          <Link className="button" href="/">Voltar para home</Link>
        </div>
      </header>
      <main className="live-page">
        <section className="live-page-hero">
          <div className="container">
            <div className="eyebrow">Agenda • Bible Academy</div>
            <h1>Aulas ao vivo</h1>
            <p>Encontros para aprofundar o estudo das Escrituras e crescer em comunidade.</p>
          </div>
        </section>
        <section className="container live-page-content">
          <form className="live-filter" action="/aulas-ao-vivo" method="get">
        <div className="field">
          <label htmlFor="live-course-filter">Curso</label>
          <select id="live-course-filter" name="courseId" defaultValue={selectedCourseId}>
            <option value="">Todos os cursos</option>
            {courseRows.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="live-status-filter">Status</label>
          <select id="live-status-filter" name="status" defaultValue={selectedStatus}>
            <option value="all">Todos</option>
            <option value="live">Ao vivo</option>
            <option value="scheduled">Agendadas</option>
            <option value="ended">Encerradas</option>
          </select>
        </div>
        <div className="live-filter-actions">
          <button className="button small" type="submit">Filtrar</button>
          <Link className="button secondary small" href="/aulas-ao-vivo">Limpar</Link>
        </div>
          </form>

          {liveClasses.length === 0 ? (
            <div className="live-empty">
              <div className="eyebrow">Agenda</div>
              <h2>Nenhum encontro nesta seleção</h2>
              <p className="muted">Ajuste os filtros ou volte em breve para conferir as próximas aulas.</p>
            </div>
          ) : (
            <div className="cards live-event-grid">
              {liveClasses.map((item) => {
            const creatorProfile = item.created_by ? profileMap.get(item.created_by) : null;
                const course = courseInfo.get(item.course_id);
                const courseTitle = course?.title ?? 'Curso';
            const canJoin = canUserJoinLiveClass({
              status: item.status,
              isManager: managedCourseIds.has(item.course_id),
              isEnrolled: enrolledCourseIds.has(item.course_id),
            });
            const canView = !!creatorProfile?.live_url || user != null;

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
                  <div className={`live-event-status${item.status === 'live' ? ' is-live' : ''}`}>
                    {item.status === 'live' && <span className="live-dot" aria-hidden="true" />}
                    {formatLiveClassStatus(item.status as any)}
                  </div>
                  <h2>{item.title}</h2>
                  <p className="live-event-course">{courseTitle}</p>
                  <p className="muted live-event-description">{item.description || 'Sem descrição informada.'}</p>
                  <p className="live-event-time">
                    {new Date(item.starts_at).toLocaleString('pt-BR')}
                    {item.ends_at ? ` · até ${new Date(item.ends_at).toLocaleString('pt-BR')}` : ''}
                  </p>

                  {creatorProfile && (
                    <p className="muted live-event-platform">
                      Plataforma: {formatLiveProvider(creatorProfile.live_provider)}
                    </p>
                  )}

                  {canJoin && creatorProfile?.live_url ? (
                    <a className="button" href={creatorProfile.live_url} target="_blank" rel="noreferrer noopener">
                      Entrar na aula ao vivo
                    </a>
                  ) : (
                    <p className="muted live-event-access">
                      {item.status === 'live' ? 'Acesso restrito aos alunos matriculados e a quem gerencia o curso.' : 'A aula ainda não está aberta.'}
                    </p>
                  )}

                  <a className="live-calendar-link" href={`/api/live-classes/${item.id}/calendar`} title="Inclui um lembrete 30 minutos antes">
                    <span>Adicionar ao calendário</span>
                    <small>Lembrete 30 min antes</small>
                  </a>

                  {!canJoin && !canView && <p className="muted">Faça login para ver a agenda completa.</p>}
                </article>
              );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
