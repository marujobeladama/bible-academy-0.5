import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { buildLiveClassCalendar } from '@/lib/icalendar';
import { uuidSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ liveClassId: string }> },
) {
  const { liveClassId } = await params;
  if (!uuidSchema.safeParse(liveClassId).success) {
    return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  const { data: liveClass } = await supabase
    .from('live_classes')
    .select('id, course_id, title, description, starts_at, ends_at, status')
    .eq('id', liveClassId)
    .in('status', ['live', 'scheduled'])
    .maybeSingle();

  if (!liveClass) return NextResponse.json({ error: 'Aula ao vivo não encontrada.' }, { status: 404 });

  const { data: course } = await supabase.from('courses').select('title').eq('id', liveClass.course_id).maybeSingle();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const calendar = buildLiveClassCalendar({
    id: liveClass.id,
    courseId: liveClass.course_id,
    title: liveClass.title,
    courseTitle: course?.title ?? 'Curso',
    description: liveClass.description,
    startsAt: liveClass.starts_at,
    endsAt: liveClass.ends_at,
    siteUrl,
  });

  return new NextResponse(calendar, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="bible-academy-live-${liveClass.id}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}