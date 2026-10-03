import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-helpers';
import { rateLimit, clientKey } from '@/lib/security';
import { uuidSchema } from '@/lib/validation';

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const rl = await rateLimit(`video-url:${clientKey(req)}`);
  if (!rl.ok) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  const { lessonId } = await params;
  if (!uuidSchema.safeParse(lessonId).success) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  // A policy de SELECT em "lessons" só devolve a linha se a aula estiver
  // publicada e o usuário tiver matrícula no curso (ou for admin). Se o
  // usuário não tiver acesso, "lesson" simplesmente vem nulo — sem
  // necessidade de checagem manual adicional de matrícula aqui.
  const { data: lesson, error } = await supabase.from('lessons').select('video_path').eq('id', lessonId).single();
  if (error || !lesson) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });
  if (!lesson.video_path) return NextResponse.json({ error: 'Esta aula não possui vídeo.' }, { status: 404 });

  // Assina uma URL temporária (poucos minutos) — nunca expomos o bucket como
  // público nem geramos links permanentes para conteúdo pago.
  const { data: signed, error: signError } = await supabase.storage
    .from('course-videos')
    .createSignedUrl(lesson.video_path, 60 * 10); // 10 minutos

  if (signError || !signed) return NextResponse.json({ error: 'Não foi possível gerar o link do vídeo.' }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl });
}
