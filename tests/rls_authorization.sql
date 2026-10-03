-- tests/rls_authorization.sql
--
-- Script de verificação de autorização a nível de banco (RLS). Não é um
-- teste automatizado de CI (o ambiente de desenvolvimento não tem acesso à
-- rede para instalar um runner), mas é executável de verdade: rode isto no
-- SQL Editor do Supabase (ou via `psql`) contra um banco de
-- desenvolvimento/staging — nunca contra produção com dados reais, pois ele
-- cria e remove usuários de teste.
--
-- O que este script verifica:
--   1. Aluno sem matrícula só enxerga a primeira aula gratuita publicada.
--   2. Aluno matriculado no Curso A enxerga o Curso A.
--   3. Aula seguinte e materiais do Curso B continuam privados — BOLA/IDOR a
--      nível de banco.
--   4. Aluno NÃO consegue promover a si mesmo a admin (privilege escalation).
--   5. Aluno NÃO consegue escrever em cursos/módulos/aulas (somente admin).
--   6. Admin enxerga e gerencia tudo.
--   7. Um aluno não consegue ler/alterar o progresso de outro aluno.
--   8. Estorno remove somente a matrícula vinculada ao pagamento e não permite reaprovação atrasada.
--
-- Como rodar: cole o conteúdo no SQL Editor do Supabase e execute. Cada
-- bloco "assert" levanta uma exceção se o resultado esperado não bater —
-- ou seja, se o script terminar sem erro, todos os cenários passaram.

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_student_a_id uuid := gen_random_uuid();
  v_student_b_id uuid := gen_random_uuid();
  v_course_a uuid;
  v_course_b uuid;
  v_module_a uuid;
  v_lesson_a uuid;
  v_lesson_a_second uuid;
  v_module_a_second uuid;
  v_module_b uuid;
  v_lesson_b uuid;
  v_lesson_b_second uuid;
  v_material_b uuid;
  v_payment_id uuid;
  v_payment_status public.payment_status;
  v_result_count integer;
