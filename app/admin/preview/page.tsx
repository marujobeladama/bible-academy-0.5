import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getSupabaseServer } from '@/lib/supabase-server';

export default async function StudentPreviewCatalog() {
  const supabase = await getSupabaseServer();
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, description, published')
    .order('created_at', { ascending: false });

  return (
    <div className="panel">
      <div className="eyebrow">Prévia administrativa</div>
      <h1 style={{ margin: '4px 0' }}>Ver como aluno.</h1>
      <p className="muted">Explore cursos e aulas sem alterar matrículas ou progresso.</p>

      {(courses ?? []).length === 0 ? (
        <EmptyState title="Nenhum curso cadastrado ainda." description="Crie um curso para visualizar as aulas nesta área." />
      ) : (
        <div className="admin-list">
          {(courses ?? []).map((course) => (
            <Link className="admin-row" key={course.id} href={`/admin/preview/cursos/${course.id}`}>
              <div>
                <strong>{course.title}</strong>
                {course.description && <div className="muted" style={{ fontSize: 13 }}>{course.description}</div>}
              </div>
              <span className={`badge ${course.published ? 'success' : 'neutral'}`}>
                {course.published ? 'Publicado' : 'Rascunho'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}