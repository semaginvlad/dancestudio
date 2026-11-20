import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { createServer } from 'vite';
import { manualExpenseTotalForRange } from '../src/manualFinancialOperations.js';

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
after(() => server.close());
const { default: Manual } = await server.ssrLoadModule('/src/components/ManualFinancialOperations.jsx');
const { default: Pending } = await server.ssrLoadModule('/src/components/PendingIndividualIncome.jsx');
const theme = { card: '#fff', input: '#fff', border: '#ccc', textMain: '#000', textMuted: '#555', secondary: '#000', danger: 'red', success: 'green' };
const manual = { id: '1', direction: 'expense', categoryCode: 'manual_expense', amountUah: 120, operationDate: '2026-11-10', paymentMethod: 'cash', status: 'posted', note: 'Папір для студії' };
const voided = { ...manual, id: '2', amountUah: 500, note: 'Скасований запис', status: 'voided' };
const byText = (root, type, text) => root.findAllByType(type).find((node) => node.children.includes(text));
const textOf = (node) => JSON.stringify(node.toJSON());

test('manual journal shows description, hides voided until requested, and preserves totals and actions', async () => {
  let voidedRow; let renderer;
  globalThis.window = { confirm: () => true, alert: () => {} };
  await act(() => { renderer = create(React.createElement(Manual, { operations: [manual, voided], theme, inputStyle: {}, primaryButtonStyle: {}, secondaryButtonStyle: {}, onVoid: async (row) => { voidedRow = row; }, onConfirmRequest: () => {} })); });
  assert.match(textOf(renderer), /Папір для студії/);
  assert.doesNotMatch(textOf(renderer), /Скасований запис/);
  assert.equal(manualExpenseTotalForRange([manual, voided], '2026-11-01', '2026-11-30'), 120);
  await act(() => byText(renderer.root, 'button', 'Деталі').props.onClick());
  let dialog = renderer.root.findByProps({ 'aria-label': 'Деталі операції' });
  assert.match(textOf(renderer), /Ручна операція/);
  assert.match(textOf(renderer), /Папір для студії/);
  assert.ok(byText(dialog, 'button', 'Скасувати операцію'));
  await act(() => byText(dialog, 'button', 'Скасувати операцію').props.onClick());
  assert.equal(voidedRow.id, '1');
  await act(() => renderer.root.findByType('input').props.onChange({ target: { checked: true } }));
  assert.match(textOf(renderer), /Скасований запис/);
  assert.match(textOf(renderer), /Скасовано/);
});

test('rental details show available booking information and retain confirmation and cancellation', async () => {
  const row = { id: 'r', categoryCode: 'room_rental', title: 'Майстер-клас', trainerName: 'Олена', roomName: 'Велика зала', occurrenceDate: '2026-11-12', startTime: '10:00', endTime: '11:00', peopleCount: 8, amountUah: 300 };
  let renderer;
  await act(() => { renderer = create(React.createElement(Pending, { rows: [row], onRefresh: () => {}, onConfirm: async () => {}, onVoid: async () => {} })); });
  await act(() => byText(renderer.root, 'button', 'Деталі').props.onClick());
  const dialog = renderer.root.findByProps({ 'aria-label': 'Деталі операції' });
  for (const value of ['Майстер-клас', 'Олена', 'Велика зала', '2026-11-12', '10:00', '11:00', '8', '300']) assert.match(textOf(renderer), new RegExp(value));
  assert.ok(byText(dialog, 'button', 'Скасувати'));
  assert.equal(byText(dialog, 'button', 'Підтвердити'), undefined);
  assert.match(textOf(renderer), /Підтвердження оплати доступне у вкладці/);
});

test('pending manual details use the existing confirmation flow', async () => {
  const row = { ...manual, status: 'pending' };
  let requested; let renderer;
  await act(() => { renderer = create(React.createElement(Manual, { operations: [row], theme, inputStyle: {}, primaryButtonStyle: {}, secondaryButtonStyle: {}, onVoid: async () => {}, onConfirmRequest: (value) => { requested = value; } })); });
  await act(() => byText(renderer.root, 'button', 'Деталі').props.onClick());
  const dialog = renderer.root.findByProps({ 'aria-label': 'Деталі операції' });
  await act(() => byText(dialog, 'button', 'Підтвердити').props.onClick());
  assert.equal(requested.id, row.id);
});

