import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { formatPriceCents } from '@/lib/format';

type CourseLearningStat = {
  course_id: string;
  course_title: string;
  enrolled_students: number;
  average_completion: number;
  active_students: number;
  students_needing_attention: number;
};

export default async function AdminOverview() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (profile?.role !== 'admin') {
    // Teacher: painel simplificado, só com os próprios cursos — nada de
    // estatísticas globais (alunos, matrículas de outros professores etc.).
    const { data: myCourses } = await supabase
      .from('courses')
      .select('id, title, price_cents, published')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    const { data: myCourseStats } = await supabase.rpc('course_learning_stats_for_manager');
    const statsByCourse = new Map<string, CourseLearningStat>(
      ((myCourseStats ?? []) as CourseLearningStat[]).map((stat) => [stat.course_id, stat]),
    );

    return (
      <div className="panel">
        <div className="eyebrow">Painel do professor</div>
        <h1>Meus cursos.</h1>
        <p className="muted">Você gerencia o conteúdo (módulos, aulas, materiais e vídeo) dos cursos abaixo.</p>
        {(myCourses ?? []).length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>Nenhum curso foi atribuído a você ainda. Fale com um administrador.</p>
        ) : (
          <div className="admin-list" style={{ marginTop: 16 }}>
            {(myCourses ?? []).map((c) => {
              const courseStats = statsByCourse.get(c.id);
              return (
                <Link className="admin-row" key={c.id} href={`/admin/cursos/${c.id}`}>
                  <div>
                    <strong>{c.title}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>{formatPriceCents(c.price_cents)}</div>
                    {courseStats && (
                      <div className="teacher-course-progress">
                        <span>{courseStats.enrolled_students} matrículas</span>
                        <span>{courseStats.average_completion}% de conclusão média</span>
                        <span>{courseStats.students_needing_attention} precisam de atenção</span>
                      </div>
                    )}
                  </div>
                  <span className={`badge ${c.published ? 'success' : 'neutral'}`}>{c.published ? 'Publicado' : 'Rascunho'}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const [{ count: courseCount }, { count: studentCount }, { count: enrollmentCount }, { data: recentStudents }] =
    await Promise.all([
      supabase.from('courses').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('enrollments').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id, name, email, created_at').order('created_at', { ascending: false }).limit(5),
    ]);
  const { data: learningStatsData } = await supabase.rpc('course_learning_stats_for_manager');
  const learningStats = (learningStatsData ?? []) as CourseLearningStat[];

  return (
    <div>
      <div className="panel">
        <div className="eyebrow">Painel administrativo</div>
        <h1>Visão geral.</h1>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="muted" style={{ fontSize: 13 }}>Cursos</div>
            <div className="value">{courseCount ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="muted" style={{ fontSize: 13 }}>Alunos</div>
            <div className="value">{studentCount ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="muted" style={{ fontSize: 13 }}>Matrículas</div>
            <div className="value">{enrollmentCount ?? 0}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <Link className="button" href="/admin/cursos">Gerenciar cursos</Link>
          <Link className="button secondary" href="/admin/alunos">Gerenciar alunos</Link>
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">Aprendizagem</div>
        <h2 className="admin-learning-title">Acompanhamento por curso</h2>
        {(learningStats ?? []).length === 0 ? (
          <p className="muted">Os indicadores aparecerão após a aplicação da migration de analytics e das primeiras matrículas.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Matrículas</th>
                  <th>Conclusão média</th>
                  <th>Ativos · 30 dias</th>
                  <th>Atenção</th>
                </tr>
              </thead>
              <tbody>
                {learningStats.map((stat) => (
                  <tr key={stat.course_id}>
                    <td><Link href={`/admin/cursos/${stat.course_id}`}>{stat.course_title}</Link></td>
                    <td>{stat.enrolled_students}</td>
                    <td>
                      <div className="admin-learning-progress">
                        <div className="progress"><i style={{ width: `${stat.average_completion}%` }} /></div>
                        <strong>{stat.average_completion}%</strong>
                      </div>
                    </td>
                    <td>{stat.active_students}</td>
                    <td><span className={`badge ${stat.students_needing_attention > 0 ? 'warn' : 'success'}`}>{stat.students_needing_attention}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Alunos recentes</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {(recentStudents ?? []).map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/admin/alunos/${s.id}`}>{s.name}</Link></td>
                  <td className="muted">{s.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
