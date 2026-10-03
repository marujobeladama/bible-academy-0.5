-- 0012_reviews_moderation_and_certificates.sql
--
-- Completa o item "avaliações e certificados": permite ao aluno excluir a
-- própria avaliação, permite ao admin moderar (excluir) qualquer avaliação,
-- e implementa certificados de verdade (código único + página pública de
-- verificação), substituindo a versão anterior que só calculava a
-- conclusão na hora e nunca registrava nada.

-- ============================================================
-- 1. Avaliações: exclusão própria + moderação por admin
-- ============================================================

drop policy if exists "enrolled students delete own course review" on public.course_reviews;
create policy "enrolled students delete own course review" on public.course_reviews
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "admin moderates course reviews" on public.course_reviews;
create policy "admin moderates course reviews" on public.course_reviews
  for delete to authenticated
  using (public.is_admin());

grant delete on public.course_reviews to authenticated;

-- ============================================================
-- 2. Certificados
-- ============================================================

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  issued_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create index if not exists certificates_code_idx on public.certificates(code);

alter table public.certificates enable row level security;

-- Só o próprio aluno (ou admin) vê a linha do certificado dele — a
-- verificação pública (abaixo) não lê esta tabela diretamente, passa por
-- uma função que devolve só o estritamente necessário.
drop policy if exists "own certificates read" on public.certificates;
create policy "own certificates read" on public.certificates for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.certificates to authenticated;

-- Emissão: TODA a verificação de elegibilidade acontece aqui, no banco —
-- nunca confiamos em "completed: true" vindo do cliente. Idempotente: uma
-- segunda chamada para o mesmo curso/aluno devolve o mesmo código já
-- emitido, em vez de gerar um novo (o código, uma vez emitido, é
-- permanente e é o que fica gravado/compartilhado pelo aluno).
create or replace function public.issue_certificate(target_course uuid)
returns table(code text, issued_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total int;
  v_completed int;
  v_code text;
  v_issued_at timestamptz;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.enrollments where course_id = target_course and user_id = v_user
  ) then
    raise exception 'Not enrolled';
  end if;

  select count(*) into v_total
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where m.course_id = target_course and m.published = true and l.published = true;

  select count(*) into v_completed
  from public.lesson_progress lp
  join public.lessons l on l.id = lp.lesson_id
  join public.modules m on m.id = l.module_id
  where m.course_id = target_course and m.published = true and l.published = true
    and lp.user_id = v_user and lp.completed = true;

  if v_total = 0 or v_completed < v_total then
    raise exception 'Course not complete';
  end if;

  select c.code, c.issued_at into v_code, v_issued_at
  from public.certificates c
  where c.course_id = target_course and c.user_id = v_user;

  if v_code is not null then
    return query select v_code, v_issued_at;
    return;
  end if;

  -- Código curto, maiúsculo, sem hífen — fácil de digitar/ler em voz alta
  -- na página pública de verificação. Colisão é praticamente impossível
  -- (10 caracteres hexadecimais), mas o UNIQUE da coluna garante de
  -- qualquer forma.
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.certificates (course_id, user_id, code)
  values (target_course, v_user, v_code)
  returning certificates.code, certificates.issued_at into v_code, v_issued_at;

  return query select v_code, v_issued_at;
end;
$$;

revoke all on function public.issue_certificate(uuid) from public, anon;
grant execute on function public.issue_certificate(uuid) to authenticated;

-- Verificação pública: não exige autenticação (qualquer um com o código
-- pode conferir se um certificado é válido — esse é o propósito). Devolve
-- só o nome do curso, o nome do aluno e a data de emissão — nunca e-mail,
-- nunca user_id, nunca qualquer outro dado do perfil ou do curso.
create or replace function public.verify_certificate(input_code text)
returns table(course_title text, student_name text, issued_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select course.title, coalesce(nullif(trim(profile.name), ''), 'Aluno'), cert.issued_at
  from public.certificates cert
  join public.courses course on course.id = cert.course_id
  join public.profiles profile on profile.id = cert.user_id
  where cert.code = upper(trim(input_code))
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
