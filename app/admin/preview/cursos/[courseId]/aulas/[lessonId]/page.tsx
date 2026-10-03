import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LessonVideo } from '@/components/LessonVideo';
import { getSupabaseServer } from '@/lib/supabase-server';

export default async function StudentPreviewLesson({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const supabase = await getSupabaseServer();
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, description, video_path, modules(course_id, title)')
    .eq('id', lessonId)
    .single();

  const lessonModule = Array.isArray(lesson?.modules) ? lesson.modules[0] : lesson?.modules;
  if (!lesson || lessonModule?.course_id !== courseId) {
    redirect(`/admin/preview/cursos/${courseId}`);
  }

  const { data: materials } = await supabase
    .from('materials')
    .select('id, name')
    .eq('lesson_id', lessonId);

  return (
    <div className="panel">
      <Link href={`/admin/preview/cursos/${courseId}`} className="muted" style={{ fontSize: 13 }}>
        ← Voltar ao curso
      </Link>
      <div className="eyebrow" style={{ marginTop: 16 }}>Prévia do aluno · {lessonModule.title}</div>
      <h1 style={{ marginTop: 6 }}>{lesson.title}</h1>

      {lesson.video_path && (
        <div style={{ marginTop: 16 }}>
          <LessonVideo lessonId={lessonId} />
        </div>
      )}

      {lesson.description && <p className="muted" style={{ marginTop: 16 }}>{lesson.description}</p>}

      {(materials ?? []).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 17 }}>Materiais</h2>
          <div className="material-list">
            {(materials ?? []).map((material) => (
              <div className="material-row" key={material.id}>
                <span>{material.name}</span>
                <a className="button small secondary" href={`/api/materials/${material.id}/download`} target="_blank" rel="noreferrer">
                  Baixar
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}