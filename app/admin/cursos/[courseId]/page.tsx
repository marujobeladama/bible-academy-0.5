import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { CourseEditForm } from '@/components/admin/CourseEditForm';
import { LiveClassManager } from '@/components/admin/LiveClassManager';
import { ModuleManager } from '@/components/admin/ModuleManager';
import { ReviewModeration } from '@/components/admin/ReviewModeration';

export default async function AdminCourseEdit({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  // RLS ("published courses visible" + "teacher own course visible" +
  // admin bypass) decide sozinha se esta linha vem ou não — se um teacher
  // tentar acessar o curso de outro professor (não publicado), a query
  // simplesmente não devolve nada e cai no notFound() abaixo.
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, description, price_cents, published, image_url, teacher_id')
    .eq('id', courseId)
    .single();

  if (!course) redirect('/admin/cursos');
  if (!isAdmin && course.teacher_id !== user.id) redirect('/admin/cursos');

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, position, published, lessons(id, title, position, published)')
    .eq('course_id', courseId)
    .order('position', { ascending: true });

  const { data: liveClasses } = await supabase
    .from('live_classes')
    .select('id, title, description, starts_at, ends_at, status')
    .eq('course_id', courseId)
    .order('starts_at', { ascending: false });

  // course_reviews.user_id referencia auth.users, não public.profiles
  // diretamente — por isso o PostgREST não consegue embutir o nome do
  // aluno num único select; buscamos os perfis à parte e juntamos aqui.
  let reviewRows: Array<{ id: string; rating: number; comment: string; created_at: string; student_name: string }> = [];
  if (isAdmin) {
    const { data: reviews } = await supabase
      .from('course_reviews')
      .select('id, user_id, rating, comment, created_at')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });
    const userIds = [...new Set((reviews ?? []).map((r) => r.user_id))];
    const { data: reviewers } = userIds.length
      ? await supabase.from('profiles').select('id, name').in('id', userIds)
      : { data: [] as Array<{ id: string; name: string | null }> };
    const nameById = new Map((reviewers ?? []).map((p) => [p.id, p.name?.trim() || 'Aluno']));
    reviewRows = (reviews ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      student_name: nameById.get(r.user_id) ?? 'Aluno',
    }));
  }

  const teachers = isAdmin
    ? (
        await supabase.from('profiles').select('id, name, email').eq('role', 'teacher').order('name')
      ).data ?? []
    : [];
  const moduleList = modules ?? [];
  const lessonCount = moduleList.reduce((total, module) => total + module.lessons.length, 0);

  return (
    <div className="course-editor">
      <nav className="course-breadcrumb" aria-label="Navegação estrutural">
        <Link href="/admin/cursos">Cursos</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{course.title}</span>
      </nav>

      <header className="course-editor-header">
        <div>
          <div className="eyebrow">Editor do curso</div>
          <h1>{course.title}</h1>
        </div>
        <div className="course-editor-summary">
          <span className={`badge ${course.published ? 'success' : 'neutral'}`}>
            {course.published ? 'Publicado' : 'Rascunho'}
          </span>
          <span>{moduleList.length} módulos</span>
          <span>{lessonCount} aulas</span>
        </div>
      </header>

      <nav className="course-editor-nav" aria-label="Seções do editor">
        <a href="#course-settings">Dados do curso</a>
        <a href="#course-live">Aulas ao vivo</a>
        <a href="#course-content">Módulos e aulas <span>{moduleList.length}</span></a>
        {isAdmin && <a href="#course-reviews">Avaliações <span>{reviewRows.length}</span></a>}
      </nav>

      <section id="course-settings" className="panel course-editor-section">
        <div className="course-section-heading">
          <div className="eyebrow">Configuração</div>
          <h2>Dados do curso</h2>
        </div>
        <CourseEditForm course={course} readOnly={!isAdmin} teachers={teachers} />
      </section>

      <section id="course-live" className="course-editor-section">
        <LiveClassManager courseId={courseId} initialLiveClasses={liveClasses ?? []} />
      </section>

      <section id="course-content" className="course-editor-section">
        <div className="course-section-heading">
          <div>
            <div className="eyebrow">Estrutura do curso</div>
            <h2>Módulos e aulas</h2>
          </div>
          <p className="muted">
          Apenas módulos e aulas publicados ficam visíveis para alunos matriculados.
          </p>
        </div>
        <ModuleManager courseId={courseId} initialModules={moduleList} />
      </section>

      {isAdmin && (
        <section id="course-reviews" className="panel course-editor-section">
          <div className="course-section-heading">
            <div>
              <div className="eyebrow">Moderação</div>
              <h2>Avaliações</h2>
            </div>
            <p className="muted">
              Um aluno pode excluir a própria avaliação a qualquer momento; aqui você modera (exclui) qualquer
              avaliação em nome da plataforma, se necessário.
            </p>
          </div>
          <ReviewModeration reviews={reviewRows} />
        </section>
      )}
    </div>
  );
}
