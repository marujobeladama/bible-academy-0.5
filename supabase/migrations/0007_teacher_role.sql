-- 0007_teacher_role.sql
--
-- Define permissões reais para o role 'teacher' (existia no enum desde a
-- 0001, mas sem nenhuma policy própria — hoje um teacher tem exatamente os
-- mesmos direitos de um student). Não edita nenhuma migration antiga.
--
-- Modelo de permissão escolhido: um curso pode ter um "professor
-- responsável" (courses.teacher_id). Um teacher gerencia CONTEÚDO
-- (módulos, aulas, materiais, vídeo) só dos cursos em que é o responsável.
-- Um teacher NÃO pode: criar/excluir cursos, alterar preço, alterar o
-- título/descrição do curso, publicar/despublicar o curso em si, gerenciar
-- alunos, matrículas ou pagamentos, nem ver/gerenciar cursos de outros
-- professores. Isso evita dar acesso administrativo global "de brinde".
--
-- Documentação completa das permissões por role em PROJECT_SPEC.md.

alter table public.courses add column if not exists teacher_id uuid references public.profiles(id) on delete set null;
create index if not exists courses_teacher_id_idx on public.courses(teacher_id);

-- ============================================================
-- Funções de autorização (security definer, mesmo padrão de is_admin/can_access_course)
-- ============================================================

