import { z } from 'zod';

const publicUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !!url.hostname;
      } catch {
        return false;
      }
    },
    { message: 'URL inválida.' },
  )
  .max(2000);

// Reutilizável: valida um UUID vindo de rota dinâmica ou payload.
export const uuidSchema = z.string().uuid();

export const courseCreateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(5000).optional().default(''),
  price_cents: z.number().int().min(0).max(100_000_00),
});

export const courseUpdateSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  description: z.string().trim().max(5000).optional(),
  price_cents: z.number().int().min(0).max(100_000_00).optional(),
  published: z.boolean().optional(),
  image_url: publicUrlSchema.nullable().optional(),
  // Quem é o professor responsável pelo curso (migration 0007). Só é
  // gravado via a rota de curso, que continua exigindo requireAdmin — um
  // teacher nunca alcança este campo (nem consegue se autoatribuir a um
  // curso, já que não pode nem chamar essa rota).
  teacher_id: uuidSchema.nullable().optional(),
});

export const siteDesignSchema = z.object({
  brand_name: z.string().trim().min(2).max(60),
  accent_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  accent_secondary: z.string().regex(/^#[0-9a-f]{6}$/i),
  hero_title: z.string().trim().min(3).max(140),
  hero_description: z.string().trim().max(500),
  hero_image_url: publicUrlSchema.nullable(),
});

export const moduleCreateSchema = z.object({
  title: z.string().trim().min(2).max(150),
  position: z.number().int().min(0).max(10_000).optional().default(0),
});

export const moduleUpdateSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
});

export const lessonCreateSchema = z.object({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(5000).optional().default(''),
  position: z.number().int().min(0).max(10_000).optional().default(0),
  duration_seconds: z.number().int().min(0).max(60 * 60 * 12).nullable().optional(),
});

export const lessonUpdateSchema = z.object({
  title: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(5000).optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
  duration_seconds: z.number().int().min(0).max(60 * 60 * 12).nullable().optional(),
});

export const progressUpdateSchema = z.object({
  completed: z.boolean().optional(),
  progress_seconds: z.number().int().min(0).max(60 * 60 * 12).optional(),
});

export const courseReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});

export const moduleAssessmentSchema = z.object({
  title: z.string().trim().min(3).max(150),
  pass_percentage: z.number().int().min(50).max(100),
  published: z.boolean().optional().default(false),
  questions: z.array(z.object({
    prompt: z.string().trim().min(5).max(500),
    options: z.array(z.string().trim().min(1).max(180)).min(2).max(6),
    correct_option: z.number().int().min(0).max(5),
  }).superRefine((question, context) => {
    if (question.correct_option >= question.options.length) {
      context.addIssue({ code: 'custom', path: ['correct_option'], message: 'A resposta correta precisa corresponder a uma alternativa.' });
    }
  })).min(1).max(30),
});

export const moduleAssessmentSubmissionSchema = z.object({
  answers: z.array(z.number().int().min(0).max(5)).min(1).max(30),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  church: z.string().trim().max(120).nullable(),
  denomination: z.string().trim().max(120).nullable(),
  contact_phone: z.string().trim().max(30).nullable(),
  live_provider: z.enum(['google_meet', 'jitsi']).nullable(),
  live_url: z.string().trim().url().max(2000).nullable(),
}).superRefine((profile, context) => {
  if (Boolean(profile.live_provider) !== Boolean(profile.live_url)) {
    context.addIssue({ code: 'custom', message: 'Escolha a plataforma e informe o link da sala.' });
  }
  if (profile.live_provider && profile.live_url) {
    try {
      if (new URL(profile.live_url).protocol !== 'https:') {
        context.addIssue({ code: 'custom', path: ['live_url'], message: 'O link da sala precisa usar HTTPS.' });
      }
    } catch {
      context.addIssue({ code: 'custom', path: ['live_url'], message: 'Link da sala inválido.' });
    }
  }
});

// Materiais: allowlist estrita de MIME (reforça o que já existe na policy de
// storage) — a extensão do nome do arquivo é ignorada para decisões de
// segurança; o que importa é o MIME type + assinatura, nunca o nome.
export const ALLOWED_MATERIAL_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const MAX_MATERIAL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const MAX_PROFILE_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
