-- READ ONLY. Review candidates manually; this intentionally changes nothing.
select
  s.id as subscription_id,
  s.created_at,
  s.student_id,
  s.group_id,
  s.plan_type,
  s.amount,
  s.paid,
  s.pay_method,
  s.notes,
  substring(s.notes from 'auto_one_off_from_attendance:([0-9a-f-]+)') as claimed_attendance_id,
  a.id as attendance_id,
  a.date as attendance_date,
  a.entry_type,
  a.guest_type,
  case
    when a.id is null then 'missing_source_attendance'
    when s.student_id is distinct from a.student_id then 'student_mismatch'
    when s.group_id is distinct from a.group_id then 'group_mismatch'
    when coalesce(s.activation_date,s.start_date) is distinct from a.date then 'date_mismatch'
    when s.paid is true and s.pay_method='card' then 'auto_paid_card_requires_manual_confirmation'
    else 'review'
  end as review_reason
from public.subscriptions s
left join public.attendance a
  on a.id::text=substring(s.notes from 'auto_one_off_from_attendance:([0-9a-f-]+)')
where s.notes like 'auto_one_off_from_attendance:%'
order by s.created_at desc, s.id;
