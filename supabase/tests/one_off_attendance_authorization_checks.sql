-- Read-only regression checks for the effective one-off Attendance RPCs.

do $$
declare
  ensure_def text := lower(pg_get_functiondef(
    'public.crm_ensure_one_off_payment_for_attendance(uuid)'::regprocedure
  ));
  remove_def text := lower(pg_get_functiondef(
    'public.crm_remove_one_off_payment_if_orphan(uuid)'::regprocedure
  ));
begin
  -- Assigned trainers must use the same canonical trainer_groups ownership
  -- predicate for both creating and removing an Attendance one-off payment.
  if ensure_def not like '%rls_owns_group(v_att.group_id)%'
     or remove_def not like '%rls_owns_group(v_att.group_id)%'
     or ensure_def like '%g.trainer_id%auth.uid()%'
     or remove_def like '%g.trainer_id%auth.uid()%' then
    raise exception 'one-off Attendance RPCs do not use canonical trainer group ownership';
  end if;

  -- Subscription/debt rows return before one-off authorization, so their
  -- Attendance mutations cannot fail with a one-off access denial.
  if strpos(ensure_def, 'v_entry_type not in (''trial'', ''single'')') = 0
     or strpos(ensure_def, 'v_has_group_access := public.rls_owns_group') = 0
     or strpos(ensure_def, 'v_entry_type not in (''trial'', ''single'')')
        > strpos(ensure_def, 'v_has_group_access := public.rls_owns_group')
     or strpos(remove_def, 'v_entry_type not in (''trial'', ''single'')') = 0
     or strpos(remove_def, 'v_has_group_access := public.rls_owns_group') = 0
     or strpos(remove_def, 'v_entry_type not in (''trial'', ''single'')')
        > strpos(remove_def, 'v_has_group_access := public.rls_owns_group') then
    raise exception 'non-one-off Attendance does not return before one-off authorization';
  end if;
end
$$;
