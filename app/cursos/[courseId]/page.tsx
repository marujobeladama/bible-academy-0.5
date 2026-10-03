import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatDuration, formatPriceCents } from '@/lib/format';
import { BuyButton } from '@/components/BuyButton';
import { MobileSiteMenu } from '@/components/MobileSiteMenu';
import { resolvePublicImageUrl } from '@/lib/imgur';
import { CourseReviewForm } from '@/components/CourseReviewForm';

export default async function PublicCourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await getSupabaseServer();

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, description, price_cents, image_url')
    .eq('id', courseId)
    .eq('published', true)
    .single();

  if (!course) notFound();
  const courseImage = await resolvePublicImageUrl(course.image_url);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let alreadyOwned = false;
  if (user) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .maybeSingle();
    alreadyOwned = !!enrollment;
  }

  const [{ data: reviewSummaryRows }, { data: currentReview }] = await Promise.all([
    supabase.rpc('course_review_summary', { target_course: course.id }),
    user && alreadyOwned
      ? supabase.from('course_reviews').select('rating, comment').eq('course_id', course.id).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const reviewSummary = Array.isArray(reviewSummaryRows) ? reviewSummaryRows[0] : null;

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, lessons(id, title, duration_seconds)')
    .eq('course_id', courseId)
    .eq('published', true)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  const lessonRows = (modules ?? []).flatMap((module) => module.lessons ?? []);
  const totalDurationSeconds = lessonRows.reduce((total, lesson) => total + (lesson.duration_seconds ?? 0), 0);

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

  const firstModule = modules?.[0];
  const { data: firstLesson } = firstModule
    ? await supabase
        .from('lessons')
        .select('title, description, video_path')
        .eq('module_id', firstModule.id)
        .eq('published', true)
        .order('position', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const { data: signedPreview } = firstLesson?.video_path
    ? await supabase.storage.from('course-videos').createSignedUrl(firstLesson.video_path, 60 * 10)
    : { data: null };

  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Link className="brand" href="/">Bible <span>Academy</span></Link>
          <nav className="navlinks" aria-label="Navegação principal">
            <Link href="/">Início</Link>
            <Link href="/cursos">Cursos</Link>
            <Link href="/aulas-ao-vivo">Aulas ao vivo</Link>
          </nav>
          <MobileSiteMenu
            links={[
              { href: '/', label: 'Início' },
              { href: '/cursos', label: 'Cursos' },
              { href: '/aulas-ao-vivo', label: 'Aulas ao vivo' },
            ]}
            action={{ href: '/', label: 'Voltar para home' }}
          />
          <Link className="button" href="/">Voltar para home</Link>
        </div>
      </header>
      <main className="public-course-page">
      <section className={`public-course-hero${courseImage ? ' has-image' : ''}`}>
        {courseImage && (
          <Image src={courseImage} alt={`Capa do curso ${course.title}`} fill unoptimized sizes="100vw" className="public-course-hero-image" />
        )}
        <div className="container public-course-hero-content">
          <div className="eyebrow">Formação bíblica</div>
          <h1>{course.title}</h1>
          <p>{course.description || 'Uma jornada de estudo para aprofundar seu conhecimento das Escrituras.'}</p>
          <div className="public-course-stats">
            <span>{modules?.length ?? 0} {modules?.length === 1 ? 'módulo' : 'módulos'}</span>
            <span>{lessonRows.length} {lessonRows.length === 1 ? 'aula' : 'aulas'}</span>
            {totalDurationSeconds > 0 && <span>{formatDuration(totalDurationSeconds)} de conteúdo</span>}
          </div>
          <div className="public-course-purchase">
            <strong>{formatPriceCents(course.price_cents)}</strong>
            {alreadyOwned ? (
              <Link className="button" href={`/dashboard/cursos/${course.id}`}>Ir para o curso</Link>
            ) : (
              <BuyButton courseId={course.id} isLoggedIn={!!user} />
            )}
          </div>
        </div>
      </section>
      <div className="container public-course-content">
      <section className="panel course-preview-panel" aria-labelledby="course-preview-title">
        <div className="eyebrow">Prévia gratuita · primeira aula</div>
        {firstLesson ? (
          <>
            <h2 id="course-preview-title">{firstLesson.title}</h2>
            {signedPreview?.signedUrl ? (
              <div className="video-wrap" style={{ marginTop: 16 }}>
                <video src={signedPreview.signedUrl} controls preload="none" />
              </div>
            ) : (
              <p className="muted">O vídeo desta aula ainda não está disponível.</p>
            )}
            {firstLesson.description && <p className="muted" style={{ marginTop: 16 }}>{firstLesson.description}</p>}
          </>
        ) : (
          <p className="muted" id="course-preview-title">A prévia da primeira aula ainda não está disponível.</p>
        )}
      </section>

      <section className="panel course-reviews-section">
        <div className="eyebrow">Avaliação dos alunos</div>
        <h2>Como foi sua experiência?</h2>
        {Number(reviewSummary?.review_count) > 0 ? (
          <p className="course-review-average">
            <strong>{Number(reviewSummary.average_rating).toFixed(1)}</strong> / 5
            <span>{reviewSummary.review_count} {Number(reviewSummary.review_count) === 1 ? 'avaliação' : 'avaliações'}</span>
          </p>
        ) : (
          <p className="muted">Seja a primeira pessoa a avaliar este curso.</p>
        )}
        {user && alreadyOwned ? (
          <CourseReviewForm
            courseId={course.id}
            initialRating={currentReview?.rating}
            initialComment={currentReview?.comment}
          />
        ) : (
          <p className="muted">Matricule-se no curso para compartilhar sua avaliação.</p>
        )}
      </section>

      {(liveClasses ?? []).length > 0 && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="eyebrow">Aulas ao vivo</div>
          <h3 style={{ margin: '8px 0 18px' }}>Agenda do curso</h3>
          {liveClasses?.map((liveClass) => {
            const creator = liveCreatorMap.get(liveClass.created_by);
            const canJoin = liveClass.status === 'live' && alreadyOwned && !!creator?.live_url;
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
                  <p className="muted">{liveClass.status === 'live' ? 'A live está ativa para alunos matriculados.' : 'A live ainda não abriu para entrada.'}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(modules ?? []).length > 0 && (
        <div className="panel">
          <div className="eyebrow">O que você vai estudar</div>
          <h2 style={{ marginTop: 8 }}>Conteúdo do curso</h2>
          {(modules ?? []).map((m) => (
            <div key={m.id} style={{ marginBottom: 12 }}>
              <strong>{m.title}</strong>
              <ul className="muted" style={{ margin: '6px 0 0 18px' }}>
                {(m.lessons ?? []).map((lesson) => (
                  <li key={lesson.id}>{lesson.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      </div>
      </main>
    </>
  );
}
