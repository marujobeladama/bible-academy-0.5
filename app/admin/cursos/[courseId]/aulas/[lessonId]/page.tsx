import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { LessonEditForm } from '@/components/admin/LessonEditForm';
import { VideoUploader } from '@/components/admin/VideoUploader';
import { MaterialsManager } from '@/components/admin/MaterialsManager';

export default async function AdminLessonEdit({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const supabase = await getSupabaseServer();

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, description, duration_seconds, published, video_path, modules(course_id)')
    .eq('id', lessonId)
    .single();

  const lessonModule = Array.isArray(lesson?.modules) ? lesson.modules[0] : lesson?.modules;

  if (!lesson || (lessonModule as { course_id?: string } | null)?.course_id !== courseId) {
    redirect(`/admin/cursos/${courseId}`);
  }

  const { data: materials } = await supabase.from('materials').select('id, name').eq('lesson_id', lessonId);

  return (
    <div>
      <Link href={`/admin/cursos/${courseId}`} className="muted" style={{ fontSize: 13 }}>
        ← Voltar ao curso
      </Link>

      <div className="panel">
        <div className="eyebrow">Aula</div>
        <h1 style={{ margin: '4px 0 20px' }}>{lesson.title}</h1>
        <LessonEditForm lesson={lesson} />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Vídeo</h3>
        <VideoUploader lessonId={lessonId} hasVideo={!!lesson.video_path} />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Materiais</h3>
        <MaterialsManager lessonId={lessonId} initialMaterials={materials ?? []} />
      </div>
    </div>
  );
}
