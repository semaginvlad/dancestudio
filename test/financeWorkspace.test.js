import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { upsertPostedFinancialTransaction } from '../src/revenue.js';

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const finance = source.slice(source.indexOf('{isAdmin && tab==="subs"'), source.indexOf('{/* === СПОВІЩЕННЯ === */}'));
const admin = source.slice(source.indexOf('{isAdmin && tab==="admin" && adminTab==="finance"'), source.indexOf('{/* === АНАЛІТИКА INSTAGRAM === */}'));
const queue = finance.slice(finance.indexOf('<PendingIndividualIncome'), finance.indexOf('<ManualFinancialOperations'));

test('navigation names the main financial workspace Фінанси', () => {
  assert.match(source, /\{id:"subs", label:"Фінанси"\}/);
  assert.doesNotMatch(source, /\{id:"subs", label:"Оплати"\}/);
});

test('admin-only finance workspace owns the single queue before journal, filters and history', () => {
  assert.ok(queue.startsWith('<PendingIndividualIncome'));
  assert.match(queue, /pendingIndividualIncome/);
  assert.match(queue, /manualFinancialOperations\.filter\(\(operation\) => operation.status === "pending"\)\.map\(toPendingManualOperation\)/);
  assert.equal((source.match(/<PendingIndividualIncome\b/g) || []).length, 1);
  assert.ok(finance.indexOf('<ManualFinancialOperations') < finance.indexOf('data-payments-filters'));
  assert.ok(finance.indexOf('data-payments-filters') < finance.indexOf('subsGroupedByDir.grouped'));
});

test('Admin finance keeps analytics without a duplicate confirmation or manual journal', () => {
  assert.ok(admin.length > 0);
  assert.doesNotMatch(admin, /<PendingIndividualIncome|<ManualFinancialOperations|confirmManualFinancialOperation|confirmIndividualIncome/);
  assert.match(admin, /analytics.totalRev/);
  assert.match(admin, /Деталізація по групах/);
});

function confirmation(context) {
  const body = queue.match(/onConfirm=\{(async \(row, payload\) => \{[\s\S]*?)\}\s*\/>/);
  assert.ok(body, 'confirmation callback stays wired to the queue');
  return runInNewContext(`(${body[1]})`, { upsertPostedFinancialTransaction, ...context });
}

for (const pendingType of ['manual', 'rental']) {
  test(`confirmation from Finance posts ${pendingType} with unchanged payload and immediate state update`, async () => {
    const row = { id: 'operation-1', pendingType, status: 'pending' };
    const payload = { amountUah: 325, paymentMethod: 'card', operationDate: '2026-11-10' };
    const posted = { ...row, ...payload, status: 'posted' };
    let manual = pendingType === 'manual' ? [row] : [];
    let pending = pendingType === 'rental' ? [row] : [];
    let income = [];
    const calls = [];
    const confirm = confirmation({
      db: Object.fromEntries(['confirmManualFinancialOperation', 'confirmIndividualIncome'].map(name => [name, async (id, value) => { calls.push({ name, id, value }); return posted; }])),
      setManualFinancialOperations: update => { manual = update(manual); },
      setPostedOneOffIncome: update => { income = update(income); },
      setPendingIndividualIncome: update => { pending = update(pending); },
    });
    await confirm(row, payload);
    assert.deepEqual(calls, [{ name: pendingType === 'manual' ? 'confirmManualFinancialOperation' : 'confirmIndividualIncome', id: row.id, value: payload }]);
    assert.deepEqual(pendingType === 'manual' ? manual : income, [posted]);
    assert.equal(pending.length, 0);
  });
}

test('failed confirmation preserves the pending operation', async () => {
  let changed = false;
  const fail = async () => { throw new Error('Confirmation failed'); };
  const confirm = confirmation({ db: { confirmIndividualIncome: fail, confirmManualFinancialOperation: fail },
    setManualFinancialOperations: () => { changed = true; }, setPostedOneOffIncome: () => { changed = true; }, setPendingIndividualIncome: () => { changed = true; } });
  await assert.rejects(confirm({ id: 'pending' }, {}), /Confirmation failed/);
  assert.equal(changed, false);
});
