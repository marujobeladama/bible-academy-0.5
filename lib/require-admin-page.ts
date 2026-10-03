import { redirect } from 'next/navigation';
import { getSupabaseServer } from './supabase-server';

/**
 * Usa em Server Components de páginas admin-only dentro de /admin (ex.:
 * /admin/alunos, /admin/design) — seções globais que um teacher não deve
 * acessar, mesmo que o layout de /admin em geral já deixe teacher entrar
 * para gerenciar o conteúdo dos próprios cursos. RLS já impede vazamento de
 * dado mesmo sem isto (ex.: "profiles self read" só devolve a própria
 * linha para quem não é admin), mas sem este guard a página renderizaria
 * vazia/quebrada para um teacher em vez de redirecionar de forma clara.
 */
export async function requireAdminPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');
}
