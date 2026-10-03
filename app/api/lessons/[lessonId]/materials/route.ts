import { NextRequest, NextResponse } from 'next/server';
import { requireLessonManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard, safeStoragePath, RATE_LIMIT_PRESETS } from '@/lib/security';
import { verifyFileSignature } from '@/lib/file-signatures';
import { ALLOWED_MATERIAL_MIME_TYPES, MAX_MATERIAL_SIZE_BYTES, uuidSchema } from '@/lib/validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`material-upload:${clientKey(req)}`, RATE_LIMIT_PRESETS.upload);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireLessonManager(lessonId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { data: lesson } = await supabase.from('lessons').select('id').eq('id', lessonId).single();
  if (!lesson) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente.' }, { status: 400 });

  // 1) Tamanho — checado antes de ler o conteúdo, para não desperdiçar tempo
  //    com arquivos claramente grandes demais (também reforçado pelo
  //    file_size_limit do bucket no banco).
  if (file.size <= 0 || file.size > MAX_MATERIAL_SIZE_BYTES) {
    return NextResponse.json({ error: 'Tamanho de arquivo inválido (máx. 50MB).' }, { status: 400 });
  }

  // 2) MIME declarado precisa estar na allowlist.
  const declaredMime = file.type;
  if (!ALLOWED_MATERIAL_MIME_TYPES.includes(declaredMime as (typeof ALLOWED_MATERIAL_MIME_TYPES)[number])) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 400 });
  }

  // 3) Magic bytes — nunca confiamos só no que o navegador declarou. Se o
  //    conteúdo real não bater com a assinatura esperada, rejeitamos (isso
  //    barra, por exemplo, um executável renomeado para .pdf).
  const signatureOk = await verifyFileSignature(file, declaredMime);
  if (!signatureOk) {
    return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao tipo declarado.' }, { status: 400 });
  }

  // 4) Nome/caminho seguros — nunca usamos o nome original enviado pelo
  //    cliente como parte do path físico (evita path traversal e overwrite).
  //    O nome original só é guardado como metadado de exibição (coluna "name"),
  //    e é tratado como texto puro, nunca como HTML, ao ser exibido depois.
  const storagePath = safeStoragePath(`lesson-${lessonId}`, declaredMime);
  const displayName = file.name.slice(0, 200) || 'material';

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(storagePath, arrayBuffer, { contentType: declaredMime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: 'Não foi possível enviar o arquivo.' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('materials')
    .insert({ lesson_id: lessonId, name: displayName, storage_path: storagePath, mime_type: declaredMime })
    .select('id, name, mime_type')
    .single();

  if (error) {
    // Rollback do storage se a linha do banco falhar, para não deixar
    // arquivo órfão sem registro/autorização associada.
    await supabase.storage.from('course-materials').remove([storagePath]);
    return NextResponse.json({ error: 'Não foi possível registrar o material.' }, { status: 500 });
  }

  return NextResponse.json({ material: data }, { status: 201 });
}
