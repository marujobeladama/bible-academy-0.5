create extension if not exists pgcrypto;
create type public.app_role as enum ('student','teacher','admin');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,name text,role public.app_role not null default 'student',created_at timestamptz not null default now());
create table public.courses(id uuid primary key default gen_random_uuid(),title text not null,description text not null default '',price_cents integer not null default 0 check(price_cents>=0),published boolean not null default false,created_at timestamptz not null default now());
create table public.modules(id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id) on delete cascade,title text not null,position integer not null default 0);
create table public.lessons(id uuid primary key default gen_random_uuid(),module_id uuid not null references public.modules(id) on delete cascade,title text not null,description text not null default '',video_path text,position integer not null default 0);
create table public.materials(id uuid primary key default gen_random_uuid(),lesson_id uuid not null references public.lessons(id) on delete cascade,name text not null,storage_path text not null,mime_type text not null);
create table public.enrollments(user_id uuid not null references auth.users(id) on delete cascade,course_id uuid not null references public.courses(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,course_id));
create table public.lesson_progress(user_id uuid not null references auth.users(id) on delete cascade,lesson_id uuid not null references public.lessons(id) on delete cascade,completed boolean not null default false,updated_at timestamptz not null default now(),primary key(user_id,lesson_id));

alter table public.profiles enable row level security; alter table public.courses enable row level security; alter table public.modules enable row level security; alter table public.lessons enable row level security; alter table public.materials enable row level security; alter table public.enrollments enable row level security; alter table public.lesson_progress enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create or replace function public.can_access_course(target_course uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.is_admin() or exists(select 1 from public.enrollments where user_id=auth.uid() and course_id=target_course) $$;

create policy "profiles self read" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy "profiles admin write" on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "published courses visible" on public.courses for select to anon,authenticated using(published=true or public.is_admin() or exists(select 1 from public.enrollments where user_id=auth.uid() and course_id=id));
create policy "admin courses write" on public.courses for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "enrolled modules" on public.modules for select to authenticated using(public.can_access_course(course_id));
create policy "admin modules write" on public.modules for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "enrolled lessons" on public.lessons for select to authenticated using(exists(select 1 from public.modules m where m.id=module_id and public.can_access_course(m.course_id)));
create policy "admin lessons write" on public.lessons for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "enrolled materials" on public.materials for select to authenticated using(exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where l.id=lesson_id and public.can_access_course(m.course_id)));
create policy "admin materials write" on public.materials for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "own enrollment read" on public.enrollments for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy "admin enrollment write" on public.enrollments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "own progress" on public.lesson_progress for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index modules_course_id_idx on public.modules(course_id); create index lessons_module_id_idx on public.lessons(module_id); create index materials_lesson_id_idx on public.materials(lesson_id); create index enrollments_course_id_idx on public.enrollments(course_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('course-materials','course-materials',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','image/png','image/jpeg']) on conflict(id) do nothing;
create policy "students read course materials" on storage.objects for select to authenticated using(bucket_id='course-materials' and exists(select 1 from public.materials mat join public.lessons l on l.id=mat.lesson_id join public.modules m on m.id=l.module_id where mat.storage_path=name and public.can_access_course(m.course_id)));
create policy "admins manage course materials" on storage.objects for all to authenticated using(bucket_id='course-materials' and public.is_admin()) with check(bucket_id='course-materials' and public.is_admin());
cd "/workspaces/bible-academy/bible-academy-v0_2 (2)/bible-academy"
