import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const manualSource = await readFile(new URL("../src/components/ManualFinancialOperations.jsx", import.meta.url), "utf8");

test("manual operation form is closed initially and opens from the payments header", () => {
  assert.match(manualSource, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(manualSource, /data-open-manual-operation[\s\S]*?onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(manualSource, /\{open && <div className="manual-operation-dialog"/);
});

test("payments tab renders one unified filter set", () => {
  assert.equal((appSource.match(/data-payments-filters/g) || []).length, 1);
  assert.doesNotMatch(appSource, /payments-desktop-filters|payments-filter-shell|payments-mobile-toolbar/);
  assert.match(appSource, />Скинути<\/button>/);
});

test("custom date inputs render only for the custom range preset", () => {
  assert.match(appSource, /filterDatePreset === "custom" && <input aria-label="Дата від"/);
  assert.match(appSource, /filterDatePreset === "custom" && <input aria-label="Дата до"/);
  assert.match(appSource, /<option value="all">Усі дати<\/option>/);
});

test("UI refactor preserves manual-operation payload and existing financial action", () => {
  assert.match(manualSource, /await onCreate\(\{ \.\.\.form, amountUah: amount \}\)/);
  assert.match(appSource, /const operation = await db\.createManualFinancialOperation\(payload\)/);
  assert.match(appSource, /setManualFinancialOperations\(\(current\) => \[operation, \.\.\.current\]\)/);
  assert.match(manualSource, /<option value="pending">Очікує оплату<\/option><option value="posted">Оплачено<\/option>/);
});
