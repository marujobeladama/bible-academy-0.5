import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientKey, originGuard, RATE_LIMIT_PRESETS } from '@/lib/security';
import { z } from 'zod';

/**
 * Login, cadastro e recuperação de senha chamam o Supabase Auth
 * diretamente do navegador (client SDK) — por design, essa chamada nunca
 * passa pela nossa API, então `rateLimit()` nas nossas rotas não alcança
 * esses três fluxos. Este endpoint é chamado ANTES da chamada ao Supabase
 * Auth, só para aplicar nosso limite (login/cadastro/recuperação são os
 * alvos clássicos de força bruta e enumeração).
 *
 * Isto é uma camada a mais, não a única: o Supabase Auth também tem seus
 * próprios limites de abuso nativos (configuráveis em Authentication →
 * Rate Limits no painel), que continuam valendo independentemente disto.
 *
 * Não é (e não pretende ser) autenticação — não recebe senha, não valida
 * credencial, só decide "esta combinação de IP/ação/identificador pode
 * tentar agora?". Falha sempre no lado seguro: em caso de erro interno,
 * nega (fail-closed) — ao contrário do rate limiter geral, que é
 * fail-open, porque aqui o custo de negar por engano (usuário tenta de
 * novo em instantes) é muito menor que o de liberar por engano durante um
 * ataque de força bruta a login.
 */
const bodySchema = z.object({
  action: z.enum(['login', 'signup', 'forgot-password']),
  // E-mail em minúsculas usado só como uma segunda chave de limite (além do
  // IP) — nunca logado, nunca usado para outra coisa aqui.
  identifier: z.string().trim().toLowerCase().max(255).optional(),
});

export async function POST(req: NextRequest) {
  const originError = originGuard(req);
  if (originError) return originError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 });

  try {
    const ipResult = await rateLimit(`auth:${parsed.data.action}:ip:${clientKey(req)}`, RATE_LIMIT_PRESETS.auth);
    if (!ipResult.ok) {
      return NextResponse.json(
        { ok: false, error: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
        { status: 429, headers: { 'Retry-After': String(ipResult.retryAfter) } }
      );
    }

    if (parsed.data.identifier) {
      const identifierResult = await rateLimit(
        `auth:${parsed.data.action}:id:${parsed.data.identifier}`,
        RATE_LIMIT_PRESETS.auth
      );
      if (!identifierResult.ok) {
        return NextResponse.json(
          { ok: false, error: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
          { status: 429, headers: { 'Retry-After': String(identifierResult.retryAfter) } }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Fail-closed só aqui, de propósito — ver comentário acima.
    return NextResponse.json({ ok: false, error: 'Tente novamente em instantes.' }, { status: 503 });
  }
}
