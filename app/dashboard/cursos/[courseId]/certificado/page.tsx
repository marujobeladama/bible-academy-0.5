import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PrintCertificateButton } from '@/components/PrintCertificateButton';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatDate } from '@/lib/format';
import { isCourseComplete } from '@/lib/progress';

export default async function CourseCertificate({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/cursos/${courseId}/certificado`);

  const [{ data: course }, { data: enrollment }, { data: profile }] = await Promise.all([
    supabase.from('courses').select('id, title').eq('id', courseId).single(),
    supabase.from('enrollments').select('course_id').eq('course_id', courseId).eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
  ]);
  if (!course) notFound();
  if (!enrollment) redirect('/dashboard');

  const { data: modules } = await supabase
    .from('modules')
    .select('id, lessons(id)')
    .eq('course_id', courseId)
    .eq('published', true);
  const lessonIds = (modules ?? []).flatMap((module) => (module.lessons ?? []).map((lesson) => lesson.id));
  const { data: completedRows } = lessonIds.length
    ? await supabase
        .from('lesson_progress')
        .select('lesson_id')
        .eq('user_id', user.id)
        .eq('completed', true)
        .in('lesson_id', lessonIds)
    : { data: [] as Array<{ lesson_id: string }> };

  if (!isCourseComplete({ totalLessons: lessonIds.length, completedLessons: completedRows?.length ?? 0 })) {
    redirect(`/dashboard/cursos/${courseId}`);
  }

  // A elegibilidade real é sempre checada de novo no banco, dentro de
  // issue_certificate — o que fizemos acima é só para decidir se mostramos
  // a página ou redirecionamos; nunca confiamos nisso para emitir o
  // certificado em si. Chamada idempotente: se já existe, devolve o mesmo
  // código; nunca gera um código novo para o mesmo aluno/curso.
  const { data: certificateRows, error: issueError } = await supabase.rpc('issue_certificate', {
    target_course: courseId,
  });
  const certificate = Array.isArray(certificateRows) ? certificateRows[0] : certificateRows;

  if (issueError || !certificate) {
    // Função não existe ainda (migration 0012 não aplicada) ou outra falha
    // — não quebra a página, só não mostra código/verificação.
    return (
      <div className="certificate-page">
        <div className="certificate-actions">
          <Link className="button secondary" href={`/dashboard/cursos/${courseId}`}>Voltar ao curso</Link>
          <PrintCertificateButton />
        </div>
        <article className="certificate-document">
          <div className="certificate-brand">BIBLE <span>ACADEMY</span></div>
          <div className="eyebrow">Formação bíblica</div>
          <h1>Certificado de conclusão</h1>
          <p>Certificamos que</p>
          <h2>{profile?.name?.trim() || user.email?.split('@')[0] || 'Aluno'}</h2>
          <p>concluiu com dedicação todas as aulas publicadas do curso</p>
          <h3>{course.title}</h3>
          <div className="certificate-footer">
            <span>Bible Academy</span>
            <span>{formatDate(new Date().toISOString())}</span>
          </div>
        </article>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 12 }}>
          Código de verificação indisponível no momento.
        </p>
      </div>
    );
  }

  const studentName = profile?.name?.trim() || user.email?.split('@')[0] || 'Aluno';
  const verifyPath = `/certificados/verificar/${certificate.code}`;

  return (
    <div className="certificate-page">
      <div className="certificate-actions">
        <Link className="button secondary" href={`/dashboard/cursos/${courseId}`}>Voltar ao curso</Link>
        <PrintCertificateButton />
      </div>
      <article className="certificate-document">
        <div className="certificate-brand">BIBLE <span>ACADEMY</span></div>
        <div className="eyebrow">Formação bíblica</div>
        <h1>Certificado de conclusão</h1>
        <p>Certificamos que</p>
        <h2>{studentName}</h2>
        <p>concluiu com dedicação todas as aulas publicadas do curso</p>
        <h3>{course.title}</h3>
        <div className="certificate-footer">
          <span>Bible Academy</span>
          <span>{formatDate(certificate.issued_at)}</span>
        </div>
        <p className="certificate-code">
          Código de verificação: <strong>{certificate.code}</strong>
        </p>
      </article>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 12 }}>
        Qualquer pessoa pode conferir a autenticidade deste certificado em{' '}
        <Link href={verifyPath}>bibleacademy.com{verifyPath}</Link>.
      </p>
    </div>
  );
}
