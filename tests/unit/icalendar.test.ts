import { describe, expect, it } from 'vitest';
import { buildLiveClassCalendar } from '@/lib/icalendar';

describe('buildLiveClassCalendar', () => {
  it('creates a UTC event with an alert 30 minutes before', () => {
    const calendar = buildLiveClassCalendar({
      id: 'live-id',
      courseId: 'course-id',
      title: 'Aula semanal',
      courseTitle: 'Apologética',
      description: 'Encontro de estudo',
      startsAt: '2026-10-03T15:00:00-03:00',
      endsAt: null,
      siteUrl: 'https://academy.example',
    });

    expect(calendar).toContain('DTSTART:20261003T180000Z');
    expect(calendar).toContain('DTEND:20261003T190000Z');
    expect(calendar).toContain('SUMMARY:Aula semanal - Apologética');
    expect(calendar).toContain('TRIGGER:-PT30M');
    expect(calendar).toContain('URL:https://academy.example/aulas-ao-vivo?courseId=course-id');
  });

  it('escapes calendar delimiters and folds long lines', () => {
    const calendar = buildLiveClassCalendar({
      id: 'live-id',
      courseId: 'course-id',
      title: 'Aula, especial; hoje',
      courseTitle: 'Curso bíblico',
      description: 'Estudo, leitura; conversa\\ e aplicação\n' + 'Conteúdo '.repeat(20),
      startsAt: '2026-10-03T18:00:00Z',
      endsAt: '2026-10-03T19:00:00Z',
      siteUrl: 'https://academy.example',
    });

    expect(calendar).toContain('SUMMARY:Aula\\, especial\\; hoje - Curso bíblico');
    expect(calendar).toContain('Estudo\\, leitura\\; conversa\\\\ e aplicação\\n');
    expect(calendar.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});