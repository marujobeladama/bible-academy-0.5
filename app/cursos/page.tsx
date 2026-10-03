import Image from 'next/image';
import Link from 'next/link';
import { MobileSiteMenu } from '@/components/MobileSiteMenu';
import { getSupabaseServer } from '@/lib/supabase-server';
import { resolvePublicImageUrl } from '@/lib/imgur';
import { formatPriceCents } from '@/lib/format';

type CatalogParams = { q?: string; price?: string; sort?: string };

export default async function CourseCatalog({ searchParams }: { searchParams: Promise<CatalogParams> }) {
  const params = await searchParams;
  const search = (params.q ?? '').trim();
  const price = params.price === 'free' || params.price === 'paid' ? params.price : 'all';
  const sort = params.sort === 'price-asc' || params.sort === 'price-desc' ? params.sort : 'newest';
  const supabase = await getSupabaseServer();

  let query = supabase
    .from('courses')
    .select('id, title, description, price_cents, image_url, created_at')
    .eq('published', true);

  if (search) {
    const escapedSearch = search.replace(/[%_\\]/g, (character) => `\\${character}`);
    query = query.ilike('title', `%${escapedSearch}%`);
  }
  if (price === 'free') query = query.eq('price_cents', 0);
  if (price === 'paid') query = query.gt('price_cents', 0);

  const { data } = await query.order(
    sort === 'newest' ? 'created_at' : 'price_cents',
    { ascending: sort === 'price-asc' },
  );
  const courses = await Promise.all((data ?? []).map(async (course) => ({
    ...course,
    imageSrc: await resolvePublicImageUrl(course.image_url),
  })));

  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Link className="brand" href="/">Bible <span>Academy</span></Link>
          <nav className="navlinks" aria-label="Navegação principal">
            <Link href="/">Início</Link>
            <Link href="/aulas-ao-vivo">Aulas ao vivo</Link>
          </nav>
          <MobileSiteMenu
            links={[
              { href: '/', label: 'Início' },
              { href: '/cursos', label: 'Cursos' },
              { href: '/aulas-ao-vivo', label: 'Aulas ao vivo' },
            ]}
            action={{ href: '/login', label: 'Acessar plataforma' }}
          />
          <Link className="button" href="/login">Acessar plataforma</Link>
        </div>
      </header>
      <main className="course-catalog-page">
        <section className="course-catalog-hero">
          <div className="container">
            <div className="eyebrow">Conhecimento • Escrituras • Formação</div>
            <h1>Catálogo de cursos</h1>
            <p>Encontre uma formação para aprofundar seu conhecimento bíblico, no seu ritmo.</p>
          </div>
        </section>
        <section className="container course-catalog-content">
          <form className="course-catalog-filters" action="/cursos" method="get">
            <div className="field catalog-search-field">
              <label htmlFor="catalog-search">Buscar cursos</label>
              <input id="catalog-search" type="search" name="q" defaultValue={search} placeholder="Digite o nome do curso" />
            </div>
            <div className="field">
              <label htmlFor="catalog-price">Faixa de preço</label>
              <select id="catalog-price" name="price" defaultValue={price}>
                <option value="all">Todos</option>
                <option value="free">Gratuitos</option>
                <option value="paid">Pagos</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="catalog-sort">Ordenar por</label>
              <select id="catalog-sort" name="sort" defaultValue={sort}>
                <option value="newest">Mais recentes</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
              </select>
            </div>
            <div className="course-catalog-actions">
              <button className="button small" type="submit">Aplicar filtros</button>
              <Link className="button secondary small" href="/cursos">Limpar</Link>
            </div>
          </form>

          <div className="catalog-results-heading">
            <h2>{search || price !== 'all' ? 'Resultados' : 'Todos os cursos'}</h2>
            <span className="muted">{courses.length} {courses.length === 1 ? 'curso' : 'cursos'}</span>
          </div>
          {courses.length === 0 ? (
            <div className="live-empty">
              <div className="eyebrow">Catálogo</div>
              <h2>Nenhum curso encontrado</h2>
              <p className="muted">Tente outro termo ou remova algum filtro.</p>
            </div>
          ) : (
            <div className="cards">
              {courses.map((course) => (
                <Link className="card catalog-course-card" key={course.id} href={`/cursos/${course.id}`}>
                  <div className="catalog-course-cover">
                    {course.imageSrc && (
                      <Image src={course.imageSrc} alt={`Capa do curso ${course.title}`} fill unoptimized sizes="(max-width: 800px) 100vw, 33vw" />
                    )}
                    <span>FORMAÇÃO BÍBLICA</span>
                  </div>
                  <div className="eyebrow">Curso</div>
                  <h3>{course.title}</h3>
                  <p className="muted catalog-course-description">{course.description || 'Conheça o conteúdo deste curso.'}</p>
                  <p className="catalog-course-price">{formatPriceCents(course.price_cents)}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}