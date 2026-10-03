import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';

const WINDOW_MS = 60_000;
const LIMIT = 60;

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

export interface RateLimitConfig {
  /** Máximo de requisições permitidas dentro da janela. */
  limit: number;
  /** Duração da janela, em milissegundos. */
  windowMs: number;
}

/** Limite padrão (igual ao comportamento anterior): 60 req/min. */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = { limit: LIMIT, windowMs: WINDOW_MS };

/**
 * Presets por tipo de endpoint. Login/cadastro/recuperação de senha e
 * uploads de arquivo têm limites mais apertados que uma mutação comum do
 * CRUD administrativo; o webhook do gateway de pagamento é servidor-a-
 * servidor e não sofre com o mesmo tipo de abuso de um formulário público,
 * então tem um limite mais alto.
 */
export const RATE_LIMIT_PRESETS = {
  default: DEFAULT_RATE_LIMIT,
  auth: { limit: 8, windowMs: 5 * 60_000 } satisfies RateLimitConfig, // login/cadastro/recuperação de senha
  upload: { limit: 12, windowMs: 60_000 } satisfies RateLimitConfig, // início/conclusão de upload de material/vídeo
  webhook: { limit: 200, windowMs: 60_000 } satisfies RateLimitConfig,
} as const;

/**
 * Contrato de rate limiter. Duas implementações:
 *
 * - `InMemoryRateLimiter`: em memória do processo. Usada automaticamente
 *   quando `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` não estão
 *   configuradas (ex.: desenvolvimento local) — assim o projeto nunca para
 *   de funcionar por falta de Redis, mas o limite deixa de ser confiável
 *   com múltiplas instâncias (cada instância tem seu próprio contador).
 * - `UpstashRedisRateLimiter`: contador distribuído via REST API do
 *   Upstash Redis (sem SDK extra — poucas linhas de `fetch`), correto com
 *   qualquer número de instâncias/regiões, usada automaticamente quando as
 *   duas variáveis acima estão definidas.
 *
 * Fail-safe deliberado: se a chamada ao Redis falhar (rede, credencial
 * errada, serviço fora do ar), a requisição é liberada (fail-open) e um
 * aviso é logado — nunca fail-closed. A escolha é intencional: um rate
 * limiter é uma proteção contra abuso, não a autenticação/autorização em
 * si (essas continuam sendo aplicadas independentemente pelo RLS e por
 * requireUser/requireAdmin/requireCourseManager). Derrubar a aplicação
 * inteira porque o Redis piscou seria trocar um risco pequeno (uma janela
 * de alguns segundos sem rate limit) por um risco maior (indisponibilidade
 * total). Isso está documentado também em SECURITY.md.
 */
interface RateLimiter {
  check(key: string, config: RateLimitConfig): Promise<RateLimitResult> | RateLimitResult;
}

class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();

  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || now > current.reset) {
      this.buckets.set(key, { count: 1, reset: now + config.windowMs });
      return { ok: true, retryAfter: Math.ceil(config.windowMs / 1000) };
    }
    current.count++;
    return { ok: current.count <= config.limit, retryAfter: Math.ceil((current.reset - now) / 1000) };
  }
}

class UpstashRedisRateLimiter implements RateLimiter {
  constructor(private readonly url: string, private readonly token: string) {}

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const windowBucket = Math.floor(Date.now() / config.windowMs);
    const redisKey = `ratelimit:${key}:${config.windowMs}:${windowBucket}`;
    const ttlSeconds = Math.ceil(config.windowMs / 1000) + 5; // pequena folga contra desalinhamento de relógio

    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, String(ttlSeconds)],
        ]),
        // Nunca deixa uma chamada de rate limit travar a requisição real por
        // muito tempo — acima disso, cai no catch e libera (fail-open).
        signal: AbortSignal.timeout(1500),
      });

      if (!response.ok) throw new Error(`Upstash respondeu ${response.status}`);

      const [incrResult] = (await response.json()) as Array<{ result?: number; error?: string }>;
      if (typeof incrResult?.result !== 'number') throw new Error('Resposta inesperada do Upstash');

      const count = incrResult.result;
      const retryAfter = Math.ceil(config.windowMs / 1000);
      return { ok: count <= config.limit, retryAfter };
    } catch (err) {
      console.warn('[rateLimit] Upstash indisponível, liberando por fail-open:', (err as Error).message);
      return { ok: true, retryAfter: Math.ceil(config.windowMs / 1000) };
    }
  }
}

function buildActiveLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.RATE_LIMIT_PROVIDER === 'upstash-redis' && url && token) {
    return new UpstashRedisRateLimiter(url, token);
  }
  // Sem configuração: cai para memória local automaticamente, sem quebrar
  // o desenvolvimento — ver aviso de limitação na doc da interface acima.
  return new InMemoryRateLimiter();
}

const activeLimiter: RateLimiter = buildActiveLimiter();

export async function rateLimit(key: string, config: RateLimitConfig = DEFAULT_RATE_LIMIT): Promise<RateLimitResult> {
  return activeLimiter.check(key, config);
}

export function originGuard(req:NextRequest){
  if(['GET','HEAD','OPTIONS'].includes(req.method))return null;

  const origin=req.headers.get('origin');
  if(!origin) return NextResponse.json({error:'Origin not allowed'},{status:403});

  try {
    const originUrl = new URL(origin);
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const requestHost = host?.split(',')[0]?.trim() || forwardedHost || '';

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : null;
    const allowedHosts = new Set<string>([
      'localhost:3000',
      '127.0.0.1:3000',
      '0.0.0.0:3000',
      'localhost:3001',
      '127.0.0.1:3001',
      '0.0.0.0:3001',
    ]);

    if (appOrigin && appOrigin.origin === origin) return null;
    if (requestHost && originUrl.host === requestHost) return null;
    if (allowedHosts.has(originUrl.host)) return null;
    if (/\.app\.github\.dev(:\d+)?$/.test(originUrl.host)) return null;
  } catch {
    return NextResponse.json({error:'Origin not allowed'},{status:403});
  }

  return NextResponse.json({error:'Origin not allowed'},{status:403});
}
export function clientKey(req:NextRequest){return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('x-real-ip')||'unknown'}

/**
 * Gera um caminho de storage seguro e imprevisível para um arquivo enviado
 * pelo admin. NUNCA usa o nome ou a extensão originais do arquivo como parte
 * do path — a extensão vem só do MIME type já validado no servidor. Isso
 * evita path traversal via "../../", nomes de arquivo executáveis
 * disfarçados (ex.: "foto.jpg.exe") e colisão/overwrite entre aulas.
 */
export function safeStoragePath(prefix: string, mimeType: string): string {
  const ext = extensionFromMime(mimeType);
  const random = randomUUID();
  return `${prefix}/${random}.${ext}`;
}

/** Extensões permitidas por MIME, usadas só para nome de exibição/CDN hints — nunca para decidir permissão. */
function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return map[mime] ?? 'bin';
}
