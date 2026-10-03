-- Module quizzes keep answer keys private and grade submissions in the database.

create table if not exists public.module_assessments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null unique references public.modules(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  pass_percentage integer not null default 70 check (pass_percentage between 50 and 100),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.module_assessments(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 5 and 500),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  position integer not null default 0,
  unique (assessment_id, position)
);

create table if not exists public.module_assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_option integer not null check (correct_option between 0 and 5)
);

create table if not exists public.module_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.module_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists assessment_questions_assessment_position_idx
  on public.assessment_questions(assessment_id, position);
create index if not exists module_assessment_attempts_user_idx
  on public.module_assessment_attempts(user_id, assessment_id, created_at desc);

alter table public.module_assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.module_assessment_answer_keys enable row level security;
alter table public.module_assessment_attempts enable row level security;

drop policy if exists "enrolled students read published assessments" on public.module_assessments;
create policy "enrolled students read published assessments" on public.module_assessments
  for select to authenticated using (
    exists (
      select 1 from public.modules module
      where module.id = public.module_assessments.module_id
        and (public.is_course_manager(module.course_id)
          or (public.module_assessments.published = true and module.published = true and public.can_access_course(module.course_id)))
    )
  );

drop policy if exists "course managers manage assessments" on public.module_assessments;
create policy "course managers manage assessments" on public.module_assessments
  for all to authenticated
  using (public.is_course_manager((select module.course_id from public.modules module where module.id = public.module_assessments.module_id)))
  with check (public.is_course_manager((select module.course_id from public.modules module where module.id = public.module_assessments.module_id)));

drop policy if exists "enrolled students read assessment questions" on public.assessment_questions;
create policy "enrolled students read assessment questions" on public.assessment_questions
  for select to authenticated using (
    exists (
      select 1 from public.module_assessments assessment
      join public.modules module on module.id = assessment.module_id
      where assessment.id = public.assessment_questions.assessment_id
        and (public.is_course_manager(module.course_id)
          or (assessment.published = true and module.published = true and public.can_access_course(module.course_id)))
    )
  );

drop policy if exists "course managers read answer keys" on public.module_assessment_answer_keys;
create policy "course managers read answer keys" on public.module_assessment_answer_keys
  for select to authenticated using (
    exists (
      select 1 from public.assessment_questions question
      join public.module_assessments assessment on assessment.id = question.assessment_id
      join public.modules module on module.id = assessment.module_id
      where question.id = public.module_assessment_answer_keys.question_id and public.is_course_manager(module.course_id)
    )
  );

drop policy if exists "students and managers read assessment attempts" on public.module_assessment_attempts;
create policy "students and managers read assessment attempts" on public.module_assessment_attempts
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.module_assessments assessment
      join public.modules module on module.id = assessment.module_id
      where assessment.id = public.module_assessment_attempts.assessment_id and public.is_course_manager(module.course_id)
    )
  );

grant select, insert, update, delete on public.module_assessments, public.assessment_questions to authenticated;
grant select on public.module_assessment_answer_keys, public.module_assessment_attempts to authenticated;

create or replace function public.save_module_assessment(
  target_module uuid,
  assessment_title text,
  score_threshold integer,
  publish_assessment boolean,
  question_data jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  assessment_id_value uuid;
  question_value jsonb;
  question_id_value uuid;
  option_count integer;
  correct_option_value integer;
  question_position integer := 0;
begin
  if not public.is_course_manager(public.module_course_id(target_module)) then
    raise exception 'Course manager access required';
  end if;
  if char_length(trim(coalesce(assessment_title, ''))) not between 3 and 150
    or score_threshold not between 50 and 100
    or jsonb_typeof(question_data) is distinct from 'array'
    or jsonb_array_length(question_data) not between 1 and 30 then
    raise exception 'Invalid assessment data';
  end if;

  insert into public.module_assessments (module_id, title, pass_percentage, published, updated_at)
  values (target_module, trim(assessment_title), score_threshold, publish_assessment, now())
  on conflict (module_id) do update set
    title = excluded.title,
    pass_percentage = excluded.pass_percentage,
    published = excluded.published,
    updated_at = now()
  returning id into assessment_id_value;

  delete from public.assessment_questions where assessment_id = assessment_id_value;

  for question_value in select value from jsonb_array_elements(question_data) loop
    if jsonb_typeof(question_value) is distinct from 'object'
      or jsonb_typeof(question_value->'options') is distinct from 'array' then
      raise exception 'Invalid assessment question';
    end if;
    option_count := jsonb_array_length(question_value->'options');
    correct_option_value := (question_value->>'correct_option')::integer;
    if char_length(trim(coalesce(question_value->>'prompt', ''))) not between 5 and 500
      or option_count not between 2 and 6
      or correct_option_value < 0 or correct_option_value >= option_count then
      raise exception 'Invalid assessment question';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(question_value->'options') option_value
      where char_length(trim(option_value)) not between 1 and 180
    ) then
      raise exception 'Invalid assessment option';
    end if;

    insert into public.assessment_questions (assessment_id, prompt, options, position)
    values (assessment_id_value, trim(question_value->>'prompt'), question_value->'options', question_position)
    returning id into question_id_value;
    insert into public.module_assessment_answer_keys(question_id, correct_option)
    values (question_id_value, correct_option_value);
    question_position := question_position + 1;
  end loop;

  return assessment_id_value;
end;
$$;

create or replace function public.submit_module_assessment(target_assessment uuid, submitted_answers jsonb)
returns table(score integer, passed boolean, attempt_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  course_id_value uuid;
  passing_score_value integer;
  question_count integer;
  correct_count integer;
  score_value integer;
  passed_value boolean;
  attempt_id_value uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select module.course_id, assessment.pass_percentage
  into course_id_value, passing_score_value
  from public.module_assessments assessment
  join public.modules module on module.id = assessment.module_id
  where assessment.id = target_assessment
    and assessment.published = true
    and module.published = true;
  if not found or not public.can_access_course(course_id_value) then
    raise exception 'Assessment access required';
  end if;

  select count(*)::integer into question_count
  from public.assessment_questions question
  where question.assessment_id = target_assessment;
  if question_count = 0 or jsonb_typeof(submitted_answers) <> 'array'
    or jsonb_array_length(submitted_answers) <> question_count then
    raise exception 'Invalid assessment answers';
  end if;

  select count(*) filter (
    where (submitted_answers->(ordered_question.answer_position))::integer = answer_key.correct_option
  )::integer
  into correct_count
  from (
    select question.id, question.position, row_number() over (order by question.position) - 1 as answer_position
    from public.assessment_questions question
    where question.assessment_id = target_assessment
  ) ordered_question
  join public.module_assessment_answer_keys answer_key on answer_key.question_id = ordered_question.id;

  score_value := round(correct_count * 100.0 / question_count)::integer;
  passed_value := score_value >= passing_score_value;
  insert into public.module_assessment_attempts(assessment_id, user_id, score, passed)
  values (target_assessment, auth.uid(), score_value, passed_value)
  returning id into attempt_id_value;

  return query select score_value, passed_value, attempt_id_value;
end;
$$;

revoke all on function public.save_module_assessment(uuid, text, integer, boolean, jsonb) from public, anon;
revoke all on function public.submit_module_assessment(uuid, jsonb) from public, anon;
grant execute on function public.save_module_assessment(uuid, text, integer, boolean, jsonb) to authenticated;
grant execute on function public.submit_module_assessment(uuid, jsonb) to authenticated;