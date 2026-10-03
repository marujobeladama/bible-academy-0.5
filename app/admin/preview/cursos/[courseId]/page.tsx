import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatDuration } from '@/lib/format';

export default async function StudentPreviewCourse({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await getSupabaseServer();
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, description, published')
    .eq('id', courseId)
    .single();

  if (!course) redirect('/admin/preview');

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, position, published, lessons(id, title, position, duration_seconds, published)')
    .eq('course_id', courseId)
    .order('position', { ascending: true });

  return (
    <div className="panel">
      <Link href="/admin/preview" className="muted" style={{ fontSize: 13 }}>← Voltar aos cursos</Link>
      <div className="eyebrow" style={{ marginTop: 16 }}>Prévia do aluno</div>
      <div className="toolbar">
        <h1 style={{ margin: '4px 0' }}>{course.title}</h1>
        <span className={`badge ${course.published ? 'success' : 'neutral'}`}>
          {course.published ? 'Publicado' : 'Rascunho'}
        </span>
      </div>
      {course.description && <p className="muted">{course.description}</p>}

      {(modules ?? []).length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>Este curso ainda não tem módulos.</p>
      ) : (
        (modules ?? []).map((module) => (
          <div key={module.id} style={{ marginTop: 24 }}>
            <div className="toolbar">
              <h2 style={{ fontSize: 17, margin: 0 }}>{module.title}</h2>
              {!module.published && <span className="badge neutral">Módulo em rascunho</span>}
            </div>
            {(module.lessons ?? []).length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Este módulo ainda não tem aulas.</p>
            ) : (
              <div className="lesson-list">
                {(module.lessons ?? [])
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((lesson) => (
                    <Link
                      key={lesson.id}
                      href={`/admin/preview/cursos/${courseId}/aulas/${lesson.id}`}
                      className="lesson-row"
                    >
                      <span>
                        {lesson.title}
                        {!lesson.published && <span className="badge neutral" style={{ marginLeft: 8 }}>Rascunho</span>}
                      </span>
                      <span className="muted">{formatDuration(lesson.duration_seconds)}</span>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}