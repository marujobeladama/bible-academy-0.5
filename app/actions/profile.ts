'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase-server';
import { profileUpdateSchema } from '@/lib/validation';

export async function updateProfileName(formData: FormData) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado.' };

  const optionalText = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' && value.trim() ? value : null;
  };
  const provider = formData.get('live_provider');
  const parsed = profileUpdateSchema.safeParse({
    name: formData.get('name'),
    church: optionalText('church'),
    denomination: optionalText('denomination'),
    contact_phone: optionalText('contact_phone'),
    live_provider: provider === 'google_meet' || provider === 'jitsi' ? provider : null,
    live_url: optionalText('live_url'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Confira os dados do perfil.' };

  // A coluna "role" não é atualizável por este caminho: a policy de RLS só
  // permite update na própria linha, e o GRANT do banco só libera a coluna
  // "name" para o papel authenticated — mesmo enviando outro campo aqui, o
  // Postgres rejeitaria a alteração de "role".
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', user.id);
  if (error) return { error: 'Não foi possível salvar. Tente novamente.' };

  revalidatePath('/dashboard/perfil');
  revalidatePath('/aulas-ao-vivo');
  return { ok: true };
}
