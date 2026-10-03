import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatPriceCents } from '@/lib/format';
import { getSiteDesign } from '@/lib/site-design';
import { resolvePublicImageUrl } from '@/lib/imgur';
import { MobileSiteMenu } from '@/components/MobileSiteMenu';
import { sortLiveClasses } from '@/lib/live-classes';

export default async function Home() {
  const supabase = await getSupabaseServer();
  const design = await getSiteDesign();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null };
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, description, price_cents, image_url')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(6);
  const { data: liveClasses } = await supabase
    .from('live_classes')
    .select('id, title, course_id, status, starts_at')
    .in('status', ['live', 'scheduled'])
    .order('starts_at', { ascending: true });

  const dashboardHref = profile?.role === 'admin' ? '/admin/cursos' : '/dashboard';
  const homeLiveClasses = sortLiveClasses(liveClasses ?? []).slice(0, 6);
  const activeLiveClass = homeLiveClasses.find((liveClass) => liveClass.status === 'live') ?? null;
  const liveCourseIds = [...new Set(homeLiveClasses.map((liveClass) => liveClass.course_id))];
  const { data: liveCourseRows } = liveCourseIds.length
    ? await supabase.from('courses').select('id, title, image_url').in('id', liveCourseIds)
    : { data: [] as Array<{ id: string; title: string; image_url: string | null }> };
  const liveCourseCards = await Promise.all((liveCourseRows ?? []).map(async (course) => ({
    ...course,
    imageSrc: await resolvePublicImageUrl(course.image_url),
  })));
  const liveCourseInfo = new Map(liveCourseCards.map((course) => [course.id, course]));
  const liveByCourse = new Map(homeLiveClasses.map((liveClass) => [liveClass.course_id, liveClass]));
  const [heroImage, coursesWithImages] = await Promise.all([
    resolvePublicImageUrl(design.hero_image_url),
    Promise.all(
      (courses ?? []).map(async (course) => ({
        ...course,
        imageSrc: await resolvePublicImageUrl(course.image_url),
        live: liveByCourse.get(course.id) ?? null,
      })),
    ),
  ]);

  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <div className="brand">{design.brand_name}</div>
          <nav className="navlinks">
            <Link href="/cursos">Cursos</Link>
            <Link href="/aulas-ao-vivo">Aulas ao vivo</Link>
            <a href="#metodo">Como funciona</a>
            {user ? (
              <>
                <span className="muted">{user.email}</span>
                <Link href={dashboardHref}>Meu painel</Link>
              </>
            ) : (
              <Link href="/login">Entrar</Link>
            )}
          </nav>
          <MobileSiteMenu
            links={[
              { href: '/cursos', label: 'Cursos' },
              { href: '/aulas-ao-vivo', label: 'Aulas ao vivo' },
              { href: '#metodo', label: 'Como funciona' },
              ...(user ? [{ href: dashboardHref, label: 'Meu painel' }] : [{ href: '/login', label: 'Entrar' }]),
            ]}
            action={{ href: user ? dashboardHref : '/login', label: 'Acessar plataforma' }}
          />
          <Link className="button" href={user ? dashboardHref : '/login'}>Acessar plataforma</Link>
        </div>
        {activeLiveClass && (
          <div className="live-topbar">
            <div className="container live-topbar-inner">
              <span className="live-pill">
                <span className="live-dot" aria-hidden="true" />
                AO VIVO
              </span>
              <span>{activeLiveClass.title} · {liveCourseInfo.get(activeLiveClass.course_id)?.title ?? 'Curso'}</span>
              <Link href={`/aulas-ao-vivo?courseId=${activeLiveClass.course_id}`}>Entrar agora</Link>
            </div>
          </div>
        )}
      </header>
      <main>
        <section className="hero">
          <div className="container hero-inner">
            <div>
              <div className="eyebrow">Conhecimento • Escrituras • Formação</div>
              <h1>{design.hero_title}</h1>
              <p>{design.hero_description}</p>
              <div className="hero-actions">
                <a className="button" href="#cursos">Explorar cursos</a>
                <Link className="button secondary" href="/signup">Criar conta</Link>
              </div>
            </div>
            <div className={`hero-card${heroImage ? ' hero-card-image' : ''}`}>
              {heroImage && (
                <Image src={heroImage} alt="Imagem de destaque" fill unoptimized preload sizes="(max-width: 800px) 100vw, 40vw" className="hero-background" />
              )}
              <div className="small">BIBLE ACADEMY / ESTUDO</div>
              <div className="verse">“Conheçamos e prossigamos em conhecer o Senhor.”</div>
              <div className="small">Oséias 6:3</div>
            </div>
          </div>
        </section>

        {homeLiveClasses.length > 0 && (
          <section className="container section">
            <div className="eyebrow">Ao vivo</div>
            <h2>Lives em andamento e próximas.</h2>
            <div className="cards">
              {homeLiveClasses.map((liveClass) => {
                const course = liveCourseInfo.get(liveClass.course_id);
                return (
                  <article key={liveClass.id} className="card live-card live-home-card">
                    <div className="live-home-cover">
                      {course?.imageSrc && (
                        <Image src={course.imageSrc} alt={`Capa do curso ${course.title}`} fill unoptimized sizes="(max-width: 800px) 100vw, 33vw" />
                      )}
                      <span className={`live-badge ${liveClass.status === 'live' ? 'live' : 'upcoming'}`}>
                        <span className="live-dot" aria-hidden="true" />
                        {liveClass.status === 'live' ? 'Ao vivo agora' : 'Próxima live'}
                      </span>
                      <div className="live-home-course">{course?.title ?? 'Curso'}</div>
                    </div>
                    <div className="live-home-details">
                      <h3><Link href={`/aulas-ao-vivo?courseId=${liveClass.course_id}`}>{liveClass.title}</Link></h3>
                      <p className="muted">{new Date(liveClass.starts_at).toLocaleString('pt-BR')}</p>
                      <div className="live-home-actions">
                        <Link className="button small" href={`/aulas-ao-vivo?courseId=${liveClass.course_id}`}>Ver aula</Link>
                        <a className="live-calendar-link" href={`/api/live-classes/${liveClass.id}/calendar`} title="Inclui um lembrete 30 minutos antes">
                          <span>Adicionar ao calendário</span>
                          <small>Lembrete 30 min antes</small>
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section id="cursos" className="container section">
          <div className="eyebrow">Catálogo</div>
          <h2>Aprenda no seu ritmo.</h2>
          <p className="muted">Cursos organizados em módulos e aulas, com materiais e vídeo protegido.</p>

          {(courses ?? []).length === 0 ? (
            <div className="cards">
              <article className="card">
                <div className="eyebrow">Em breve</div>
                <h3>Novos cursos chegando</h3>
                <p className="muted">Nenhum curso publicado no momento. Volte em breve.</p>
              </article>
            </div>
          ) : (
            <div className="cards">
              {coursesWithImages.map((c, i) => (
                <Link className="card" key={c.id} href={`/cursos/${c.id}`}>
                  {c.imageSrc && (
                    <Image
                      src={c.imageSrc}
                      alt={`Capa do curso ${c.title}`}
                      width={640}
                      height={360}
                      unoptimized
                      loading="lazy"
                      sizes="(max-width: 800px) 100vw, 33vw"
                      style={{ width: '100%', height: 'auto', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 12, marginBottom: 16 }}
                    />
                  )}
                  <div className="eyebrow">
                    {c.live ? (
                      c.live.status === 'live' ? (
                        <span className="live-badge live">
                          <span className="live-dot" aria-hidden="true" />
                          Ao vivo agora
                        </span>
                      ) : (
                        'Live agendada'
                      )
                    ) : String(i + 1).padStart(2, '0')}
                  </div>
                  <h3>{c.title}</h3>
                  <p className="muted">{c.description}</p>
                  <p style={{ fontWeight: 800 }}>{formatPriceCents(c.price_cents)}</p>
                </Link>
              ))}
            </div>
          )}
          <div className="course-catalog-link">
            <Link className="button secondary small" href="/cursos">Ver catálogo completo</Link>
          </div>
        </section>

        <section id="metodo" className="container section">
          <div className="card">
            <div className="eyebrow">Construído para crescer</div>
            <h2>Uma base, muitos cursos.</h2>
            <p className="muted">
              O administrador cria cursos, módulos e aulas diretamente pelo painel, sem editar código. Cada
              aluno acessa somente os cursos que possui, com progresso e materiais organizados por aula.
            </p>
          </div>
        </section>
      </main>
      <footer className="container footer">© {new Date().getFullYear()} {design.brand_name}.</footer>
    </>
  );
}
