# SECURITY — Bible Academy

Este documento descreve as camadas de segurança implementadas, o que ainda
depende de configuração externa, e riscos conhecidos. Escrito para ser
honesto sobre o que foi **testado por revisão estática** vs. o que precisa
de validação em execução real (ver README → Validação local).

## Princípio geral

O frontend nunca é autoridade de autorização. Toda decisão de "este usuário
pode ver/alterar este recurso" é imposta pelo banco (RLS) e reforçada na
API antes de qualquer escrita.

## Autenticação

- Gerenciada pelo Supabase Auth (sem JWT customizado).
- Cadastro (`/signup`), login (`/login`), recuperação (`/forgot-password`),
  redefinição (`/reset-password`), confirmação por e-mail via
  `/auth/confirm` (troca `token_hash` por sessão no servidor, nunca expõe o
  token em client-side além do primeiro redirect).
- Mensagens de erro genéricas em login/cadastro/recuperação — não revelam
  se um e-mail existe na base (proteção contra enumeração de usuários).
- Sessão em cookies `httpOnly` + `sameSite=lax` + `secure` (produção),
  renovada a cada requisição por `middleware.ts`.

## Autorização (RLS)

Toda tabela sensível (`profiles`, `courses`, `modules`, `lessons`,
`materials`, `enrollments`, `lesson_progress`, `payments`) tem RLS
habilitada. Policies usam `is_admin()`/`can_access_course()`
(`security definer`, evita recursão de RLS). Testado por script em
`tests/rls_authorization.sql` (ver seção Testes) — **não executado neste
ambiente** por falta de acesso de rede; deve ser rodado no SQL Editor do
Supabase antes de produção.

### Privilege escalation bloqueado em duas camadas independentes

`profiles.role` nunca é alterável pelo próprio usuário:
1. RLS: `profiles self update` só permite alterar a própria linha.
2. `REVOKE UPDATE ... ; GRANT UPDATE (name) ...`: mesmo que uma policy de
   RLS futura fosse relaxada por engano, o Postgres ainda recusa a escrita
   na coluna `role` para o papel `authenticated` a nível de privilégio de
   coluna — uma segunda trava independente da primeira.

O cadastro (`signUp`) nunca lê `role` do payload/metadata enviado pelo
cliente — o trigger `handle_new_user` sempre grava `'student'`, hardcoded.

### Role `teacher` (migration 0007)

`courses.teacher_id` define o professor responsável por um curso. Duas
camadas, como em todo o resto do projeto:

1. **API**: `requireCourseManager`/`requireModuleManager`/
   `requireLessonManager`/`requireMaterialManager`
   (`lib/auth-helpers.ts`) chamam a função SQL correspondente via RPC
   (`is_course_manager`/`can_manage_module`/`can_manage_lesson`/
   `can_manage_material`) usando o client da própria sessão do usuário —
   `auth.uid()` resolve corretamente dentro da função `security definer`.
   Retornam 403 cedo se nem admin nem professor daquele curso.
2. **RLS**: as mesmas funções são usadas diretamente nas policies de
   `modules`/`lessons`/`materials` (substituindo as antigas
   `admin ... write`, que continuam valendo para admin porque
   `is_course_manager` já inclui `is_admin() OR teacher_id = auth.uid()`)
   e nas policies de `storage.objects` dos buckets de vídeo/materiais, via
   `can_manage_lesson_storage_path` (decodifica o `lessonId` embutido no
   próprio caminho do arquivo).

Um teacher **não pode**: criar/excluir/publicar cursos, alterar preço,
trocar o próprio `teacher_id` para um curso alheio (a rota que atribui
`teacher_id` — `PATCH /api/courses/[id]` — continua exigindo
`requireAdmin`, nunca aceita de um teacher), acessar `/admin/alunos` ou
`/admin/design` (bloqueado em duas camadas: RLS de `profiles`/
`enrollments` já limita o que a query devolve, e `requireAdminPage()`
redireciona a página antes mesmo de tentar), nem virar admin alterando
qualquer requisição (mesma proteção de coluna da seção acima).

