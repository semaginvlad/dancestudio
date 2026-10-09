# Новий staging Supabase: безпечний bootstrap

> **Лише staging.** Не запускайте цей сценарій у production або в проєкті, де вже є CRM-таблиці.

## 1. Створіть порожній проєкт

1. Створіть окремий Supabase project для staging.
2. Не підключайте production database, backup або production environment variables.
3. Відкрийте в GitHub файл [`supabase/staging_bootstrap.sql`](./staging_bootstrap.sql) у поточній гілці PR.
4. Натисніть **Raw**, скопіюйте **весь файл** без змін.
5. У новому staging project відкрийте **SQL Editor → New query**, вставте файл і натисніть **Run** один раз.

Bootstrap має empty-database guard і зупиниться, якщо `students`, `subscriptions` або `attendance` уже існують. Він створює порожню CRM-схему, застосовує historical prerequisites, потім усі versioned migrations у порядку імен файлів. Останньою виконується поточна financial-hardening migration. Production trainer-profile UUID seeds навмисно видалені; реальних учениць, контактів чи оплат файл не містить.

## 2. Коротка перевірка

Запустіть окремим query:

```sql
select to_regclass('public.students') as students,
       to_regclass('public.attendance') as attendance,
       to_regclass('public.subscriptions') as subscriptions,
       to_regclass('public.room_bookings') as room_bookings;

select to_regprocedure('public.crm_record_trainer_presence(uuid,date,text,integer,uuid)') as trainer_presence,
       to_regprocedure('public.crm_admin_record_reception(uuid,date,text,text,text,integer,text,uuid)') as admin_reception,
       to_regprocedure('public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean,text)') as payment_confirmation;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('attendance', 'subscriptions', 'students', 'student_groups', 'room_bookings')
order by tablename, policyname;
```

Усі `to_regclass`/`to_regprocedure` мають бути не `NULL`. Для `subscriptions` має залишитися лише admin write policy; для attendance trainer має мати scoped `SELECT`, а не direct write policy.

## 3. Мінімальні тестові користувачі й дані

1. Відкрийте **Authentication → Users → Add user**.
2. Створіть staging-admin з email, який уже входить до repository admin allow-list, і окремого trainer з тестовим email. Увімкніть **Auto Confirm User**.
3. Використовуйте лише унікальні staging-only паролі. **Не надсилайте паролі, API keys, service-role keys або production дані в чат чи commit.**
4. Після створення Auth users виконайте нижче, замінивши лише два email:

```sql
do $$
declare
  v_trainer_auth uuid;
  v_trainer_id uuid := gen_random_uuid();
  v_student_id uuid := gen_random_uuid();
begin
  select id into strict v_trainer_auth
  from auth.users
  where lower(email) = lower('trainer-staging@example.test');

  insert into public.trainers(id, name, auth_user_id, is_active)
  values (v_trainer_id, 'Staging Trainer', v_trainer_auth, true);

  insert into public.groups(id, name, direction_id, schedule, trainer_id)
  values ('staging-group', 'Staging Group', 'latina',
          '[{"day":1,"time":"18:00"}]'::jsonb, v_trainer_id);

  insert into public.trainer_groups(trainer_id, group_id, is_primary)
  values (v_trainer_id, 'staging-group', true);

  insert into public.students(id, name)
  values (v_student_id, 'Staging Student');

  insert into public.student_groups(student_id, group_id)
  values (v_student_id, 'staging-group');
end $$;
```

Тестову оплату створюйте лише через admin reception UI/RPC після входу staging-admin. Для trainer перевірте, що можна відмітити нейтральну присутність призначеної учениці, але не можна читати/редагувати finance або roster.

## 4. Межі локальної перевірки

Automated test запускає повний bootstrap у disposable PGlite з локальними заглушками для Supabase-managed `auth`, `storage` і database roles. У справжньому Supabase ці об’єкти вже створені платформою; не створюйте їх вручну. Остаточну Auth/RLS перевірку виконайте через дві staging-сесії (admin і trainer) за кроками вище.

