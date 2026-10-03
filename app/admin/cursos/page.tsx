import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatPriceCents } from '@/lib/format';
import { EmptyState } from '@/components/EmptyState';
import { CreateCourseForm } from '@/components/admin/CreateCourseForm';

export default async function AdminCourses() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  // Teacher: filtro explícito por teacher_id, além do RLS — evita misturar
  // na tela "meus cursos" o catálogo público inteiro (que RLS também
  // deixaria essa role enxergar, já que cursos publicados são visíveis a
  // qualquer autenticado).
  let query = supabase.from('courses').select('id, title, price_cents, published').order('created_at', { ascending: false });
  if (!isAdmin) query = query.eq('teacher_id', user.id);
  const { data: courses } = await query;
  const courseList = courses ?? [];
  const publishedCount = courseList.filter((course) => course.published).length;
  const draftCount = courseList.length - publishedCount;

  return (
    <div className="panel">
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Cursos</div>
          <h1 style={{ margin: '6px 0 0' }}>{isAdmin ? 'Gerenciar cursos.' : 'Meus cursos.'}</h1>
        </div>
        {isAdmin && <CreateCourseForm />}
      </div>

      {isAdmin && (
        <div className="stat-grid" style={{ marginTop: 0 }}>
          <div className="stat-card">
            <div className="muted" style={{ fontSize: 13 }}>Total</div>
            <div className="value">{courseList.length}</div>
            <div className="muted" style={{ fontSize: 12 }}>cursos cadastrados</div>
          </div>
          <div className="stat-card">
            <div className="muted" style={{ fontSize: 13 }}>Publicados</div>
            <div className="value" style={{ color: 'var(--success)' }}>{publishedCount}</div>
            <div className="muted" style={{ fontSize: 12 }}>visíveis para alunos</div>
          </div>
          <div className="stat-card">
            <div className="muted" style={{ fontSize: 13 }}>Rascunhos</div>
            <div className="value" style={{ color: 'var(--muted)' }}>{draftCount}</div>
            <div className="muted" style={{ fontSize: 12 }}>em construção</div>
          </div>
        </div>
      )}

      {courseList.length === 0 ? (
        <EmptyState
          title={isAdmin ? 'Nenhum curso cadastrado ainda.' : 'Nenhum curso atribuído a você ainda.'}
          description={isAdmin ? 'Crie o primeiro curso para começar.' : 'Fale com um administrador para receber um curso.'}
        />
      ) : (
        <div className="admin-list">
          {courseList.map((c) => (
            <div key={c.id} className="admin-row" style={{ background: c.published ? '#f9fcfa' : '#fff' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 18 }}>{c.title}</strong>
                  <span className={`badge ${c.published ? 'success' : 'neutral'}`}>
                    {c.published ? 'Publicado' : 'Rascunho'}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{formatPriceCents(c.price_cents)}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Link className="button secondary small" href={`/admin/cursos/${c.id}`}>
                  Editar curso
                </Link>
                <Link className="muted" href={`/admin/preview/cursos/${c.id}`} style={{ fontSize: 13, fontWeight: 700 }}>
                  Ver prévia
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
