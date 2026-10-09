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
const scheduleUi = fs.readFileSync(new URL('../src/components/ScheduleTab.jsx', import.meta.url), 'utf8');

test('financial hardening is a follow-up migration with canonical authorization', () => {
  assert.match(migration, /public\.rls_is_admin\(\)/i);
  assert.match(migration, /public\.rls_owns_group\(/i);
  assert.doesNotMatch(migration, /user_metadata\s*->|user_metadata\s*->>/i);
  assert.match(migration, /t\.is_active is true[\s\S]*t\.archived_at is null[\s\S]*t\.access_disabled_at is null/i);
  const bookingGuard = migration.match(/create or replace function public\.crm_guard_room_booking_finance[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(migration, /create or replace function public\.crm_is_active_booking_owner\(p_trainer_id text\)[\s\S]*security definer/i);
  assert.match(bookingGuard, /security invoker/i);
  assert.match(bookingGuard, /tg_op='UPDATE'[\s\S]*old\.id is distinct from new\.id[\s\S]*Room booking id is immutable[\s\S]*rls_is_admin/i);
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
  assert.match(attendanceUi,/legacy_unmarked_match/);
  assert.match(attendanceUi,/Можливо, для цього відвідування вже існує історична оплата без технічного зв’язку|inspection\?\.message/);
  const blockedRefresh = attendanceUi.match(/const refreshBlockedPaymentInspection = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
  assert.match(blockedRefresh,/reloadFromDb[\s\S]*onInspectAttendancePayment/);
  assert.doesNotMatch(blockedRefresh,/onConfirmAttendancePayment/);
  assert.match(attendanceUi, /db\.convertGuestToStudent/);
  assert.match(attendanceUi, /Guest conversion committed but attendance refresh failed/);
  assert.match(attendanceUi, /Конвертацію вже збережено, але список потребує оновлення/);
  assert.match(attendanceUi, /guestConversionKeysRef\.current\.delete\(conversionIdentity\)[\s\S]*setGuestConversionRefresh\(null\)/);
  const guestRetryBody = attendanceUi.match(/const retryGuestConversionRefresh = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
  assert.match(guestRetryBody,/reloadFromDb/);
  assert.doesNotMatch(guestRetryBody,/convertGuestToStudent|relinkGuestAttendanceToStudent/);
  assert.match(attendanceUi, /\{isAdmin && <select[\s\S]*<option value="single">Разове<\/option>/);
  assert.match(attendanceUi, /neutralPresence: !isAdmin/);
  assert.match(attendanceUi, /Неоплачені відвідування/);
  assert.match(attendanceUi, /Оформити оплату/);
  assert.match(migration, /crm_record_trainer_presence/);
  assert.match(migration, /Trainers must record neutral presence/i);
  assert.doesNotMatch(attendanceUi, /createStudentForGroup\(gid,[\s\S]{0,300}relinkGuestAttendanceToStudent/);
  const retryBody = attendanceUi.match(/const retryPaymentRefresh = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] || '';
  assert.match(retryBody, /reloadFromDb/);
  assert.doesNotMatch(retryBody, /onConfirmAttendancePayment/);
});

test('trainer attendance cannot manufacture or erase money', () => {
  assert.match(migration, /drop policy if exists "Allow all on attendance"/i);
  for (const policy of ['subscriptions_trainer_select_own_group','subscriptions_trainer_insert_own_group','subscriptions_trainer_update_own_group','subscriptions_trainer_delete_own_group']) {
    assert.match(migration, new RegExp(`drop policy if exists ${policy}`, 'i'));
  }
  assert.match(migration, /policy_postflight[\s\S]*Unknown attendance\/subscription policies require manual review/i);
  assert.match(migration, /create policy attendance_trainer_select_own_groups[\s\S]*rls_owns_group/i);
  assert.match(migration, /to_regprocedure\('public\.crm_ensure_one_off_payment_for_attendance\(uuid\)'\)[\s\S]*revoke all on function public\.crm_ensure_one_off_payment_for_attendance\(uuid\)/i);
  assert.match(migration, /to_regprocedure\('public\.crm_remove_one_off_payment_if_orphan\(uuid\)'\)[\s\S]*revoke all on function public\.crm_remove_one_off_payment_if_orphan\(uuid\)/i);
  assert.doesNotMatch(migration,/^revoke all on function public\.crm_(?:ensure_one_off_payment_for_attendance|remove_one_off_payment_if_orphan)\(uuid\)/im);
  assert.match(migration, /Deliberately never delete or alter a payment/i);
  assert.doesNotMatch(migration.match(/create or replace function public\.crm_record_attendance[\s\S]*?end \$\$;/i)?.[0] || '', /\bpaid\b|pay_method|\bamount\b|insert into public\.subscriptions/i);
});

test('financial mutations are audited and idempotent', () => {
  assert.match(migration, /financial_change_audit/i);
  assert.match(migration, /attendance_mutation_key_uidx/i);
  assert.match(migration, /subscriptions_source_attendance_uidx/i);
  assert.match(migration, /subscriptions_financial_idempotency_uidx/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /crm_delete_attendance[\s\S]*subscriptions s where s\.id=v_probe\.sub_id for update[\s\S]*attendance where id=p_attendance_id for update[\s\S]*delete from public\.attendance/i);
  const deleteRpc = migration.match(/create or replace function public\.crm_delete_attendance[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(deleteRpc,/student_id is null[\s\S]*rls_can_record_attendance\(v_probe\.student_id,v_probe\.group_id\)/i);
  assert.match(deleteRpc,/rls_can_record_attendance\(v_row\.student_id,v_row\.group_id\)[\s\S]*delete from public\.attendance/i);
  assert.match(migration, /Payment confirmation supports exactly one training/i);
  assert.match(migration, /crm_sync_subscription_usage_internal/i);
  assert.match(migration, /v_type not in \('trial','single','unpaid'\)/i);
  assert.match(migration, /exception when unique_violation/i);
  const quantityRpc = migration.match(/create or replace function public\.crm_replace_attendance_quantity[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(quantityRpc,/begin[\s\S]*auth\.uid\(\) is null or not public\.rls_is_admin\(\)[\s\S]*Administrator required[\s\S]*Invalid attendance quantity input[\s\S]*pg_advisory_xact_lock/i);
  assert.doesNotMatch(quantityRpc,/rls_owns_group/);
  assert.match(quantityRpc, /for update/i);
  assert.match(quantityRpc, /Attendance quantity conflict/i);
  assert.match(quantityRpc, /Subscription has no remaining trainings/i);
  assert.match(quantityRpc, /sub_id is null[\s\S]*Quantity changes require subscription attendance/i);
  assert.match(quantityRpc, /attendance_quantity_mutations/i);
  const toggleBody = attendanceUi.match(/const handleToggleCell[\s\S]*?\n  const handleToggleCancelled/)?.[0] || '';
  assert.match(toggleBody, /await db\.deleteAttendance\(rec\.id\)/);
  assert.doesNotMatch(toggleBody, /replaceAttendanceQuantity|targetQuantity: 2/);
  assert.match(toggleBody, /await db\.deleteAttendance\(rec\.id\)[\s\S]*applyAttendanceStateChange/);
  assert.doesNotMatch(attendanceUi, /await db\.deleteAttendance\(rec\.id\);[\s\S]{0,300}db\.insertAttendance/);
  assert.match(dbClient, /crm_replace_attendance_quantity/);
  const neutralRpc = migration.match(/create or replace function public\.crm_record_trainer_presence[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(neutralRpc, /'attendance'[\s\S]*p_group_id[\s\S]*p_student_id/);
  assert.match(neutralRpc,/mutation_key=p_idempotency_key[\s\S]*group_id=p_group_id and a\.date=p_date and a\.student_id=p_student_id[\s\S]*select s\.id into v_sub_id/i);
  assert.match(neutralRpc,/Trainer presence idempotency key conflict/i);
  assert.match(neutralRpc,/Trainer presence payload conflicts with existing attendance/i);
  assert.match(neutralRpc, /for update limit 1/i);
  assert.doesNotMatch(neutralRpc, /for update\s+skip locked/i);
  assert.match(neutralRpc, /greatest\([\s\S]*s\.used_trainings[\s\S]*sum\(a\.quantity\)[\s\S]*total_trainings/i);
  const increaseBody = attendanceUi.match(/const handleIncreaseAttendanceQuantity[\s\S]*?\n  const getCellView/)?.[0] || '';
  assert.match(increaseBody,/if \(!isAdmin\)[\s\S]*Корекцію кількості занять виконує адміністратор/);
  assert.match(increaseBody,/if \(!record\.subId\)[\s\S]*неоплаченого відвідування/i);
  assert.match(increaseBody,/window\.confirm[\s\S]*db\.replaceAttendanceQuantity/);
  assert.match(increaseBody,/db\.replaceAttendanceQuantity[\s\S]*status === "committed"[\s\S]*applyAttendanceStateChange/);
  assert.match(increaseBody,/runIdempotentQuantityMutation[\s\S]*quantityMutationKeysRef/);
  assert.doesNotMatch(increaseBody,/idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(attendanceUi,/aria-label=\{`Додати ще одне заняття\. Зараз/);
  assert.match(attendanceUi,/\{isAdmin && quantityRecord && <button/);
});

test('unmarked historical one-off payments block inspection and confirmation', () => {
  const inspection = migration.match(/create or replace function public\.crm_admin_inspect_attendance_payment[\s\S]*?end \$\$;/i)?.[0] || '';
  const confirmation = migration.match(/create function public\.crm_admin_confirm_attendance_payment[\s\S]*?end \$\$;/i)?.[0] || '';
  for (const body of [inspection,confirmation]) {
    assert.match(body,/source_attendance_id is null/i);
    assert.match(body,/notes,''\) not like 'auto_one_off_from_attendance:%'/i);
    assert.match(body,/plan_type,''\)\) in \('trial','single'\)/i);
    assert.match(body,/v_att\.date between s\.start_date and s\.end_date/i);
  }
  assert.match(inspection,/legacy_unmarked_match/i);
  assert.match(confirmation,/Historical unmarked payment may already exist/i);
});

test('trainer guest attendance is read-only while admin guest flow remains wired', () => {
  const guestToggle = attendanceUi.match(/const handleToggleGuestCell[\s\S]*?\n  const handleIncreaseAttendanceQuantity/)?.[0] || '';
  assert.match(guestToggle,/if \(!isAdmin\) return/);
  assert.match(attendanceUi,/disabled=\{!isAdmin \|\| isCancelledDate\(dateStr\) \|\| saving\}/);
  assert.match(attendanceUi,/Додавання, редагування та прив’язування гостей виконує адміністратор/);
  assert.match(attendanceUi,/\{isAdmin && <button type="button" className="attendance-add-mode-btn"/);
  assert.match(attendanceUi,/setAddMode\("guest"\)/);
  assert.match(guestToggle,/db\.insertAttendance\(payload\)/);
  const relink = migration.match(/create or replace function public\.crm_relink_guest_attendance[\s\S]*?end \$\$;/i)?.[0] || '';
  const conversion = migration.match(/create or replace function public\.crm_convert_guest_to_student[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(relink,/rls_is_admin\(\)[\s\S]*Administrator required/i);
  assert.match(conversion,/rls_is_admin\(\)[\s\S]*Administrator required/i);
});

test('canonical pack synchronization restores the administrator period after usage falls', () => {
  const sync = migration.match(/create or replace function public\.crm_sync_subscription_usage_internal[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(sync,/coalesce\(v_sub\.original_end_date,v_sub\.end_date\)/i);
  assert.match(sync,/v_used<coalesce\(v_sub\.total_trainings,0\)[\s\S]*v_end:=v_canonical_end/i);
  assert.match(sync,/original_end_date=case when v_pack then coalesce\(s\.original_end_date,s\.end_date\)/i);
});

test('trainer projections do not expose financial subscription or booking values', () => {
  const subscriptions = migration.match(/create or replace function public\.crm_fetch_my_attendance_subscriptions[\s\S]*?\$\$;/i)?.[0] || '';
  assert.doesNotMatch(subscriptions, /\bamount\b|base_price|pay_method|discount|\bpaid\b|\bnotes\b/i);
  assert.match(migration, /case when public\.crm_is_admin_session\(\) then rb\.price else null end/i);
  assert.match(migration, /case when public\.crm_is_admin_session\(\) then rb\.payment_method else null end/i);
  assert.match(migration, /crm_is_active_booking_owner\(rb\.trainer_id::text\)/i);
});

test('room booking RLS is replaced and verified before legacy allow-all is removed', () => {
  const replacementCheck = migration.indexOf('room_bookings_replacement_postflight');
  const legacyDrop = migration.indexOf('drop policy if exists "Allow all on room_bookings"');
  assert.ok(replacementCheck > 0 && legacyDrop > replacementCheck);
  for (const policy of [
    'room_bookings_admin_all','room_bookings_trainer_select_own',
    'room_bookings_trainer_insert_own','room_bookings_trainer_update_own',
    'room_bookings_trainer_delete_own',
  ]) assert.match(migration,new RegExp(`create policy ${policy}`,'i'));
  assert.match(migration,/room_bookings_policy_preflight[\s\S]*Unknown room_bookings policies require manual review/i);
  assert.match(migration,/room_bookings_final_postflight[\s\S]*Unexpected final room_bookings policy inventory/i);
  const guard = migration.match(/create or replace function public\.crm_guard_room_booking_finance[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(guard,/event_type='room_booking'[\s\S]*type='room_booking'[\s\S]*booking_type is null/i);
  assert.match(guard,/event_type='individual_training'[\s\S]*type='individual'[\s\S]*individual_1_2[\s\S]*small_group_3_9[\s\S]*group_10_plus/i);
  assert.match(guard,/Unsupported trainer booking classification/i);
});

test('admin subscription conversion includes debt and unpaid through one atomic RPC', () => {
  const conversion = migration.match(/create or replace function public\.crm_admin_convert_unpaid_attendance_to_subscription[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(conversion,/rls_is_admin/);
  assert.match(conversion,/for update/);
  assert.match(conversion,/attendance',v_sub_probe\.group_id,v_sub_probe\.student_id[\s\S]*subscriptions s where s\.id=p_subscription_id for update[\s\S]*order by a\.date,a\.id for update[\s\S]*sum\(a\.quantity\)/i);
  assert.match(conversion,/entry_type,''\)\) in \('debt','unpaid'\)/i);
  assert.match(conversion,/source_attendance_id=a\.id/i);
  assert.match(conversion,/Subscription has no capacity/i);
  assert.match(conversion,/crm_sync_subscription_usage_internal/);
  assert.match(dbClient,/crm_admin_convert_unpaid_attendance_to_subscription/);
  assert.doesNotMatch(dbClient.match(/export async function convertDebtAttendanceToSubscription[\s\S]*?\n\}/)?.[0] || '',/\.from\('attendance'\)\.update/);
});

test('usage-changing RPCs share advisory then subscription then attendance lock order', () => {
  for (const name of ['crm_replace_attendance_quantity','crm_delete_attendance']) {
    const body = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?end \\$\\$;`,'i'))?.[0] || '';
    assert.match(body,/pg_advisory_xact_lock[\s\S]*subscriptions[\s\S]*for update[\s\S]*attendance[\s\S]*for update/i);
  }
  const payment = migration.match(/create function public\.crm_admin_confirm_attendance_payment[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(payment,/attendance-payment[\s\S]*'attendance',v_att_probe\.group_id,v_att_probe\.student_id[\s\S]*attendance a where a\.id=p_attendance_id for update/i);
  const directCreate = migration.match(/create or replace function public\.crm_record_attendance[\s\S]*?end \$\$;/i)?.[0] || '';
  const trainerCreate = migration.match(/create or replace function public\.crm_record_trainer_presence[\s\S]*?end \$\$;/i)?.[0] || '';
  assert.match(directCreate,/p_group_id,p_date::text[\s\S]*'attendance',p_group_id,p_student_id[\s\S]*subscriptions s where s\.id=p_sub_id for update/i);
  assert.match(trainerCreate,/p_group_id,p_date::text,p_student_id[\s\S]*'attendance',p_group_id,p_student_id[\s\S]*subscriptions s[\s\S]*for update limit 1/i);
});

test('new and duplicated bookings clear stale type while edits preserve stored classification', () => {
  const createBody = scheduleUi.match(/const openCreateAt[\s\S]*?setEditingId\(null\);/)?.[0] || '';
  const duplicateBody = scheduleUi.match(/const duplicateBookingLikeEvent[\s\S]*?const activateScheduleEvent/)?.[0] || '';
  assert.match(createBody, /eventType: "room_booking",[\s\S]*type: classificationTypeForEventType\("room_booking"\),[\s\S]*bookingType: null/);
  assert.match(duplicateBody, /type: classificationTypeForEventType\(e\.eventType \|\| "room_booking"\)/);
  assert.match(scheduleUi, /type: editingId \? p\.type : classificationTypeForEventType\(eventType\)/);
  assert.match(scheduleUi, /type: e\.type,[\s\S]*bookingType: e\.bookingType \?\? null/);
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
