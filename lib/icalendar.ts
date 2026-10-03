type LiveCalendarInput = {
  id: string;
  courseId: string;
  title: string;
  courseTitle: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  siteUrl: string;
};

const encoder = new TextEncoder();

function escapeICalendarText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatICalendarDate(value: Date) {
  if (!Number.isFinite(value.getTime())) throw new RangeError('Invalid calendar date');
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldICalendarLine(line: string) {
  const folded: string[] = [];
  let currentLine = '';
  let currentBytes = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (currentBytes + characterBytes > 75) {
      folded.push(currentLine);
      currentLine = ` ${character}`;
      currentBytes = 1 + characterBytes;
    } else {
      currentLine += character;
      currentBytes += characterBytes;
    }
  }

  folded.push(currentLine);
  return folded.join('\r\n');
}

export function buildLiveClassCalendar({
  id,
  courseId,
  title,
  courseTitle,
  description,
  startsAt,
  endsAt,
  siteUrl,
}: LiveCalendarInput) {
  const startDate = new Date(startsAt);
  const endDate = endsAt ? new Date(endsAt) : new Date(startDate.getTime() + 60 * 60 * 1000);
  const eventUrl = `${siteUrl.replace(/\/+$/, '')}/aulas-ao-vivo?courseId=${encodeURIComponent(courseId)}`;
  const eventDescription = [description, `Acesse a agenda da Bible Academy: ${eventUrl}`]
    .filter(Boolean)
    .join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bible Academy//Aulas ao vivo//pt-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}@bible-academy`,
    `DTSTAMP:${formatICalendarDate(new Date())}`,
    `DTSTART:${formatICalendarDate(startDate)}`,
    `DTEND:${formatICalendarDate(endDate)}`,
    `SUMMARY:${escapeICalendarText(`${title} - ${courseTitle}`)}`,
    `DESCRIPTION:${escapeICalendarText(eventDescription)}`,
    `URL:${eventUrl}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICalendarText(`A live começa em 30 minutos: ${title}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.map(foldICalendarLine).join('\r\n')}\r\n`;
}