import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('historical correction is admin-only, offers 0–2 and uses the transactional RPC', async () => {
  const ui=await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url),'utf8');
  const db=await readFile(new URL('../src/db.js', import.meta.url),'utf8');
  assert.match(ui,/isAdmin && historicalCorrection && createPortal/);
  assert.match(ui,/aria-label="Виправити кількість"/);
  for (const n of [0,1,2]) assert.match(ui,new RegExp(`<option value="${n}">`));
  assert.match(ui,/db\.correctHistoricalAttendance\(historicalCorrection\.id/);
  assert.match(ui,/await reloadFromDb\(\)/);
  assert.match(db,/rpc\('crm_admin_correct_historical_attendance'/);
});
