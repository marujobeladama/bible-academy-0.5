-- Aggregate learning indicators without exposing individual student progress.

create or replace function public.course_learning_stats_for_manager()
returns table (
  course_id uuid,
  course_title text,
  enrolled_students bigint,
  average_completion integer,
  active_students bigint,
  students_needing_attention bigint
)
language sql stable security definer set search_path = public
as $$
  with published_lesson_counts as (
    select module.course_id, count(lesson.id)::bigint as lesson_count
    from public.modules module
    join public.lessons lesson on lesson.module_id = module.id and lesson.published = true
    where module.published = true
    group by module.course_id
  ),
  enrollment_progress as (
    select
      enrollment.course_id,
      enrollment.user_id,
      enrollment.created_at as enrolled_at,
      coalesce(published_lesson_counts.lesson_count, 0)::bigint as lesson_count,
      count(distinct lesson_progress.lesson_id) filter (where lesson_progress.completed = true)::bigint as completed_count,
      max(lesson_progress.updated_at) as last_activity
    from public.enrollments enrollment
    join public.profiles student on student.id = enrollment.user_id and student.role = 'student'
    left join published_lesson_counts on published_lesson_counts.course_id = enrollment.course_id
    left join public.modules module on module.course_id = enrollment.course_id and module.published = true
    left join public.lessons lesson on lesson.module_id = module.id and lesson.published = true
    left join public.lesson_progress lesson_progress
      on lesson_progress.lesson_id = lesson.id and lesson_progress.user_id = enrollment.user_id
    group by enrollment.course_id, enrollment.user_id, enrollment.created_at, published_lesson_counts.lesson_count
  )
  select
    course.id,
    course.title,
    count(enrollment_progress.user_id)::bigint,
    coalesce(round(avg(
      case when enrollment_progress.lesson_count > 0
        then enrollment_progress.completed_count * 100.0 / enrollment_progress.lesson_count
        else null
      end
    )), 0)::integer,
    count(enrollment_progress.user_id) filter (
      where enrollment_progress.last_activity >= now() - interval '30 days'
    )::bigint,
    count(enrollment_progress.user_id) filter (
      where enrollment_progress.lesson_count > 0
        and enrollment_progress.enrolled_at <= now() - interval '14 days'
        and enrollment_progress.completed_count * 4 < enrollment_progress.lesson_count
    )::bigint
  from public.courses course
  left join enrollment_progress on enrollment_progress.course_id = course.id
  where public.is_admin() or public.is_course_manager(course.id)
  group by course.id, course.title
  order by course.title;
$$;

revoke all on function public.course_learning_stats_for_manager() from public, anon;
grant execute on function public.course_learning_stats_for_manager() to authenticated;