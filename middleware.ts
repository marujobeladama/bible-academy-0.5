import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware de sessão SSR (padrão recomendado pelo @supabase/ssr).
 *
 * Responsabilidades:
 * 1. Renovar o cookie de sessão a cada requisição, antes que ele expire —
 *    sem isso, sessões podem "cair" de forma inconsistente entre páginas.
 * 2. Redirecionar não-autenticados para /login ao tentar acessar rotas
 *    privadas (/dashboard, /admin) — primeira camada de proteção.
 * 3. Redirecionar não-admin para /dashboard ao tentar acessar /admin.
 *
 * Importante: isto é UX/roteamento, não é a fonte de verdade de segurança.
 * A autorização real continua sendo aplicada por RLS no banco e pelas
 * checagens de requireUser/requireAdmin em cada página e rota de API — um
 * bug aqui nunca pode, sozinho, expor dado de outro usuário.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            })
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPrivateRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  const isAdminRoute = pathname.startsWith('/admin');

  if (isPrivateRoute && (!user || !user.email_confirmed_at)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminRoute && user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    // Teacher também entra em /admin (versão com escopo reduzido: só o
    // conteúdo dos cursos que lhe foram atribuídos — ver app/admin/layout.tsx
    // e as páginas individuais, que restringem o que cada role vê/edita).
    // As seções puramente administrativas (/admin/alunos, /admin/design)
    // são bloqueadas para teacher na própria página, não aqui — o
    // middleware só decide quem entra em /admin como um todo.
    if (profile?.role !== 'admin' && profile?.role !== 'teacher') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, exceto assets estáticos e arquivos internos do Next.js,
     * para poder renovar a sessão em qualquer navegação privada.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)',
  ],
};