begin
  -- Setup: profiles.id tem FK para auth.users(id), então primeiro criamos
  -- usuários mínimos em auth.users (padrão documentado do Supabase para
  -- seed de usuários de teste via SQL, sem passar pela API de Auth). O
  -- trigger on_auth_user_created (migration 0002) cria o profile
  -- automaticamente com role='student' — por isso promovemos o admin de
  -- teste logo em seguida, como uma ação administrativa explícita, não
  -- como parte do cadastro (é exatamente o comportamento que queremos
  -- validar: role nunca vem do cadastro).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', 'admin-teste@example.com', 'x', now(), now(), now(), '{}', '{"name":"Admin de Teste"}'),
    ('00000000-0000-0000-0000-000000000000', v_student_a_id, 'authenticated', 'authenticated', 'aluno-a-teste@example.com', 'x', now(), now(), now(), '{}', '{"name":"Aluno A de Teste"}'),
    ('00000000-0000-0000-0000-000000000000', v_student_b_id, 'authenticated', 'authenticated', 'aluno-b-teste@example.com', 'x', now(), now(), now(), '{}', '{"name":"Aluno B de Teste"}');

  update public.profiles set role = 'admin' where id = v_admin_id;

  insert into public.courses (title, price_cents, published) values ('Curso A (teste)', 1000, true) returning id into v_course_a;
  insert into public.courses (title, price_cents, published) values ('Curso B (teste)', 1000, true) returning id into v_course_b;

  insert into public.modules (course_id, title, position, published) values (v_course_a, 'Módulo A', 1, true) returning id into v_module_a;
  insert into public.lessons (module_id, title, position, published) values (v_module_a, 'Aula A', 1, true) returning id into v_lesson_a;
  insert into public.lessons (module_id, title, position, published) values (v_module_a, 'Aula A (paga)', 2, true) returning id into v_lesson_a_second;
  insert into public.modules (course_id, title, position, published) values (v_course_a, 'Módulo A (pago)', 2, true) returning id into v_module_a_second;
  insert into public.lessons (module_id, title, published) values (v_module_a_second, 'Aula do segundo módulo', true);

  insert into public.modules (course_id, title, position, published) values (v_course_b, 'Módulo B', 1, true) returning id into v_module_b;
  insert into public.lessons (module_id, title, position, published) values (v_module_b, 'Aula B (prévia)', 1, true) returning id into v_lesson_b;
  insert into public.lessons (module_id, title, position, published) values (v_module_b, 'Aula B (paga)', 2, true) returning id into v_lesson_b_second;
  insert into public.materials (lesson_id, name, storage_path, mime_type) values (v_lesson_b, 'Material B', 'lesson-b/material.pdf', 'application/pdf') returning id into v_material_b;

  -- Aluno A matriculado só no Curso A.
  insert into public.enrollments (user_id, course_id, source) values (v_student_a_id, v_course_a, 'manual');

  -- ===================== CENÁRIO: ALUNO A =====================
  perform set_config('request.jwt.claims', json_build_object('sub', v_student_a_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_result_count from public.courses where id = v_course_a;
  if v_result_count <> 1 then raise exception 'FALHOU: Aluno A deveria enxergar o Curso A'; end if;

  select count(*) into v_result_count from public.lessons where id = v_lesson_a;
  if v_result_count <> 1 then raise exception 'FALHOU: Aluno A deveria enxergar a Aula A'; end if;
  select count(*) into v_result_count from public.lessons where id = v_lesson_a_second;
  if v_result_count <> 1 then raise exception 'FALHOU: Aluno matriculado deveria enxergar a Aula A (paga)'; end if;

  insert into public.lesson_progress (user_id, lesson_id, completed)
  values (v_student_a_id, v_lesson_a, true);

  -- A primeira aula publicada de Curso B é uma prévia pública; o restante segue privado.
  select count(*) into v_result_count from public.lessons where id = v_lesson_b;
  if v_result_count <> 1 then raise exception 'FALHOU: Aluno A deveria enxergar a prévia pública do Curso B'; end if;

  select count(*) into v_result_count from public.lessons where id = v_lesson_b_second;
  if v_result_count <> 0 then raise exception 'FALHOU (IDOR): Aluno A conseguiu ver uma aula paga do Curso B'; end if;

  select count(*) into v_result_count from public.materials where id = v_material_b;
  if v_result_count <> 0 then raise exception 'FALHOU (IDOR): Aluno A conseguiu ver o Material B'; end if;

  -- Privilege escalation: Aluno A não pode alterar seu próprio role.
  begin
    update public.profiles set role = 'admin' where id = v_student_a_id;
    raise exception 'FALHOU: Aluno A conseguiu alterar seu próprio role para admin';
  exception when insufficient_privilege then
    null; -- esperado: GRANT por coluna bloqueia
  end;

  -- Aluno não pode criar curso.
  begin
    insert into public.courses (title, price_cents, published) values ('Curso Hackeado', 0, true);
    raise exception 'FALHOU: Aluno A conseguiu criar um curso';
  exception when insufficient_privilege then
    null;
  end;

  reset role;

  -- ===================== CENÁRIO: ALUNO B (sem matrícula em nada) =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_student_b_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_result_count from public.lessons where id = v_lesson_a;
  if v_result_count <> 1 then raise exception 'FALHOU: Aluno B deveria enxergar a prévia da primeira aula'; end if;

  select count(*) into v_result_count from public.lessons where id = v_lesson_a_second;
  if v_result_count <> 0 then raise exception 'FALHOU (IDOR): Aluno B conseguiu ver uma aula paga'; end if;

  select count(*) into v_result_count from public.modules where course_id = v_course_a;
  if v_result_count <> 1 then raise exception 'FALHOU: Aluno B deveria enxergar somente o primeiro módulo'; end if;

  select count(*) into v_result_count
  from public.lesson_progress
  where user_id = v_student_a_id and lesson_id = v_lesson_a;
  if v_result_count <> 0 then raise exception 'FALHOU: Aluno B conseguiu ler o progresso do Aluno A'; end if;

  update public.lesson_progress
  set completed = false
  where user_id = v_student_a_id and lesson_id = v_lesson_a;
  get diagnostics v_result_count = row_count;
  if v_result_count <> 0 then raise exception 'FALHOU: Aluno B conseguiu alterar o progresso do Aluno A'; end if;

  reset role;

  -- ===================== CENÁRIO: ANÔNIMO =====================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  select count(*) into v_result_count from public.lessons where id = v_lesson_a;
  if v_result_count <> 1 then raise exception 'FALHOU: Visitante deveria enxergar a primeira aula de prévia'; end if;

  select count(*) into v_result_count from public.lessons where id = v_lesson_a_second;
  if v_result_count <> 0 then raise exception 'FALHOU: Visitante conseguiu enxergar uma aula paga'; end if;

  select count(*) into v_result_count from public.materials where id = v_material_b;
  if v_result_count <> 0 then raise exception 'FALHOU: Visitante conseguiu enxergar materiais pagos'; end if;

  reset role;

  -- ===================== CENÁRIO: ADMIN =====================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_result_count from public.courses where id in (v_course_a, v_course_b);
  if v_result_count <> 2 then raise exception 'FALHOU: Admin deveria enxergar ambos os cursos'; end if;

  update public.courses set title = 'Curso A (editado por admin)' where id = v_course_a;
  select count(*) into v_result_count from public.courses where id = v_course_a and title = 'Curso A (editado por admin)';
  if v_result_count <> 1 then raise exception 'FALHOU: Admin deveria conseguir editar cursos'; end if;

  reset role;

  insert into public.payments (user_id, course_id, amount_cents, provider, status)
  values (v_student_b_id, v_course_b, 1000, 'mercadopago', 'pending')
  returning id into v_payment_id;

  perform public.confirm_payment(v_payment_id, 'mp-payment-test', 'mp-approved-test');
  select status into v_payment_status from public.payments where id = v_payment_id;
  if v_payment_status <> 'approved' then raise exception 'FALHOU: pagamento deveria ser aprovado'; end if;
  select count(*) into v_result_count from public.enrollments where payment_id = v_payment_id;
  if v_result_count <> 1 then raise exception 'FALHOU: aprovação deveria criar matrícula'; end if;

  perform public.mark_payment_status(v_payment_id, 'refunded', 'mp-refund-test');
  select status into v_payment_status from public.payments where id = v_payment_id;
  if v_payment_status <> 'refunded' then raise exception 'FALHOU: estorno deveria atualizar pagamento'; end if;
  select count(*) into v_result_count from public.enrollments where payment_id = v_payment_id;
  if v_result_count <> 0 then raise exception 'FALHOU: estorno deveria remover a matrícula do pagamento'; end if;

  perform public.confirm_payment(v_payment_id, 'mp-payment-test', 'mp-delayed-approval-test');
  select status into v_payment_status from public.payments where id = v_payment_id;
  if v_payment_status <> 'refunded' then raise exception 'FALHOU: aprovação atrasada não pode desfazer estorno'; end if;
  select count(*) into v_result_count from public.enrollments where payment_id = v_payment_id;
  if v_result_count <> 0 then raise exception 'FALHOU: aprovação atrasada não pode recriar matrícula'; end if;

  raise notice 'TODOS OS CENÁRIOS PASSARAM.';

  -- Cleanup: remove todos os dados de teste criados acima. Apagar
  -- auth.users casca para public.profiles (FK on delete cascade).
  delete from public.courses where id in (v_course_a, v_course_b); -- cascade cuida de módulos/aulas/materiais/matrículas
  delete from auth.users where id in (v_admin_id, v_student_a_id, v_student_b_id);
end $$;
