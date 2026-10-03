import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase-server';
import { LogoutButton } from '@/components/LogoutButton';
import { DashboardSidebar } from '@/components/DashboardSidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Segunda camada de proteção (a primeira é o middleware). Mesmo que o
  // middleware falhasse por algum motivo, esta página nunca renderiza dados
  // sem sessão válida.
  if (!user || !user.email_confirmed_at) redirect('/login?error=email_nao_confirmado');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  return (
    <>
      <header className="site-header dashboard-header">
        <div className="container nav">
          <Link className="brand" href="/">
            Bible <span>Academy</span>
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
        <DashboardSidebar isAdmin={profile?.role === 'admin'} />
        <section>{children}</section>
      </div>
      </main>
    </>
  );
}
