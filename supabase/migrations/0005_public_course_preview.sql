create or replace function public.is_public_course_preview_module(target_module uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.modules current_module
    join public.courses course on course.id = current_module.course_id
    where current_module.id = target_module
      and current_module.published
      and course.published
      and exists (
        select 1
        from public.lessons first_lesson
        where first_lesson.module_id = current_module.id
          and first_lesson.published
      )
      and not exists (
        select 1
        from public.modules earlier_module
        where earlier_module.course_id = current_module.course_id
          and earlier_module.published
          and exists (
            select 1
            from public.lessons earlier_module_lesson
            where earlier_module_lesson.module_id = earlier_module.id
              and earlier_module_lesson.published
          )
          and (earlier_module.position, earlier_module.id) < (current_module.position, current_module.id)
      )
  );
$$;

create or replace function public.is_public_course_preview_lesson(target_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lessons current_lesson
    join public.modules current_module on current_module.id = current_lesson.module_id
    where current_lesson.id = target_lesson
      and current_lesson.published
      and public.is_public_course_preview_module(current_module.id)
      and not exists (
        select 1
        from public.lessons earlier_lesson
        where earlier_lesson.module_id = current_lesson.module_id
          and earlier_lesson.published
          and (earlier_lesson.position, earlier_lesson.id) < (current_lesson.position, current_lesson.id)
      )
  );
$$;

revoke all on function public.is_public_course_preview_module(uuid) from public;
revoke all on function public.is_public_course_preview_lesson(uuid) from public;
grant execute on function public.is_public_course_preview_module(uuid) to anon, authenticated;
grant execute on function public.is_public_course_preview_lesson(uuid) to anon, authenticated;

drop policy if exists "public first course preview module" on public.modules;
create policy "public first course preview module" on public.modules
  for select to anon, authenticated
  using (public.is_public_course_preview_module(id));

drop policy if exists "public first course preview lesson" on public.lessons;
create policy "public first course preview lesson" on public.lessons
  for select to anon, authenticated
  using (public.is_public_course_preview_lesson(id));

drop policy if exists "public first course preview video" on storage.objects;
create policy "public first course preview video" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'course-videos'
    and exists (
      select 1
      from public.lessons lesson
      where lesson.video_path = name
        and public.is_public_course_preview_lesson(lesson.id)
    )
  );