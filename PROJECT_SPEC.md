# PROJECT_SPEC — Bible Academy

## Arquitetura

Next.js App Router com Supabase como backend (Postgres + Auth + Storage).
Autorização é feita em duas camadas independentes e redundantes:

1. **RLS (Row Level Security) no Postgres** — a autoridade real. Toda
   tabela sensível tem RLS habilitada e policies que usam as funções
   `public.is_admin()` e `public.can_access_course(course_id)`
   (`security definer`, definidas em `0001_initial.sql`).
2. **Checagem na API** (`requireUser`/`requireAdmin` em `lib/auth-helpers.ts`)
   — uma segunda camada por conveniência (erro mais claro, evita trabalho
   desnecessário), nunca a única.

O frontend NUNCA é tratado como autoridade de autorização — esconder um
botão não substitui uma policy de RLS em lugar nenhum do projeto.

## Roles

`profiles.role`: `student`, `teacher`, `admin`. Nenhum dos três é
autoatribuível — o cadastro sempre grava `student` (trigger
`handle_new_user`), e mudar para `teacher`/`admin` exige um `UPDATE`
direto no banco feito por quem já é admin (não existe rota de API que
aceite alterar `role` a partir do cliente — ver SECURITY.md).

| Pode... | student | teacher | admin |
|---|---|---|---|
| Ver/estudar cursos matriculados | ✅ | — | ✅ (qualquer) |
| Gerenciar módulos/aulas/materiais/vídeo de um curso | ❌ | ✅ só do(s) curso(s) atribuído(s) (`courses.teacher_id`) | ✅ qualquer curso |
| Criar/excluir curso, mudar preço, publicar/despublicar curso | ❌ | ❌ | ✅ |
| Atribuir professor a um curso | ❌ | ❌ | ✅ |
| Ver/gerenciar alunos e matrículas (`/admin/alunos`) | ❌ | ❌ | ✅ |
| Editar design do site (`/admin/design`) | ❌ | ❌ | ✅ |
| Ver pagamentos | só os próprios | ❌ | ✅ |

Um curso sem `teacher_id` só é gerenciável por admin. Um curso pode ter no
máximo um professor responsável (modelo simples, 1 curso → 1 professor);
o mesmo professor pode ser responsável por vários cursos. Ver
implementação completa (funções SQL, policies) na migration
`0007_teacher_role.sql` e em SECURITY.md → "Role teacher".

## Fluxo: aluno → matrícula → curso → módulo → aula → progresso

1. Aluno se cadastra (`/signup`) → trigger `handle_new_user` cria
   `profiles` com `role='student'` automaticamente.
2. Aluno compra um curso (`/cursos/[id]` → `POST /api/checkout`) ou recebe
   matrícula manual de um admin (`/admin/alunos/[id]`).
3. `enrollments (user_id, course_id)` é a fonte de verdade de posse. RLS em
   `courses`, `modules`, `lessons`, `materials` e no bucket `course-videos`
   sempre verifica `can_access_course()`, que consulta `enrollments`.
4. `/dashboard` lista só os cursos com matrícula — nunca o catálogo
   inteiro (esse era um bug identificado na auditoria original, corrigido).
5. Módulos e aulas têm publicação independente do curso
   (`modules.published`, `lessons.published`) — um curso publicado pode
   ter conteúdo ainda em preparação, invisível ao aluno até ser publicado.
6. Progresso: `lesson_progress (user_id, lesson_id, completed,
   progress_seconds, started_at, updated_at)`, uma linha por aluno×aula,
   escrita só pelo próprio aluno (`POST /api/lessons/[id]/progress`),
   nunca em nome de outro usuário.

## Fluxo: administrador → curso → módulo → aula → material/vídeo

Painel em `/admin` (protegido por `role=admin` no middleware + RLS). CRUD
completo via rotas em `app/api/**` (cursos, módulos, aulas, materiais,
vídeo) — todas com Zod, `requireAdmin`, `originGuard` e rate limit. Um
curso nasce como rascunho (`published=false`); publicar é uma ação
explícita e separada da criação.

## Fluxo: pagamento → webhook → confirmação → matrícula → acesso

**Mercado Pago Checkout Pro está integrado** por adapter em
`lib/payments/gateway.ts`. A ativação ainda exige configuração do proprietário:
`PAYMENT_GATEWAY_PROVIDER=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN` e
`MERCADOPAGO_WEBHOOK_SECRET`. Sem as duas credenciais, checkout e webhook
falham de forma fechada e nenhuma matrícula é liberada.

1. `POST /api/checkout` — aluno autenticado, curso publicado, sem matrícula
   prévia. Cria ou reutiliza uma linha em `payments` com `status='pending'` e
   `amount_cents` vindo do banco (nunca do payload do cliente). Chama
    `lib/payments/gateway.ts::getPaymentGateway().createCheckoutSession()`.
    O adapter cria uma preferência Checkout Pro, com preço calculado pelo
    servidor e `external_reference` vinculado ao pagamento interno.
    - Sem credenciais: resposta `{ configured: false, message }`; nenhum
       pagamento pendente é criado.
2. `POST /api/webhooks/payment` — recebido do gateway (servidor a
    servidor, sem cookie de sessão). Valida `x-signature` com o SDK oficial,
    consulta o pagamento pela API do Mercado Pago e confere referência, valor,
    moeda e status antes de processar — **fail closed**.
3. Evento válido de aprovação → `supabaseAdmin.rpc('confirm_payment', …)`
   (função Postgres `security definer`, migration `0003`): atualiza
   `payments.status='approved'` **e** cria a `enrollment` numa única
   operação no banco, idempotente por `webhook_event_id` (reentregas do
   gateway não duplicam matrícula nem reprocessam).
