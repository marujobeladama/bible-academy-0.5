import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { requireAdminPage } from '@/lib/require-admin-page';
import { formatDate } from '@/lib/format';
import { EnrollmentManager } from '@/components/admin/EnrollmentManager';

export default async function AdminStudentDetail({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdminPage();
  const { userId } = await params;
  const supabase = await getSupabaseServer();

  const { data: student } = await supabase
    .from('profiles')
    .select('id, name, email, role, created_at')
    .eq('id', userId)
    .single();

  if (!student) notFound();

  const { data: enrollmentRows } = await supabase
    .from('enrollments')
    .select('course_id, source, created_at, courses(title)')
    .eq('user_id', userId);

  const enrollments = (enrollmentRows ?? []).map((e) => {
    const course = Array.isArray(e.courses) ? e.courses[0] : e.courses;
    return {
      course_id: e.course_id,
      title: (course as { title?: string } | null)?.title ?? '—',
      source: e.source,
      created_at: e.created_at,
    };
  });

  const enrolledIds = new Set(enrollments.map((e) => e.course_id));
  const { data: allCourses } = await supabase.from('courses').select('id, title').order('title');
  const availableCourses = (allCourses ?? []).filter((c) => !enrolledIds.has(c.id));

  return (
    <div>
      <Link href="/admin/alunos" className="muted" style={{ fontSize: 13 }}>
        ← Voltar aos alunos
      </Link>

      <div className="panel">
        <div className="eyebrow">Aluno</div>
        <h1 style={{ margin: '4px 0' }}>{student.name}</h1>
        <p className="muted">{student.email}</p>
        <p className="muted" style={{ fontSize: 13 }}>
          Papel: <span className={`badge ${student.role === 'admin' ? 'warn' : student.role === 'teacher' ? 'success' : 'neutral'}`}>{student.role}</span> · conta desde {formatDate(student.created_at)}
        </p>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          A alteração de papel (role) não é exposta nesta tela por design: não há uma rota de API que aceite
          alterar &quot;role&quot; a partir do cliente. Promoções a administrador ou professor devem ser feitas
          diretamente no banco por quem já é admin, como uma ação deliberada e auditável — nunca por um
          formulário exposto na web. Depois de promover alguém a professor, atribua cursos a ele em
          Cursos → (curso) → “Professor responsável”.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Cursos e matrículas</h3>
        <EnrollmentManager userId={userId} enrollments={enrollments} availableCourses={availableCourses} />
      </div>
    </div>
  );
}
