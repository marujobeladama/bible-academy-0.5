import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import { EmptyState } from '@/components/EmptyState';

export default async function MaterialsPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS ("enrolled materials") já restringe a matérias de aulas publicadas de
  // cursos matriculados — não precisamos (nem devemos) filtrar isso na mão
  // usando dados vindos do cliente.
  const { data: materials } = await supabase
    .from('materials')
    .select('id, name, lesson_id, lessons(title, modules(course_id, courses(title)))')
    .order('name', { ascending: true });

  return (
    <div className="panel">
      <div className="eyebrow">Materiais</div>
      <h1>Seus materiais de estudo.</h1>
      <p className="muted">PDFs e arquivos complementares dos cursos que você possui.</p>

      {(materials ?? []).length === 0 ? (
        <div style={{ marginTop: 20 }}>
          <EmptyState title="Nenhum material disponível ainda." />
        </div>
      ) : (
        <div className="material-list" style={{ marginTop: 20 }}>
          {(materials ?? []).map((m) => {
            const lesson = Array.isArray(m.lessons) ? m.lessons[0] : m.lessons;
            const courseModule = Array.isArray(lesson?.modules) ? lesson.modules[0] : lesson?.modules;
            const course = Array.isArray(courseModule?.courses) ? courseModule.courses[0] : courseModule?.courses;
            return (
              <div className="material-row" key={m.id}>
                <div>
                  <div>{m.name}</div>
                  {lesson && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {course?.title} · {lesson.title}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {courseModule?.course_id && (
                    <Link className="button small secondary" href={`/dashboard/cursos/${courseModule.course_id}/aulas/${m.lesson_id}`}>
                      Ver aula
                    </Link>
                  )}
                  <a className="button small" href={`/api/materials/${m.id}/download`} target="_blank" rel="noreferrer">
                    Baixar
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