4. **A liberação do curso nunca depende de o frontend dizer
   "pagamento aprovado"** — só o webhook, com assinatura verificada,
   aciona `confirm_payment`.

### Conectar outro gateway

Implementar outro adapter que satisfaça `PaymentGateway` em
`lib/payments/gateway.ts` (`createCheckoutSession` + `verifyWebhook`) e
adicionar um `case` em `getPaymentGateway()`.

## Storage / vídeo — decisão técnica

**Decisão**: usar o Supabase Storage (buckets privados `course-materials` e
`course-videos`) com URLs assinadas de curta duração, em vez de um serviço
de streaming dedicado (Mux, Cloudflare Stream, etc.), nesta primeira
versão.

**Por quê**: zero infraestrutura/custo adicional (já faz parte do plano do
Supabase), autorização por RLS já reaproveitada dos buckets de materiais
(mesmo padrão, menos código para manter), funciona em qualquer
navegador/celular via tag `<video>` HTML5 padrão. **Trade-off aceito**: não
há transcodificação adaptativa (ABR) nem CDN de borda dedicado a vídeo —
para catálogos grandes ou público internacional, migrar para Mux/Cloudflare
Stream é o próximo passo natural, e a interface de geração de URL
(`GET /api/lessons/[id]/video-url`) já isola essa decisão: trocar o
provedor de vídeo no futuro não deveria exigir mudar o player nem a página
da aula, só a implementação por trás desse endpoint.

Fluxo real implementado (leitura, aluno): login → RLS confirma matrícula +
publicação → `createSignedUrl` (10 min de validade) → `<video>` consome a
URL assinada. Nunca existe uma URL pública/permanente para vídeo pago.

**Upload (admin/professor)**: passou a ser resumível e direto ao Storage,
sem os bytes do arquivo passarem pela API do Next.js — necessário para
suportar 500MB–2GB sem esgotar a memória do servidor. Protocolo TUS via
`tus-js-client`, em três passos (`init` → upload direto → `complete`).
Detalhes completos, incluindo como a autorização por professor responsável
é reforçada no próprio caminho do arquivo, em SECURITY.md → "Upload de
vídeo: arquitetura resumível direta ao Storage".

## Avaliações e certificados

**Avaliações** (`course_reviews`, migration `0009` + `0012`): um aluno
matriculado avalia um curso (nota 1–5 + comentário opcional, um por
curso/aluno — `upsert` por `course_id,user_id`). O aluno pode editar ou
**excluir a própria avaliação a qualquer momento**
(`DELETE /api/courses/[courseId]/review`). Admin pode **moderar**,
excluindo a avaliação de qualquer aluno
(`DELETE /api/admin/reviews/[reviewId]`, seção "Avaliações" na página do
curso em `/admin/cursos/[id]`) — um professor (`teacher`) não tem esse
poder, só admin. A média pública (`course_review_summary`) é calculada no
banco e só considera cursos publicados.

**Certificados** (`certificates`, migration `0012`): ao concluir 100% das
aulas publicadas de um curso, `/dashboard/cursos/[id]/certificado` chama
`issue_certificate(course_id)` — uma função no banco que **reconfere a
elegibilidade do zero a cada chamada** (nunca confia em "completo" vindo
do cliente) e emite um código único de 10 caracteres, de forma idempotente
(chamar de novo devolve o mesmo código, nunca gera um segundo). Esse
código é verificável publicamente, sem login, em
`/certificados/verificar/[codigo]`, que devolve só curso + nome do aluno +
data de emissão — nunca e-mail, nunca qualquer outro dado do perfil.

**Avaliações de módulo / quiz** (`module_assessments` e tabelas
relacionadas, migration `0011`): o professor/admin monta um quiz por
módulo em `/admin/cursos/[id]`; o gabarito fica numa tabela
(`module_assessment_answer_keys`) que nenhuma policy de RLS libera para
aluno ler — a correção acontece inteiramente dentro de
`submit_module_assessment` (função no banco), que recebe só as respostas
marcadas e devolve o resultado, nunca expondo a resposta certa de uma
questão que o aluno errou antes de ele mesmo já ter respondido.

## Indicadores de aprendizagem (admin/professor)

`course_learning_stats_for_manager()` (migration `0010`) agrega, por
curso: matrículas, conclusão média, alunos ativos nos últimos 30 dias e
alunos "precisando de atenção" (matriculados há 14+ dias com menos de 25%
concluído). A função já filtra no próprio SQL
(`where is_admin() or is_course_manager(course.id)`), então um professor
chamando essa função só recebe linhas dos cursos que ele gerencia — nunca
precisa de um filtro adicional no código do app para isso ser seguro.
Visível em `/admin` (admin vê todos os cursos; professor vê só os
próprios, junto de cada card em "Meus cursos").

> Nota de processo: este recurso foi implementado numa rodada de trabalho
> anterior apesar de ter sido pedido explicitamente para ficar para depois.
> A implementação em si foi revisada e está corretamente autorizada (sem
> vazamento entre professores, sem exposição de dado individual de aluno —
> só agregados), por isso foi mantida em vez de revertida, mas o fato de
> ter sido feita fora de ordem fica registrado aqui para transparência.

## O que está PREPARADO mas não conectado

- **Credenciais/URL de Webhook do Mercado Pago** — necessárias para ativar a integração descrita acima.
- **Rate limiting distribuído** (Redis/Upstash) — abstração pronta em
  `lib/security.ts` (`RateLimiter`), implementação ativa ainda em memória.
- **Confirmação de e-mail / templates** — depende de configuração no
  painel do Supabase (Authentication → Email Templates), fora do código.
