'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase-server';

const liveClassSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).optional().default(''),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1).optional().or(z.literal('')),
  status: z.enum(['scheduled', 'live', 'ended']).default('scheduled'),
});

async function ensureCourseManager(courseId: string, supabase: Awaited<ReturnType<typeof getSupabaseServer>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { allowed: false as const, reason: 'Não autenticado.' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const { data: course } = await supabase.from('courses').select('teacher_id').eq('id', courseId).single();

  if (profile?.role === 'admin' || course?.teacher_id === user.id) {
    return { allowed: true as const, user };
  }

  return { allowed: false as const, reason: 'Você não pode gerenciar esta live.' };
}

export async function createLiveClass(courseId: string, formData: FormData) {
  const supabase = await getSupabaseServer();
  const allowed = await ensureCourseManager(courseId, supabase);
  if (!allowed.allowed) return { error: allowed.reason };

  const parsed = liveClassSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    starts_at: formData.get('starts_at'),
    ends_at: formData.get('ends_at'),
    status: formData.get('status') ?? 'scheduled',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos para a live.' };
  }

  const { title, description, status } = parsed.data;
  const startsAt = new Date(parsed.data.starts_at);
  const endsAtValue = parsed.data.ends_at ? new Date(parsed.data.ends_at) : null;

  if (Number.isNaN(startsAt.getTime())) return { error: 'Data de início inválida.' };
  if (endsAtValue && Number.isNaN(endsAtValue.getTime())) return { error: 'Data de fim inválida.' };
  if (endsAtValue && endsAtValue <= startsAt) return { error: 'A data final precisa ser depois da data inicial.' };

  const { data, error } = await supabase
    .from('live_classes')
    .insert({
      course_id: courseId,
      title,
      description,
      starts_at: startsAt.toISOString(),
      ends_at: endsAtValue ? endsAtValue.toISOString() : null,
      status,
      created_by: allowed.user.id,
    })
    .select()
    .single();

  if (error) return { error: 'Não foi possível criar a live.' };

  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath('/aulas-ao-vivo');
  revalidatePath('/dashboard/aulas-ao-vivo');

  return { ok: true, liveClass: data };
}

export async function updateLiveClassStatus(liveClassId: string, status: 'scheduled' | 'live' | 'ended') {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado.' };

  const { data: liveClass } = await supabase.from('live_classes').select('course_id').eq('id', liveClassId).single();
  if (!liveClass) return { error: 'Live não encontrada.' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const { data: course } = await supabase.from('courses').select('teacher_id').eq('id', liveClass.course_id).single();
  if (profile?.role !== 'admin' && course?.teacher_id !== user.id) {
    return { error: 'Sem permissão para alterar essa live.' };
  }

  const { error } = await supabase.from('live_classes').update({ status }).eq('id', liveClassId);
  if (error) return { error: 'Não foi possível atualizar a live.' };

  revalidatePath('/aulas-ao-vivo');
  revalidatePath('/dashboard/aulas-ao-vivo');
  return { ok: true };
}

export async function deleteLiveClass(liveClassId: string) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado.' };

  const { data: liveClass } = await supabase.from('live_classes').select('course_id').eq('id', liveClassId).single();
  if (!liveClass) return { error: 'Live não encontrada.' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const { data: course } = await supabase.from('courses').select('teacher_id').eq('id', liveClass.course_id).single();
  if (profile?.role !== 'admin' && course?.teacher_id !== user.id) {
    return { error: 'Sem permissão para remover essa live.' };
  }

  const { error } = await supabase.from('live_classes').delete().eq('id', liveClassId);
  if (error) return { error: 'Não foi possível remover a live.' };

  revalidatePath('/aulas-ao-vivo');
  revalidatePath('/dashboard/aulas-ao-vivo');
  return { ok: true };
}