## IDOR / BOLA

Todo endpoint que recebe um ID (`courseId`, `lessonId`, `materialId`,
`moduleId`, `userId`) valida o formato (`uuidSchema`) e depende do RLS para
decidir se o recurso existe *para aquele usuário* — trocar o ID na URL para
o recurso de outro curso/aluno resulta em "não encontrado", nunca em
vazamento de dado. Verificado por revisão estática de cada rota em
`app/api/**` e pelo script `tests/rls_authorization.sql` (cenário "Aluno A
não vê Curso B").

## Uploads (materiais e vídeo)

- Autenticação + `requireLessonManager`/`requireMaterialManager` (admin OU
  o professor responsável pelo curso da aula — migration 0007) antes de
  qualquer upload/exclusão.
- Allowlist de MIME type (`ALLOWED_MATERIAL_MIME_TYPES` /
  `ALLOWED_VIDEO_MIME_TYPES` em `lib/validation.ts`).
- **Verificação de magic bytes** (`lib/file-signatures.ts`) para materiais:
  o MIME declarado pelo navegador nunca é confiável sozinho — os primeiros
  bytes do arquivo são conferidos contra a assinatura real esperada antes
  de aceitar o upload. Um `.exe` renomeado para `.pdf` é rejeitado mesmo
  que o `Content-Type` declarado seja `application/pdf`. (Vídeo não passa
  por esta checagem no servidor — ver "Upload de vídeo" abaixo sobre por
  quê, e quais camadas substituem essa proteção nesse caso.)
- Limite de tamanho (`MAX_MATERIAL_SIZE_BYTES` = 50MB,
  `MAX_VIDEO_SIZE_BYTES` = 2GB), reforçado também pelo `file_size_limit`
  do bucket no Postgres.
- **Path traversal impossível por construção**: `safeStoragePath()` nunca
  usa o nome original do arquivo no caminho físico — gera
  `prefix/uuid.ext`, com `ext` derivado só do MIME já validado (nunca do
  nome enviado pelo cliente). O nome original só é guardado como texto em
  `materials.name`, exibido como texto puro (nunca `dangerouslySetInnerHTML`).
- Buckets `course-materials` e `course-videos` são **privados** (não
  públicos). Acesso só via `createSignedUrl` (materiais: 5 min; vídeo:
  10 min), e a policy de storage exige matrícula + publicação (aluno) ou
  gestão do curso (admin/teacher) antes de autorizar a geração da própria
  URL assinada — não é possível assinar uma URL para um arquivo que o
  usuário não tem direito de ver.
- Exclusão: remove primeiro o registro no banco (corta autorização),
  depois o arquivo físico; e ao apagar uma aula, remove vídeo/materiais
  órfãos do bucket antes de apagar a linha.

### Upload de vídeo: arquitetura resumível direta ao Storage

Vídeos não passam mais pela API do Next.js (`arrayBuffer()` completo em
memória) — isso não escalava para arquivos de 500MB–2GB e deixava o
servidor vulnerável a esgotamento de memória com poucos uploads
simultâneos. Fluxo atual, em três passos:

1. `POST /api/lessons/[id]/video/init` — só metadados (mime, tamanho), sem
   bytes. Aqui é onde a autorização de verdade acontece: admin ou o
   professor responsável pela aula (`requireLessonManager`), tamanho/MIME
   validados por Zod. O servidor gera um caminho de Storage seguro e
   imprevisível (`safeStoragePath`) — o cliente nunca escolhe o caminho.
2. O navegador faz upload **resumível** (protocolo TUS, via
   `tus-js-client`) diretamente para
   `https://<projeto>.supabase.co/storage/v1/upload/resumable`, usando a
   própria sessão do usuário (nunca a service role). Pausa e retoma
   sozinho em caso de queda de rede, sem recomeçar do zero.
3. `POST /api/lessons/[id]/video/complete` — confirma que o objeto existe
   de fato no bucket (tentando assinar uma URL para ele) e só então associa
   `video_path` à aula. Um `path` que não comece com `lesson-<id>/video/`
   é rejeitado aqui mesmo antes de checar o Storage.

**Autorização em duas camadas independentes, a mesma disciplina do resto
do projeto**: o passo 2 (upload direto ao Storage) não depende só do
`init` ter autorizado — a policy de RLS em `storage.objects`
(`course managers manage course videos`, migration 0007) decodifica o
`lessonId` embutido no próprio caminho do arquivo
(`can_manage_lesson_storage_path`) e checa de novo, no banco, se quem está
enviando é admin ou o professor daquele curso especificamente. Isso
também é o que impede o cenário "enviar vídeo para outra aula alterando um
ID": mesmo que alguém adulterasse o caminho no cliente, o Postgres recusa
a escrita se o `lessonId` decodificado não for de um curso que essa pessoa
gerencia.

Trade-off aceito: como os bytes não passam mais pela nossa API, a
verificação de magic bytes (`lib/file-signatures.ts`) não se aplica a
vídeo hoje — quem decide aceitar ou não o objeto é o bucket do Supabase
Storage, filtrando por `allowed_mime_types` no cadastro do bucket (mesma
allowlist), mas isso é MIME declarado no upload, não assinatura de bytes.
Na prática o risco é baixo: só admin/professor (papéis já de confiança,
nunca um aluno) conseguem chegar a este endpoint, e o arquivo nunca é
executado no servidor — só é servido de volta como vídeo via `<video>`.

## Avaliações, certificados e indicadores (migrations 0009–0012)

**Avaliações**: `DELETE /api/courses/[courseId]/review` só apaga a linha
`course_id, user_id = auth.uid()` — tanto no filtro da query quanto, de
novo, na policy de RLS `"enrolled students delete own course review"`. A
moderação (`DELETE /api/admin/reviews/[reviewId]`) exige `requireAdmin`
na API e `"admin moderates course reviews"` no banco — um `teacher` não
tem nenhuma das duas camadas liberadas para apagar avaliação de outro
aluno.

**Certificados**: a elegibilidade (curso 100% concluído) é **sempre**
recalculada dentro de `issue_certificate`, no banco, a cada chamada —
nunca confiamos em um campo "completo" vindo do payload do cliente. A
emissão é idempotente por `unique (course_id, user_id)`: não é possível um
aluno gerar dois códigos diferentes para o mesmo curso tentando chamar o
endpoint várias vezes. A verificação pública
(`/certificados/verificar/[codigo]`, função `verify_certificate`) é
deliberadamente `security definer` concedida a `anon` — qualquer pessoa
pode validar um certificado sem login, por design (esse é o propósito de
um certificado verificável) — mas a função devolve só
curso/nome do aluno/data, nunca e-mail, `user_id` ou qualquer outro campo
de `profiles`. Não existe enumeração possível de certificados: o código
tem 10 caracteres hexadecimais (40 bits de entropia), e a função não
diferencia "código não existe" de "código mal formatado" na resposta.

**Indicadores de aprendizagem**: `course_learning_stats_for_manager()`
nunca expõe progresso individual de um aluno — só agregados por curso
(contagens, médias, percentuais). O filtro de autorização
(`is_admin() or is_course_manager(course.id)`) está dentro do próprio SQL
da função, não em cima do resultado — ou seja, um professor literalmente
não recebe linhas de cursos de outro professor da função, não é uma
questão de "o frontend esconder a linha".

## XSS

Nenhum HTML fornecido por usuário é renderizado (`dangerouslySetInnerHTML`
não é usado em nenhum arquivo — verificado por busca em todo o código).
Título/descrição de curso, aula e nome de material são sempre texto
renderizado pelo React (escapado por padrão).

## CSRF / Origin

`originGuard()` (`lib/security.ts`) exige que o header `Origin` bata com
`NEXT_PUBLIC_APP_URL` em toda rota de mutação (`POST`/`PATCH`/`DELETE`) —
aplicado em **todas** as rotas de escrita em `app/api/**` (curso, módulo,
aula, material, vídeo, matrícula, progresso, checkout). A pendência
identificada na auditoria original (`originGuard` existia mas não era
chamado em lugar nenhum) foi corrigida: hoje toda rota de escrita passa por
ele antes de qualquer outra checagem.

Exceção deliberada: `/api/webhooks/payment` **não** usa `originGuard`,
porque é chamado servidor-a-servidor pelo gateway de pagamento (sem
Origin de navegador) — a proteção ali é a verificação de assinatura
(fail closed se ausente/inválida/gateway não configurado).

## Rate limiting

Implementado (`lib/security.ts`) em todas as rotas de mutação, nas rotas de
geração de URL assinada e de upload, e num endpoint dedicado
(`/api/auth/rate-limit`) chamado pelas páginas de login/cadastro/
recuperação de senha antes de falar com o Supabase Auth (essas três telas
chamam o Supabase Auth direto do navegador, então nunca passariam pelas
nossas rotas de API sem esse pre-flight).

**Duas implementações, trocadas automaticamente por variável de ambiente**
(`lib/security.ts`, interface `RateLimiter`):

- `InMemoryRateLimiter` (padrão, sem configuração): em memória do
  processo. Funciona para desenvolvimento/uma instância, **não** é
  confiável com múltiplas instâncias (cada instância tem seu próprio
  contador — o limite real vira LIMIT × nº de instâncias). Usada
  automaticamente sempre que `UPSTASH_REDIS_REST_URL`/
  `UPSTASH_REDIS_REST_TOKEN` não estão definidas — o projeto nunca deixa
  de rodar localmente por falta de Redis.
- `UpstashRedisRateLimiter`: contador distribuído via REST API do Upstash
  Redis (sem SDK — `fetch` puro para `/pipeline`, `INCR`+`EXPIRE` numa
  janela fixa por `key:windowMs:bucket`). Ativada quando
  `RATE_LIMIT_PROVIDER=upstash-redis` e as duas variáveis acima estão
  definidas. Correto com qualquer número de instâncias/regiões, porque o
  contador vive no Redis, não no processo.

**Limites diferentes por tipo de endpoint** (`RATE_LIMIT_PRESETS`):
`default` (60/min, CRUD administrativo geral), `auth` (8 por 5 min —
login/cadastro/recuperação de senha, tanto no pre-flight quanto por
IP+identificador/e-mail, para dificultar força bruta mesmo distribuída
entre vários e-mails de um mesmo IP ou o oposto), `upload` (12/min —
início/conclusão de upload de material e vídeo), `webhook` (200/min,
servidor-a-servidor, reservado para uso futuro caso o webhook do gateway
precise de um limite próprio).

**Fail-safe explícito, e por quê**: se a chamada ao Upstash falhar (rede,
timeout de 1.5s, credencial errada), o rate limiter geral libera a
requisição (fail-open) e loga um aviso — nunca derruba a aplicação por uma
falha do Redis. A única exceção deliberada é o pre-flight de
autenticação (`/api/auth/rate-limit`): erros internos ali retornam 503
(fail-closed), porque o custo de negar por engano (usuário tenta de novo
em instantes) é muito menor que o de liberar login/cadastro sem limite
durante um ataque.

## Webhooks de pagamento

- Fail closed: sem `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`, todo
  webhook é recusado com 503, nenhum evento é processado.
- Verificação de `x-signature` pelo SDK oficial e consulta do pagamento na API
  do Mercado Pago antes de confiar em status, referência, moeda ou valor.
- `external_reference`, valor em centavos e moeda `BRL` são conferidos com o
  pagamento interno antes de confirmar matrícula.
- **Idempotência**: `payments.webhook_event_id` é `unique`; a função
  `confirm_payment` (SQL, migration 0003) checa esse ID antes de
  processar — reentrega do mesmo evento pelo gateway (comum em quase todo
  provedor real) não duplica matrícula nem reprocessa um pagamento já
  aprovado.
- **Proteção contra replay**: consequência direta da idempotência por
  `webhook_event_id` — reenviar o mesmo evento não tem efeito após o
  primeiro processamento bem-sucedido.
- Erro de verificação nunca detalha qual parte falhou (evita ajudar um
  atacante a forjar uma assinatura válida por tentativa e erro).

## Secrets

`MERCADOPAGO_ACCESS_TOKEN` só é lido por `lib/payments/gateway.ts`, no
servidor. `MERCADOPAGO_WEBHOOK_SECRET` só valida notificações nesse mesmo
adapter. Nenhuma das duas variáveis usa prefixo `NEXT_PUBLIC_`.

`SUPABASE_SERVICE_ROLE_KEY` só é usada em `lib/supabase-admin.ts`, marcado
com `import 'server-only'` — importar esse arquivo de um Client Component
quebra o build, uma segunda trava além da ausência do prefixo
`NEXT_PUBLIC_`. É usada em `/api/checkout` somente depois de validar usuário,
curso publicado, ausência de matrícula e preço obtido do banco; também é usada
em `/api/webhooks/payment` após validar a assinatura e consultar o pagamento
no Mercado Pago. Nenhuma chave privilegiada é enviada ao navegador.

## Headers de segurança

Definidos globalmente em `next.config.ts`: `Strict-Transport-Security`,
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Permissions-Policy`, `Content-Security-Policy`. **Risco conhecido, não
corrigido nesta execução**: o CSP mantém `script-src 'unsafe-inline'
'unsafe-eval'`, necessário para o funcionamento atual do Next.js sem um
esquema de nonce por requisição — reduz a proteção do CSP contra XSS.
Endurecer com nonce é um passo futuro razoável, fora do escopo desta
execução por exigir mudanças mais amplas em como o Next.js injeta scripts.

## CORS

Nenhuma rota usa `Access-Control-Allow-Origin: *`. A API é consumida só
pelo próprio frontend (same-origin); não há CORS aberto configurado em
lugar nenhum do projeto.

## Concorrência (progresso)

`lesson_progress` usa `upsert` com `onConflict: 'user_id,lesson_id'`
(chave primária composta) — duas requisições simultâneas do mesmo aluno
para a mesma aula convergem para uma linha só, sem duplicar registro.

## Testes

- `tests/rls_authorization.sql`: script executável (não framework de CI)
  que cria usuários/curso/aula de teste, simula sessões de aluno
  matriculado, aluno não matriculado e admin via
  `set_config('request.jwt.claims', …)` + `set local role authenticated`,
  e verifica os cenários de IDOR, privilege escalation e escrita
  administrativa descritos nos comentários do arquivo. **Não foi
  executado neste ambiente** (sem rede/banco disponível) — rodar no SQL
  Editor de um projeto de desenvolvimento/staging antes de confiar no
  resultado.
- `tests/security-checklist.md`: checklist manual herdada da v0.1.

## Riscos conhecidos não eliminados nesta execução

- CSP com `unsafe-inline`/`unsafe-eval` (ver acima).
- Rate limiting em memória, não distribuído (ver acima).
- `npm run lint`, `npm run typecheck` e `npm run build` foram executados.
  O script RLS ainda precisa ser executado em um banco de desenvolvimento/
  staging; não há cliente PostgreSQL neste container.
- O adapter Mercado Pago está implementado, mas sem
  `PAYMENT_GATEWAY_PROVIDER`, `MERCADOPAGO_ACCESS_TOKEN` e
  `MERCADOPAGO_WEBHOOK_SECRET` configurados, nenhum pagamento real é criado
  nem matrícula liberada.
