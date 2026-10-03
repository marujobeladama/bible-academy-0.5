import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatDate } from '@/lib/format';

export default async function VerifyCertificate({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const supabase = await getSupabaseServer();

  // verify_certificate não exige sessão (é security definer, concedida a
  // anon) — qualquer pessoa com o código pode conferir. Devolve só
  // curso/nome do aluno/data; nunca e-mail, id ou qualquer outro dado.
  const { data, error } = await supabase.rpc('verify_certificate', { input_code: codigo });
  const result = Array.isArray(data) ? data[0] : data;
  const found = !error && result;

  return (
    <main className="container" style={{ paddingTop: 30, paddingBottom: 60, maxWidth: 560 }}>
      <Link className="brand" href="/">
        Bible <span>Academy</span>
      </Link>

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="eyebrow">Verificação de certificado</div>
        {found ? (
          <>
            <h1>Certificado válido ✓</h1>
            <p className="muted">Este certificado foi emitido pela Bible Academy.</p>
            <div style={{ marginTop: 16 }}>
              <p><strong>Curso:</strong> {result.course_title}</p>
              <p><strong>Aluno:</strong> {result.student_name}</p>
              <p><strong>Emitido em:</strong> {formatDate(result.issued_at)}</p>
            </div>
          </>
        ) : (
          <>
            <h1>Certificado não encontrado</h1>
            <p className="muted">
              O código informado não corresponde a nenhum certificado emitido. Confira se foi digitado
              corretamente.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
