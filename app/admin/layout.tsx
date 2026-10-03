import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import { LogoutButton } from '@/components/LogoutButton';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at) redirect('/login?error=email_nao_confirmado');

  // Segunda camada de proteção (a primeira é o middleware). A autorização
  // definitiva, mesmo assim, é sempre o RLS no banco — qualquer query feita
  // daqui em diante só retorna/altera dado se is_course_manager()/is_admin()
  // for verdadeiro lá (migration 0007).
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role;
  if (role !== 'admin' && role !== 'teacher') redirect('/dashboard');

  return (
    <>
      <header className="site-header dashboard-header">
        <div className="container nav">
          <Link className="brand" href="/admin">
            Bible <span>Academy</span>{' '}
            <span className="dashboard-role">· {role === 'admin' ? 'admin' : 'professor'}</span>
          </Link>
          <div className="navlinks">
            <span className="dashboard-email">{user.email}</span>
            <Link className="button secondary" href="/dashboard/perfil">
              Perfil
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="container dashboard">
      <div className="dash-grid">
        <AdminNav role={role} />
        <section>{children}</section>
      </div>
      </main>
    </>
  );
}
