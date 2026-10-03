import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import { requireAdminPage } from '@/lib/require-admin-page';
import { EmptyState } from '@/components/EmptyState';
import { formatDate } from '@/lib/format';

export default async function AdminStudents({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPage();
  const { q } = await searchParams;
  const supabase = await getSupabaseServer();

  let query = supabase
    .from('profiles')
    .select('id, name, email, role, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  // Busca simples por nome/e-mail. O termo é passado como parâmetro
  // vinculado do PostgREST (ilike), não concatenado em SQL — sem risco de
  // injeção. Escapamos os curingas do próprio termo para que o usuário não
  // injete "%"/"_" e amplie a busca de forma inesperada.
  const term = (q ?? '').trim();
  if (term) {
    const escaped = term.replace(/[%_]/g, (c) => `\\${c}`);
    query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }

  const { data: students } = await query;

  return (
    <div className="panel">
      <div className="eyebrow">Alunos</div>
      <h1 style={{ margin: '4px 0 20px' }}>Gerenciar alunos.</h1>

      <form style={{ maxWidth: 360, marginBottom: 20 }}>
        <input name="q" defaultValue={term} placeholder="Buscar por nome ou e-mail…" style={{ width: '100%', padding: 12, border: '1px solid var(--line)', borderRadius: 12 }} />
      </form>

      {(students ?? []).length === 0 ? (
        <EmptyState title="Nenhum aluno encontrado." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Desde</th>
              </tr>
            </thead>
            <tbody>
              {(students ?? []).map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/admin/alunos/${s.id}`}>{s.name}</Link></td>
                  <td className="muted">{s.email}</td>
                  <td><span className={`badge ${s.role === 'admin' ? 'warn' : 'neutral'}`}>{s.role}</span></td>
                  <td className="muted">{formatDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
