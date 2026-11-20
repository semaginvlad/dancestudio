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


test('attendance cells keep their click handlers without visible edit indicators', async () => {
  const ui=await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url),'utf8');
  assert.doesNotMatch(ui,/[✎✏]/u);
  assert.match(ui,/onClick=\{\(\) => handleToggleCell\(student, dateStr\)\}/);
  assert.match(ui,/onClick=\{\(\) => handleToggleGuestCell\(student, dateStr\)\}/);
  assert.match(ui,/onClick=\{\(\) => openHistoricalCorrection\(student, dateStr\)\}\s+style=\{hiddenCorrectionActionStyle\}/);
  assert.match(ui,/onClick=\{\(\) => openHistoricalCorrectionRows\(\[rec\]\)\} style=\{hiddenCorrectionActionStyle\}/);
  assert.match(ui,/color: "transparent"/);
});
