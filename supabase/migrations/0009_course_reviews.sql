-- Private student feedback and a public aggregate for published courses.

create table if not exists public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create index if not exists course_reviews_course_id_idx on public.course_reviews(course_id);
alter table public.course_reviews enable row level security;

drop policy if exists "users read own course review" on public.course_reviews;
create policy "users read own course review" on public.course_reviews
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "enrolled students write own course review" on public.course_reviews;
create policy "enrolled students write own course review" on public.course_reviews
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_course(course_id));

drop policy if exists "enrolled students update own course review" on public.course_reviews;
create policy "enrolled students update own course review" on public.course_reviews
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_course(course_id))
  with check (user_id = auth.uid() and public.can_access_course(course_id));

grant select, insert, update on public.course_reviews to authenticated;

create or replace function public.course_review_summary(target_course uuid)
returns table(average_rating numeric, review_count bigint)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(round(avg(review.rating)::numeric, 1), 0),
    count(*)
  from public.course_reviews review
  where review.course_id = target_course
    and exists (
      select 1 from public.courses course
      where course.id = target_course and course.published = true
    )
$$;

revoke all on function public.course_review_summary(uuid) from public;
grant execute on function public.course_review_summary(uuid) to anon, authenticated;