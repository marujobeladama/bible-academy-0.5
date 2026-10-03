# Bible Academy

Plataforma de ensino bíblico online: cursos organizados em módulos e aulas,
com vídeo protegido, materiais privados, progresso do aluno, painel
administrativo (CMS) e checkout de pagamento integrado ao Mercado Pago.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript estrito**
- **Supabase**: Postgres + Auth + Storage, com Row Level Security (RLS) como
  camada real de autorização (não só a interface)
- **Zod** para validação de entrada em todas as rotas de escrita
- CSS puro (sem framework de UI), design system em `app/globals.css`

O Checkout Pro do Mercado Pago está integrado. As credenciais são fornecidas
somente pelo ambiente local/deploy; sem elas, o checkout permanece desativado.
Veja [PROJECT_SPEC.md](./PROJECT_SPEC.md) e [SECURITY.md](./SECURITY.md).

## Instalação

**Requisito: Node.js 22 ou superior** (o `@supabase/supabase-js` a partir da 2.110.0 não suporta mais Node 20). Verifique com `node --version`.

```bash
npm install
cp .env.example .env.local
# preencha .env.local com os valores do seu projeto Supabase
```

### Banco de dados

As migrations em `supabase/migrations/` são a fonte de verdade do schema,
aplicadas em ordem:

1. `0001_initial.sql` — schema base (profiles, courses, modules, lessons,
   materials, enrollments, lesson_progress), RLS e bucket de materiais.
2. `0002_foundation.sql` — criação automática de profile no cadastro,
   bloqueio de auto-promoção de role, publicação granular de
   módulos/aulas, tabela `payments`, bucket de vídeo.
3. `0003_payment_confirmation.sql` — função `confirm_payment` (confirmação
   atômica e idempotente de pagamento + matrícula), usada pelo webhook.
4. `0004_site_design.sql` — preferências do design global editáveis pelo admin.
5. `0005_public_course_preview.sql` — acesso público somente à primeira aula
  publicada de cada curso e ao vídeo de prévia.
6. `0006_payment_lifecycle.sql` — estorno de pagamento revoga a matrícula
  criada por ele e impede que uma aprovação atrasada a restaure.
7. `0007_teacher_role.sql` — permissões reais para o role `teacher`:
  `courses.teacher_id`, funções de autorização (`is_course_manager` e
  variantes) e policies de RLS/Storage escopadas por professor responsável.
8. `0008_live_classes_and_profiles.sql` — aulas ao vivo (`live_classes`) e
  avatar de perfil.
9. `0009_course_reviews.sql` — avaliações de curso (nota 1–5 + comentário)
  e a função `course_review_summary` para a média pública.
10. `0010_admin_learning_analytics.sql` — indicadores agregados de
  aprendizagem por curso (`course_learning_stats_for_manager`), visíveis
  para admin (todos os cursos) e professor (só os próprios).
11. `0011_module_assessments.sql` — quizzes por módulo, com gabarito
  isolado numa tabela que nenhum aluno pode ler diretamente; a correção
  acontece inteiramente no banco via `submit_module_assessment`.
12. `0012_reviews_moderation_and_certificates.sql` — exclusão da própria
  avaliação, moderação por admin, e certificados de conclusão com código
  único verificável publicamente (`issue_certificate`/`verify_certificate`).

Aplique com a CLI do Supabase (`supabase db push`) ou colando o conteúdo de
cada arquivo, em ordem, no SQL Editor do painel do Supabase.

### Variáveis de ambiente

Ver `.env.example` para a lista completa e comentada. Resumo:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | Chave anônima/publicável (segura no frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Chave privilegiada — **apenas server-side**, usada para criar pagamentos validados e processar webhooks |
| `NEXT_PUBLIC_APP_URL` | sim | URL pública da aplicação (proteção CSRF/origin + links de e-mail) |
| `PAYMENT_GATEWAY_PROVIDER` | para pagamentos | Defina `mercadopago` para ativar Checkout Pro |
| `MERCADOPAGO_ACCESS_TOKEN` | para pagamentos | Access token do app do Mercado Pago; somente server-side |
| `MERCADOPAGO_WEBHOOK_SECRET` | para pagamentos | Secret Signature configurado para notificações Webhook |
| `RATE_LIMIT_PROVIDER` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | não | Rate limiting distribuído — ver SECURITY.md |

No painel do Supabase, configure também (fora do código, em
Authentication → URL Configuration): a **Site URL** e as **Redirect URLs**
apontando para `${NEXT_PUBLIC_APP_URL}/auth/confirm`.

No painel de desenvolvedores do Mercado Pago, configure a URL de Webhook como
`${NEXT_PUBLIC_APP_URL}/api/webhooks/payment` para notificações de pagamento e
copie o Secret Signature para `MERCADOPAGO_WEBHOOK_SECRET`.

## Desenvolvimento

```bash
npm run dev
```

Comandos de validação antes de qualquer deploy (este ambiente de
desenvolvimento assistido não tem acesso à rede para executá-los — rode
localmente):

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

## Estrutura

```
app/
  (marketing)         página inicial + catálogo público de cursos
  login, signup, forgot-password, reset-password, auth/confirm
  dashboard/           área do aluno (protegida por middleware + RLS)
  admin/               CMS administrativo (protegido por role=admin + RLS)
  api/                 rotas de mutação (Zod + auth + rate limit + origin guard)
lib/                   clientes Supabase, validação, autorização, storage, pagamentos
components/            componentes de UI compartilhados
supabase/migrations/   schema versionado
tests/                 checklist manual + script SQL de autorização/RLS
```

Mais detalhes de arquitetura e fluxos em [PROJECT_SPEC.md](./PROJECT_SPEC.md).
Detalhes de segurança em [SECURITY.md](./SECURITY.md).

## Produção

Ver checklist completo no relatório de auditoria mais recente e em
SECURITY.md. Resumo do que precisa de configuração antes de produção real:

- Credenciais do Mercado Pago e URL de Webhook configuradas (ver PROJECT_SPEC.md → Pagamentos).
- Rate limiting distribuído se houver mais de uma instância (ver SECURITY.md).
- Confirmação de e-mail e templates de e-mail configurados no painel do
  Supabase (Authentication → Email Templates).
- Rodar `npm run build` e os testes de RLS (`tests/rls_authorization.sql`)
  contra um banco de staging antes de ir ao ar.
