'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';

export async function signOutAction() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
