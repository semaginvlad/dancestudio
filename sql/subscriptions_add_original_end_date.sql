alter table subscriptions
  add column if not exists original_end_date date;

update subscriptions
set original_end_date = end_date
where original_end_date is null;