-- Admin sempre pode gerenciar; teacher só pode gerenciar o curso do qual é
-- o responsável.
create or replace function public.is_course_manager(target_course uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists(
    select 1 from public.courses where id = target_course and teacher_id = auth.uid()
  )
$$;

-- Resolve o course_id de um módulo (helper interno, evita repetir o join).
create or replace function public.module_course_id(target_module uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select course_id from public.modules where id = target_module
$$;

-- Resolve o course_id de uma aula (via módulo).
create or replace function public.lesson_course_id(target_lesson uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.course_id from public.lessons l join public.modules m on m.id = l.module_id where l.id = target_lesson
$$;

create or replace function public.can_manage_module(target_module uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_course_manager(public.module_course_id(target_module))
$$;

create or replace function public.can_manage_lesson(target_lesson uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_course_manager(public.lesson_course_id(target_lesson))
$$;

-- Resolve o lesson_id de um material (para checagens vindas de rotas que só
-- recebem materialId, ex.: DELETE /api/materials/[materialId]).
create or replace function public.material_lesson_id(target_material uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select lesson_id from public.materials where id = target_material
$$;

create or replace function public.can_manage_material(target_material uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_manage_lesson(public.material_lesson_id(target_material))
$$;

-- Extrai o lessonId de um caminho de Storage no formato
-- "lesson-<uuid>/..." (padrão usado por safeStoragePath em lib/security.ts
-- para vídeos e materiais). Retorna null se o caminho não seguir o padrão
-- esperado — nesse caso a autorização abaixo nega por padrão.
create or replace function public.storage_path_lesson_id(path text)
returns uuid
language sql immutable
as $$
  select case
    when path ~ '^lesson-[0-9a-fA-F-]{36}/'
      then substring(path from 8 for 36)::uuid
    else null
  end
$$;

-- Autoriza (SELECT ou INSERT/UPDATE) um objeto de Storage a partir só do
-- caminho, verificando quem gerencia a aula cujo id está embutido no path.
-- Usada tanto para leitura quanto para upload direto (resumível) do
-- navegador ao Storage — o navegador nunca decide sozinho se pode
-- escrever num path; o Postgres decide, via esta função.
create or replace function public.can_manage_lesson_storage_path(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.storage_path_lesson_id(path) is null then false
    else public.can_manage_lesson(public.storage_path_lesson_id(path))
  end
$$;

revoke all on function public.is_course_manager(uuid) from public, anon;
revoke all on function public.module_course_id(uuid) from public, anon;
revoke all on function public.lesson_course_id(uuid) from public, anon;
revoke all on function public.material_lesson_id(uuid) from public, anon;
revoke all on function public.can_manage_module(uuid) from public, anon;
revoke all on function public.can_manage_lesson(uuid) from public, anon;
revoke all on function public.can_manage_material(uuid) from public, anon;
revoke all on function public.can_manage_lesson_storage_path(text) from public, anon;
grant execute on function public.is_course_manager(uuid) to authenticated;
grant execute on function public.module_course_id(uuid) to authenticated;
grant execute on function public.lesson_course_id(uuid) to authenticated;
grant execute on function public.material_lesson_id(uuid) to authenticated;
grant execute on function public.can_manage_module(uuid) to authenticated;
grant execute on function public.can_manage_lesson(uuid) to authenticated;
grant execute on function public.can_manage_material(uuid) to authenticated;
grant execute on function public.can_manage_lesson_storage_path(text) to authenticated;

-- ============================================================
-- RLS: courses — teacher enxerga o próprio curso mesmo em rascunho, mas só
-- admin cria/exclui/publica/altera preço (sem policy de update/insert/delete
-- para teacher aqui — de propósito).
-- ============================================================

drop policy if exists "teacher own course visible" on public.courses;
create policy "teacher own course visible" on public.courses for select to authenticated
  using (teacher_id = auth.uid());

-- ============================================================
-- RLS: modules/lessons/materials — substitui as policies "admin ... write"
-- por versões que também aceitam o professor responsável pelo curso.
-- ============================================================

drop policy if exists "admin modules write" on public.modules;
create policy "course manager modules write" on public.modules for all to authenticated
  using (public.is_course_manager(course_id)) with check (public.is_course_manager(course_id));

drop policy if exists "admin lessons write" on public.lessons;
create policy "course manager lessons write" on public.lessons for all to authenticated
  using (public.can_manage_module(module_id)) with check (public.can_manage_module(module_id));

drop policy if exists "admin materials write" on public.materials;
create policy "course manager materials write" on public.materials for all to authenticated
  using (public.can_manage_lesson(lesson_id)) with check (public.can_manage_lesson(lesson_id));

-- Teacher também precisa enxergar módulos/aulas/materiais do próprio curso
-- mesmo despublicados (para editar antes de publicar) — as policies
-- "enrolled modules/lessons/materials" (0002) já liberam tudo para
-- is_admin(); adicionamos uma policy irmã específica para teacher.
drop policy if exists "course manager modules read" on public.modules;
create policy "course manager modules read" on public.modules for select to authenticated
  using (public.is_course_manager(course_id));

drop policy if exists "course manager lessons read" on public.lessons;
create policy "course manager lessons read" on public.lessons for select to authenticated
  using (public.can_manage_module(module_id));

drop policy if exists "course manager materials read" on public.materials;
create policy "course manager materials read" on public.materials for select to authenticated
  using (public.can_manage_lesson(lesson_id));

-- ============================================================
-- RLS: Storage — vídeo e materiais também autorizam o professor
-- responsável, via caminho (path), não só is_admin().
-- ============================================================

drop policy if exists "admins manage course videos" on storage.objects;
create policy "course managers manage course videos" on storage.objects for all to authenticated
  using (bucket_id = 'course-videos' and public.can_manage_lesson_storage_path(name))
  with check (bucket_id = 'course-videos' and public.can_manage_lesson_storage_path(name));

drop policy if exists "admins manage course materials" on storage.objects;
create policy "course managers manage course materials" on storage.objects for all to authenticated
  using (bucket_id = 'course-materials' and public.can_manage_lesson_storage_path(name))
  with check (bucket_id = 'course-materials' and public.can_manage_lesson_storage_path(name));

-- ============================================================
-- profiles: admin continua sendo o único que promove role (nenhuma
-- mudança necessária aqui — "profiles admin write", da 0001, já cobre
-- alterar um usuário para teacher; o GRANT por coluna da 0002 já impede
-- qualquer usuário de alterar o próprio role, teacher incluído).
-- ============================================================
