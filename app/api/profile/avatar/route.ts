import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { clientKey, originGuard, rateLimit } from '@/lib/security';
import { verifyFileSignature } from '@/lib/file-signatures';
import { MAX_PROFILE_PHOTO_SIZE_BYTES } from '@/lib/validation';

const avatarExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const originError = originGuard(request);
  if (originError) return originError;

  const limit = await rateLimit(`profile-avatar:${clientKey(request)}`);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }

  const auth = await requireUser();
  if (auth.error) return auth.error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });
  }

  const file = formData.get('photo');
  if (!(file instanceof File) || !avatarExtensions[file.type]) {
    return NextResponse.json({ error: 'Envie uma imagem JPG, PNG ou WebP.' }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_PROFILE_PHOTO_SIZE_BYTES) {
    return NextResponse.json({ error: 'A foto deve ter no máximo 2 MB.' }, { status: 413 });
  }
  if (!(await verifyFileSignature(file, file.type))) {
    return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde a uma imagem válida.' }, { status: 400 });
  }

  const path = `${auth.user.id}/profile.${avatarExtensions[file.type]}`;
  const { error: uploadError } = await auth.supabase.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: 'Não foi possível salvar a foto.' }, { status: 500 });

  const { error: profileError } = await auth.supabase
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', auth.user.id);
  if (profileError) return NextResponse.json({ error: 'Não foi possível atualizar o perfil.' }, { status: 500 });

  const { data } = auth.supabase.storage.from('avatars').getPublicUrl(path);
  return NextResponse.json({ avatarUrl: data.publicUrl });
}