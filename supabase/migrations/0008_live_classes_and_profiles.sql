-- Profile details, instructor meeting destination, and course live sessions.

alter table public.profiles
  add column if not exists church text,
  add column if not exists denomination text,
  add column if not exists contact_phone text,
  add column if not exists avatar_path text,
  add column if not exists live_provider text,
  add column if not exists live_url text;

alter table public.profiles
  drop constraint if exists profiles_live_provider_check,
  add constraint profiles_live_provider_check
    check (live_provider is null or live_provider in ('google_meet', 'jitsi'));

revoke update on public.profiles from authenticated;
grant update (name, church, denomination, contact_phone, avatar_path, live_provider, live_url)
  on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public profile avatars read" on storage.objects;
create policy "public profile avatars read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

drop policy if exists "users manage own avatar" on storage.objects;
create policy "users manage own avatar" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.live_classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists live_classes_course_id_starts_at_idx
  on public.live_classes (course_id, starts_at desc);
create index if not exists live_classes_status_starts_at_idx
  on public.live_classes (status, starts_at);

alter table public.live_classes enable row level security;

drop policy if exists "public live class listings" on public.live_classes;
create policy "public live class listings" on public.live_classes
  for select to anon, authenticated using (status in ('scheduled', 'live'));

drop policy if exists "course managers manage live classes" on public.live_classes;
create policy "course managers manage live classes" on public.live_classes
  for all to authenticated
  using (public.is_course_manager(course_id))
  with check (public.is_course_manager(course_id));

create or replace function public.can_join_live_class(target_live_class uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.live_classes lc
    where lc.id = target_live_class
      and lc.status = 'live'
      and (
        public.is_course_manager(lc.course_id)
        or public.can_access_course(lc.course_id)
      )
  )
$$;

revoke all on function public.can_join_live_class(uuid) from public, anon;
grant execute on function public.can_join_live_class(uuid) to authenticated;

grant select on public.live_classes to anon, authenticated;
grant insert, update, delete on public.live_classes to authenticated;
