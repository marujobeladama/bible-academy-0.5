-- 0002_foundation.sql
-- Corrige a criação automática de profile, adiciona controle de publicação
-- granular para módulos/aulas, prepara pagamentos e bucket de vídeo.
-- Idempotente: seguro rodar mais de uma vez.

-- ============================================================
-- 1. PROFILES: criação automática + bloqueio de auto-promoção
-- ============================================================

-- E-mail é denormalizado em profiles (somente leitura para o usuário) para
-- permitir que o admin liste/pesquise alunos via PostgREST/RLS normal, sem
-- precisar da service role só para enxergar e-mail. auth.users nunca fica
-- acessível via API pública de qualquer forma.
alter table public.profiles add column if not exists email text;

-- Toda vez que um usuário é criado no Supabase Auth, criamos o profile
-- correspondente com role fixo em 'student'. O valor de "role" NUNCA
-- é lido de raw_user_meta_data — isso impede que alguém se cadastre
-- mandando {"role":"admin"} no payload de signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student',
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém profiles.email sincronizado se o usuário trocar de e-mail.
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();

-- Backfill: garante profile (e email) para usuários que já existiam sem um
-- (ex.: criados manualmente pelo painel do Supabase antes desta migration).
insert into public.profiles (id, name, role, email)
select u.id, coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), 'student', u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email is distinct from u.email);

-- Permite que o próprio usuário atualize seu profile (ex.: nome), mas NUNCA
-- a coluna "role" — isso é reforçado em duas camadas independentes:
--   (a) RLS: só pode alterar a própria linha;
--   (b) GRANT por coluna: o role "authenticated" só tem permissão de UPDATE
--       na coluna "name". Alterar "role" via update direto falha mesmo que
--       a policy de RLS deixasse passar, e mesmo que um bug futuro relaxe a
--       policy, o privilégio de coluna ainda bloqueia.
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- ============================================================
-- 2. PUBLICAÇÃO GRANULAR de módulos e aulas
-- ============================================================

alter table public.modules add column if not exists published boolean not null default false;
alter table public.lessons add column if not exists published boolean not null default false;
alter table public.lessons add column if not exists duration_seconds integer;
alter table public.courses add column if not exists image_url text;

drop policy if exists "enrolled modules" on public.modules;
create policy "enrolled modules" on public.modules for select to authenticated
  using (public.is_admin() or (published = true and public.can_access_course(course_id)));

drop policy if exists "enrolled lessons" on public.lessons;
create policy "enrolled lessons" on public.lessons for select to authenticated
  using (
    public.is_admin()
    or (
      published = true
      and exists (
        select 1 from public.modules m
        where m.id = module_id
          and m.published = true
          and public.can_access_course(m.course_id)
      )
    )
  );

-- Materiais seguem a mesma regra: só visíveis se a aula/módulo estiverem
-- publicados (além da matrícula, já garantida por can_access_course).
drop policy if exists "enrolled materials" on public.materials;
create policy "enrolled materials" on public.materials for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.id = lesson_id
        and l.published = true
        and m.published = true
        and public.can_access_course(m.course_id)
    )
  );

-- ============================================================
-- 3. PROGRESSO: posição de vídeo, rastreio de início
-- ============================================================

alter table public.lesson_progress add column if not exists progress_seconds integer not null default 0;
alter table public.lesson_progress add column if not exists started_at timestamptz;

-- ============================================================
-- 4. MATRÍCULAS: origem e vínculo com pagamento
-- ============================================================

alter table public.enrollments add column if not exists source text not null default 'manual';
alter table public.enrollments add column if not exists payment_id uuid;

-- ============================================================
-- 5. PAGAMENTOS
-- ============================================================

do $$ begin
  create type public.payment_status as enum ('pending','approved','refused','cancelled','refunded');
exception when duplicate_object then null;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status public.payment_status not null default 'pending',
  provider text not null default 'manual',
  provider_transaction_id text,
  webhook_event_id text unique,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Evita registrar duas vezes a mesma transação do mesmo provedor
-- (idempotência de webhook).
create unique index if not exists payments_provider_txn_idx
  on public.payments(provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_course_id_idx on public.payments(course_id);

alter table public.payments enable row level security;

drop policy if exists "own payments read" on public.payments;
create policy "own payments read" on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Escrita de pagamentos é restrita a admin (via UI manual, ex.: cortesia) OU
-- ao backend com service role (webhook do gateway), que ignora RLS por
-- definição. Nenhum cliente comum pode criar/alterar um pagamento como
-- "approved" diretamente.
drop policy if exists "admin payments write" on public.payments;
create policy "admin payments write" on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.enrollments
  add constraint enrollments_payment_id_fkey
  foreign key (payment_id) references public.payments(id) on delete set null;

create index if not exists enrollments_payment_id_idx on public.enrollments(payment_id);

-- ============================================================
-- 6. STORAGE: bucket privado de vídeo
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-videos', 'course-videos', false, 2147483648, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "students read course videos" on storage.objects;
create policy "students read course videos" on storage.objects for select to authenticated
  using (
    bucket_id = 'course-videos'
    and exists (
      select 1 from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.video_path = name
        and l.published = true
        and m.published = true
        and public.can_access_course(m.course_id)
    )
  );

drop policy if exists "admins manage course videos" on storage.objects;
create policy "admins manage course videos" on storage.objects for all to authenticated
  using (bucket_id = 'course-videos' and public.is_admin())
  with check (bucket_id = 'course-videos' and public.is_admin());
