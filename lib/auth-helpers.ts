import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServer } from './supabase-server';

type AppRole = 'student' | 'teacher' | 'admin';

export interface AuthedUser {
  id: string;
  email: string | null;
  role: AppRole;
}

/**
 * Usa em API routes (Route Handlers). Retorna { supabase, user } quando
 * autenticado, ou { error } (uma NextResponse pronta para devolver) quando
 * não. Nunca confia em nada vindo do cliente para decidir identidade — tudo
 * vem da sessão validada pelo Supabase Auth.
 */
export async function requireUser(): Promise<
  | { supabase: SupabaseClient; user: AuthedUser; error: null }
  | { supabase: null; user: null; error: NextResponse }
> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email_confirmed_at) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null, role: (profile?.role as AppRole) ?? 'student' },
    error: null,
  };
}

/**
 * Igual a requireUser, mas também exige role === 'admin'. A checagem de role
 * aqui é só a primeira camada (evita trabalho desnecessário e dá um erro
 * claro); a autorização real e definitiva é sempre reforçada pelas policies
 * de RLS no banco — mesmo que este check tivesse um bug, o banco ainda
 * bloquearia escrita de um não-admin.
 */
export async function requireAdmin(): Promise<
  | { supabase: SupabaseClient; user: AuthedUser; error: null }
  | { supabase: null; user: null; error: NextResponse }
> {
  const result = await requireUser();
  if (result.error) return result;

  if (result.user.role !== 'admin') {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 }),
    };
  }

  return result;
}

type ManagerAuthResult =
  | { supabase: SupabaseClient; user: AuthedUser; error: null }
  | { supabase: null; user: null; error: NextResponse };

/**
 * Autoriza admin OU o professor responsável pelo curso/módulo/aula/material
 * (migration 0007). A checagem em si é feita no banco via RPC às funções
 * `is_course_manager`/`can_manage_*` (security definer) — chamadas com o
 * client da sessão do próprio usuário, então `auth.uid()` resolve
 * corretamente dentro da função. Isso é só a camada de API (erro 403 cedo,
 * com mensagem clara); as mesmas regras são reforçadas de novo pelo RLS na
 * escrita real — um bug aqui nunca é a única proteção.
 */
async function requireManager(rpcName: string, rpcArg: string, targetId: string): Promise<ManagerAuthResult> {
  const result = await requireUser();
  if (result.error) return result;

  const { data: allowed, error } = await result.supabase.rpc(rpcName, { [rpcArg]: targetId });
  if (error || !allowed) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json(
        { error: 'Acesso restrito ao administrador ou ao professor responsável por este curso.' },
        { status: 403 }
      ),
    };
  }

  return result;
}

export function requireCourseManager(courseId: string) {
  return requireManager('is_course_manager', 'target_course', courseId);
}

export function requireModuleManager(moduleId: string) {
  return requireManager('can_manage_module', 'target_module', moduleId);
}

export function requireLessonManager(lessonId: string) {
  return requireManager('can_manage_lesson', 'target_lesson', lessonId);
}

export function requireMaterialManager(materialId: string) {
  return requireManager('can_manage_material', 'target_material', materialId);
}

