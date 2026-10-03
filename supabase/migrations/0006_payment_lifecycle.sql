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
  v_enrollment_created boolean := false;
begin
  if exists (select 1 from public.payments where webhook_event_id = p_webhook_event_id) then
    return query select true, false;
    return;
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if v_payment.status in ('approved', 'refused', 'cancelled', 'refunded') then
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
declare
  v_current_status public.payment_status;
begin
  if exists (select 1 from public.payments where webhook_event_id = p_webhook_event_id) then
    return;
  end if;

  select status into v_current_status
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return;
  end if;

  if p_status = 'refunded' then
    update public.payments
    set status = 'refunded', webhook_event_id = p_webhook_event_id, updated_at = now()
    where id = p_payment_id;

    delete from public.enrollments
    where payment_id = p_payment_id and source = 'payment';
    return;
  end if;

  if v_current_status in ('approved', 'refused', 'cancelled', 'refunded') then
    return;
  end if;

  update public.payments
  set status = p_status, webhook_event_id = p_webhook_event_id, updated_at = now()
  where id = p_payment_id;
end;
$$;