test('finance sections start with pending open and paid and manual lists collapsed, then toggle accessibly', async () => {
  const { default: Posted } = await server.ssrLoadModule('/src/components/PostedRoomRentals.jsx');
  const pendingRow = { id: 'p', pendingType: 'manual', title: 'Очікувана операція', amountUah: 125, details: 'Очікування', secondaryDetails: '125 ₴' };
  const paidRows = [
    { id: 'r1', title: 'Перша подія', occurrenceDate: '2026-11-10', amountUah: 200, categoryCode: 'room_rental', status: 'posted' },
    { id: 'r2', title: 'Друга подія', occurrenceDate: '2026-11-11', amountUah: 350, categoryCode: 'room_rental', status: 'posted' },
  ];
  const fetchOperations = async () => paidRows;
  let pending, posted, journal, unconfirmed;
  globalThis.window = { confirm: () => true, alert: () => {} };
  await act(async () => {
    pending = create(React.createElement(Pending, { rows: [pendingRow], onRefresh: () => {}, onConfirm: async () => {}, onVoid: async () => {} }));
    posted = create(React.createElement(Posted, { fetchOperations, onUnconfirm: async value => { unconfirmed = value; } }));
    journal = create(React.createElement(Manual, { operations: [manual, voided], theme, inputStyle: {}, primaryButtonStyle: {}, secondaryButtonStyle: {}, onVoid: async () => {}, onConfirmRequest: () => {}, onCreate: async () => {} }));
  });
  const toggle = (renderer, id) => renderer.root.findByProps({ 'aria-controls': id });
  const content = (renderer, id) => renderer.root.findByProps({ id });
  const labelText = node => typeof node === 'string' ? node : node.children.map(labelText).join('');
  assert.equal(toggle(pending, 'pending-finance-content').props['aria-expanded'], true);
  assert.equal(content(pending, 'pending-finance-content').props.hidden, false);
  assert.match(labelText(toggle(pending, 'pending-finance-content')), /Записів: 1/);
  assert.equal(toggle(posted, 'posted-finance-content').props['aria-expanded'], false);
  assert.equal(content(posted, 'posted-finance-content').props.hidden, true);
  const postedHeader = labelText(toggle(posted, 'posted-finance-content'));
  assert.match(postedHeader, /Записів: 2/); assert.match(postedHeader, /550/);
  assert.equal(toggle(journal, 'manual-finance-content').props['aria-expanded'], false);
  assert.equal(content(journal, 'manual-finance-content').props.hidden, true);
  assert.match(labelText(toggle(journal, 'manual-finance-content')), /Записів: 2/);
  assert.ok(journal.root.findByProps({ 'data-open-manual-operation': true }), 'manual creation remains available while collapsed');
  await act(() => toggle(pending, 'pending-finance-content').props.onClick());
  assert.equal(content(pending, 'pending-finance-content').props.hidden, true);
  await act(() => toggle(pending, 'pending-finance-content').props.onClick());
  assert.equal(content(pending, 'pending-finance-content').props.hidden, false);
  await act(() => toggle(posted, 'posted-finance-content').props.onClick());
  assert.equal(content(posted, 'posted-finance-content').props.hidden, false);
  await act(() => byText(content(posted, 'posted-finance-content'), 'button', 'Деталі').props.onClick());
  const paidDialog = posted.root.findByProps({ 'aria-label': 'Деталі операції' });
  await act(async () => byText(paidDialog, 'button', 'Скасувати підтвердження').props.onClick());
  assert.equal(unconfirmed.id, 'r1');
  assert.match(labelText(toggle(posted, 'posted-finance-content')), /Записів: 1/);
  await act(() => toggle(journal, 'manual-finance-content').props.onClick());
  assert.equal(content(journal, 'manual-finance-content').props.hidden, false);
  assert.ok(byText(content(journal, 'manual-finance-content'), 'button', 'Деталі'));
  await act(() => toggle(journal, 'manual-finance-content').props.onClick());
  assert.equal(content(journal, 'manual-finance-content').props.hidden, true);
});
