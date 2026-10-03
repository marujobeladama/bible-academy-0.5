-- 0003_payment_confirmation.sql
-- Função chamada pelo endpoint de webhook (via service role) para confirmar
-- um pagamento e liberar a matrícula em uma única transação atômica —
-- evita o cenário em que o pagamento é marcado "approved" mas a matrícula
-- não chega a ser criada por uma falha no meio do caminho (ou vice-versa).
--
-- SECURITY DEFINER porque a função ainda escreve em "payments" e
-- "enrollments" respeitando a lógica de negócio (idempotência), mesmo que
-- seja chamada por um client autenticado no futuro. Hoje só é chamada pelo
-- webhook usando a service role, que já ignora RLS — a função existe para
-- garantir atomicidade, não para conceder privilégio adicional.

create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_webhook_event_id text
)
returns table (already_processed boolean, enrollment_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_already_event boolean;
  v_enrollment_created boolean := false;
begin
  -- Idempotência de webhook: se este evento específico já foi processado
  -- antes (reentrega do gateway, replay, timeout de rede etc.), não refaz
  -- o trabalho nem duplica a matrícula.
  select exists(
    select 1 from public.payments where webhook_event_id = p_webhook_event_id
  ) into v_already_event;

  if v_already_event then
    return query select true, false;
    return;
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if v_payment.status = 'approved' then
    -- Já confirmado por outro evento/tentativa anterior: idempotente.
    update public.payments
      set webhook_event_id = p_webhook_event_id, updated_at = now()
      where id = p_payment_id;
    return query select true, false;
    return;
  end if;

  update public.payments
    set status = 'approved',
        provider_transaction_id = p_provider_transaction_id,
        webhook_event_id = p_webhook_event_id,
        updated_at = now()
    where id = p_payment_id;

  insert into public.enrollments (user_id, course_id, source, payment_id)
  values (v_payment.user_id, v_payment.course_id, 'payment', p_payment_id)
  on conflict (user_id, course_id) do update set payment_id = excluded.payment_id
  returning true into v_enrollment_created;

  return query select false, coalesce(v_enrollment_created, false);
end;
$$;

-- Marca um pagamento como recusado/cancelado, também de forma idempotente
-- por webhook_event_id.
create or replace function public.mark_payment_status(
  p_payment_id uuid,
  p_status public.payment_status,
  p_webhook_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists(select 1 from public.payments where webhook_event_id = p_webhook_event_id) then
    return;
  end if;

  update public.payments
    set status = p_status, webhook_event_id = p_webhook_event_id, updated_at = now()
    where id = p_payment_id and status <> 'approved';
end;
$$;

-- Revoga execução pública e concede só para o papel usado pela service role
-- (a service key já ignora GRANT/RLS por padrão no Postgres gerenciado pelo
-- Supabase, mas deixamos explícito que authenticated/anon não devem chamar
-- isto diretamente).
revoke execute on function public.confirm_payment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mark_payment_status(uuid, public.payment_status, text) from public, anon, authenticated;

