import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql', import.meta.url), 'utf8');
const diagnostic = fs.readFileSync(new URL('../supabase/diagnostics/suspicious_auto_one_off_payments.sql', import.meta.url), 'utf8');
const integration = fs.readFileSync(new URL('../supabase/tests/financial_boundary_checks.sql', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const attendanceUi = fs.readFileSync(new URL('../src/components/AttendanceTab.jsx', import.meta.url), 'utf8');
const dbClient = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
const trainerBookingPayload = fs.readFileSync(new URL('../src/trainerBookingPayload.js', import.meta.url), 'utf8');

test('financial hardening is a follow-up migration with canonical authorization', () => {
  assert.match(migration, /public\.rls_is_admin\(\)/i);
  assert.match(migration, /public\.rls_owns_group\(/i);
  assert.doesNotMatch(migration, /user_metadata\s*->|user_metadata\s*->>/i);
  assert.match(migration, /t\.is_active is true[\s\S]*t\.archived_at is null[\s\S]*t\.access_disabled_at is null/i);
  const bookingGuard = migration.match(/create or replace function public\.crm_guard_room_booking_finance[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(migration, /create or replace function public\.crm_is_active_booking_owner\(p_trainer_id text\)[\s\S]*security definer/i);
  assert.match(bookingGuard, /security invoker/i);
  assert.match(bookingGuard, /crm_is_active_booking_owner/i);
  assert.doesNotMatch(bookingGuard, /rls_owns_group|from public\.trainers/i);
});

test('admin confirmation is wired while trainer booking payloads omit finance', () => {
  assert.match(app, /onConfirmAttendancePayment: db\.confirmAttendancePayment/);
  assert.match(attendanceUi, /Підтвердити оплату боргу/);
  assert.match(attendanceUi, /\{isAdmin && <button/);
  assert.match(attendanceUi, /openPaymentConfirmation\(student\)/);
  assert.match(trainerBookingPayload, /price: _price, paymentMethod: _paymentMethod, payment_method: _paymentMethodSnake/);
  assert.match(trainerBookingPayload, /bookingType: existing\.bookingType \?\? existing\.booking_type/);
  assert.match(app, /refresh: db\.fetchScheduleRoomBookings/);
  assert.match(app, /Room booking committed but refresh failed/);
  assert.match(app, /refreshRequired: true/);
  assert.match(attendanceUi, /paymentSavingRef\.current/);
  assert.match(attendanceUi, /Payment committed but attendance refresh failed/);
  assert.match(attendanceUi, /Оплату збережено, але список потребує оновлення/);
  assert.match(attendanceUi, /already_confirmed/);
  assert.match(attendanceUi, /db\.convertGuestToStudent/);
  assert.doesNotMatch(attendanceUi, /createStudentForGroup\(gid,[\s\S]{0,300}relinkGuestAttendanceToStudent/);
  const retryBody = attendanceUi.match(/const retryPaymentRefresh = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
  assert.match(retryBody, /reloadFromDb/);
  assert.doesNotMatch(retryBody, /onConfirmAttendancePayment/);
});

test('trainer attendance cannot manufacture or erase money', () => {
  assert.match(migration, /revoke all on function public\.crm_ensure_one_off_payment_for_attendance/i);
  assert.match(migration, /revoke all on function public\.crm_remove_one_off_payment_if_orphan/i);
  assert.match(migration, /Deliberately never delete or alter a payment/i);
  assert.doesNotMatch(migration.match(/create or replace function public\.crm_record_attendance[\s\S]*?end \$\$;/i)?.[0] || '', /\bpaid\b|pay_method|\bamount\b|insert into public\.subscriptions/i);
});

test('financial mutations are audited and idempotent', () => {
  assert.match(migration, /financial_change_audit/i);
  assert.match(migration, /attendance_mutation_key_uidx/i);
  assert.match(migration, /subscriptions_source_attendance_uidx/i);
  assert.match(migration, /subscriptions_financial_idempotency_uidx/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /exception when unique_violation/i);
  const quantityRpc = migration.match(/create or replace function public\.crm_replace_attendance_quantity[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(quantityRpc, /for update/i);
  assert.match(quantityRpc, /Attendance quantity conflict/i);
  assert.match(quantityRpc, /Subscription has no remaining trainings/i);
  assert.match(quantityRpc, /attendance_quantity_mutations/i);
  assert.match(attendanceUi, /db\.replaceAttendanceQuantity/);
  assert.doesNotMatch(attendanceUi, /await db\.deleteAttendance\(rec\.id\);[\s\S]{0,300}db\.insertAttendance/);
  assert.match(dbClient, /crm_replace_attendance_quantity/);
});

test('trainer projections do not expose financial subscription or booking values', () => {
  const subscriptions = migration.match(/create or replace function public\.crm_fetch_my_attendance_subscriptions[\s\S]*?\$\$;/i)?.[0] || '';
  assert.doesNotMatch(subscriptions, /\bamount\b|base_price|pay_method|discount|\bpaid\b|\bnotes\b/i);
  assert.match(migration, /case when public\.crm_is_admin_session\(\) then rb\.price else null end/i);
  assert.match(migration, /case when public\.crm_is_admin_session\(\) then rb\.payment_method else null end/i);
  assert.match(migration, /crm_is_active_booking_owner\(rb\.trainer_id::text\)/i);
});

test('historical review SQL is read-only and integration checks exercise real roles', () => {
  assert.match(diagnostic, /^-- READ ONLY/i);
  assert.doesNotMatch(diagnostic, /\b(update|delete|insert|alter|drop|truncate|create)\b/i);
  assert.match(integration, /set local role anon/i);
  assert.match(integration, /set local role authenticated/i);
  assert.match(integration, /inactive trainer attendance unexpectedly succeeded/i);
  assert.match(integration, /attendance deletion removed confirmed payment/i);
  assert.match(integration, /rollback;/i);
});
