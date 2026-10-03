import { getSupabaseServer } from '@/lib/supabase-server';
import { formatDate } from '@/lib/format';
import { ProfileForm } from '@/components/ProfileForm';

export default async function ProfilePage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, created_at, church, denomination, contact_phone, avatar_path, live_provider, live_url')
    .eq('id', user.id)
    .single();
  const avatarUrl = profile?.avatar_path
    ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
    : null;

  return (
    <div className="panel">
      <div className="eyebrow">Perfil</div>
      <h1>Sua conta.</h1>

      <div className="field" style={{ maxWidth: 420 }}>
        <label>E-mail</label>
        <input value={user.email ?? ''} disabled />
      </div>

      <ProfileForm
        currentProfile={{
          name: profile?.name ?? '',
          church: profile?.church ?? '',
          denomination: profile?.denomination ?? '',
          contact_phone: profile?.contact_phone ?? '',
          avatarUrl,
          live_provider: profile?.live_provider ?? '',
          live_url: profile?.live_url ?? '',
          canManageLives: profile?.role === 'admin' || profile?.role === 'teacher',
        }}
      />

      <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
        Conta criada em {profile?.created_at ? formatDate(profile.created_at) : '—'} · papel: {profile?.role ?? 'student'}
      </p>
    </div>
  );
}
