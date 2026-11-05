import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isRoomRateRowSaving, mergeRoomRatesIntoDrafts } from "../src/pricingDrafts.js";

test("pricing UI renders and saves each room hourly rate by studio room id", async () => {
  const pricingTab = await readFile(new URL("../src/components/PricingTab.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(pricingTab, /Погодинна вартість залів/);
  assert.match(pricingTab, /const id = String\(room\.id\)/);
  assert.match(pricingTab, /onSaveStudioRoomHourlyRate\(id, rate\)/);
  assert.match(pricingTab, /Number\.isInteger\(rate\)/);
  assert.match(pricingTab, /rate < 0/);
  assert.match(app, /if \(!isAdmin\) throw new Error\("Доступ до погодинних ставок має лише адміністратор"\)/);
  assert.match(app, /db\.updateStudioRoomHourlyRate\(roomId, hourlyRateUah\)/);
  assert.match(app, /studioRooms=\{studioRooms\}/);
  assert.doesNotMatch(pricingTab, /room\.name\s*===|Зал 1.*500|Зал 2.*250/);
});

test("saving one room rate preserves unsaved drafts for other rooms", () => {
  const rooms = [
    { id: "room-a", hourlyRateUah: 500 },
    { id: "room-b", hourlyRateUah: 250 },
  ];
  const drafts = { "room-a": "700", "room-b": "375" };

  assert.deepEqual(
    mergeRoomRatesIntoDrafts(
      rooms.map((room) => room.id === "room-a" ? { ...room, hourlyRateUah: 700 } : room),
      drafts,
      new Set(["room-b"]),
    ),
    { "room-a": "700", "room-b": "375" },
  );
});

test("an in-flight save locks only its room so the response cannot overwrite a newer draft", async () => {
  assert.equal(isRoomRateRowSaving("room:room-a", "room-a"), true);
  assert.equal(isRoomRateRowSaving("room:room-a", "room-b"), false);

  const pricingTab = await readFile(new URL("../src/components/PricingTab.jsx", import.meta.url), "utf8");
  assert.match(pricingTab, /const isSavingRoom = isRoomRateRowSaving\(saving, id\)/);
  assert.match(pricingTab, /disabled=\{isSavingRoom\} value=\{roomRateDrafts\[id\]/);
  assert.match(pricingTab, /disabled=\{isSavingRoom\} onClick=\{\(\) => saveRoomRate\(room\)\}/);
  assert.match(pricingTab, /String\(savedRate \?\? rate\)/);
});

test("room rate uses the existing admin RPC while trainer fetch remains redacted", async () => {
  const db = await readFile(new URL("../src/db.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql", import.meta.url), "utf8");

  assert.match(db, /crm_admin_update_studio_room_hourly_rate/);
  assert.match(migration, /if not public\.crm_is_admin_session\(\).*Only an administrator may update room hourly rates/i);
  assert.match(migration, /case when public\.crm_is_admin_session\(\) then r\.hourly_rate_uah else null end/i);
  assert.match(migration, /before insert or update of price on public\.room_bookings/i);
  assert.doesNotMatch(migration, /update public\.room_bookings set price[^;]*hourly_rate_uah/i);
});
