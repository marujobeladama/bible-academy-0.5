import { NextRequest, NextResponse } from 'next/server';
import { requireLessonManager } from '@/lib/auth-helpers';
import { rateLimit, clientKey, originGuard, safeStoragePath, RATE_LIMIT_PRESETS } from '@/lib/security';
import { ALLOWED_VIDEO_MIME_TYPES, MAX_VIDEO_SIZE_BYTES, uuidSchema } from '@/lib/validation';
import { z } from 'zod';

/**
 * Arquitetura de upload de vídeo (substitui o antigo POST que recebia o
 * arquivo inteiro no corpo da requisição para a API do Next.js):
 *
 *   1. Cliente chama este endpoint (init) — SEM enviar bytes do arquivo,
 *      só metadados (mime type, tamanho). Aqui é onde a autorização
 *      acontece: admin ou professor responsável pela aula, tamanho e MIME
 *      dentro do permitido. O servidor gera um caminho de Storage seguro
 *      e imprevisível (nunca escolhido pelo cliente).
 *   2. Cliente faz upload RESUMÍVEL (protocolo TUS) diretamente para o
 *      Storage do Supabase, usando a própria sessão do usuário — os bytes
 *      do vídeo nunca passam pela API do Next.js/memória do servidor.
 *      A autorização desse upload é reforçada de novo, de forma
 *      independente, pela policy de RLS em storage.objects (migration
 *      0007: can_manage_lesson_storage_path), que decodifica o lessonId a
 *      partir do próprio caminho — mesmo que este endpoint tivesse um bug,
 *      o Postgres ainda recusaria escrita fora do que foi autorizado.
 *   3. Cliente chama o endpoint "complete" para confirmar e associar o
 *      vídeo à aula no banco.
 */
const initSchema = z.object({
  mime_type: z.enum(ALLOWED_VIDEO_MIME_TYPES),
  size_bytes: z.number().int().positive().max(MAX_VIDEO_SIZE_BYTES),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const originError = originGuard(req);
  if (originError) return originError;

  const rl = await rateLimit(`video-upload-init:${clientKey(req)}`, RATE_LIMIT_PRESETS.upload);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireLessonManager(lessonId);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tipo ou tamanho de vídeo não permitido (MP4/WebM/MOV, até 2GB).' }, { status: 400 });
  }

  const { data: lesson } = await supabase.from('lessons').select('id').eq('id', lessonId).single();
  if (!lesson) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });

  const path = safeStoragePath(`lesson-${lessonId}/video`, parsed.data.mime_type);

  return NextResponse.json({
    bucket: 'course-videos',
    path,
    contentType: parsed.data.mime_type,
  });
}
