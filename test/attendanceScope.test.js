import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql', import.meta.url),'utf8');
const dbClient = fs.readFileSync(new URL('../src/db.js', import.meta.url),'utf8');

test('financial follow-up does not alter schedule or room-booking boundaries', () => {
  assert.doesNotMatch(migration,/room_bookings|room booking|crm_fetch_schedule|operational_room_booking|booking_owner/i);
  assert.equal(fs.existsSync(new URL('../src/roomBookingPayload.js', import.meta.url)),false);
  assert.equal(fs.existsSync(new URL('../src/trainerBookingPayload.js', import.meta.url)),false);
  const bookingClient = dbClient.match(/\/\/ ─── ROOM BOOKINGS ───[\s\S]*?\/\/ ─── CUSTOM ORDERS ───/)?.[0] || '';
  assert.doesNotMatch(bookingClient,/crm_(?:create|update|delete)_operational_room_booking|roomBookingPayload/i);
});
