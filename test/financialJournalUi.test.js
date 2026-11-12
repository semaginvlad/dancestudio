import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { createServer } from 'vite';
import { manualExpenseTotalForRange } from '../src/manualFinancialOperations.js';

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
  await act(() => byText(dialog, 'button', 'Підтвердити').props.onClick());
  assert.ok(renderer.root.findByProps({ 'aria-label': 'Підтвердження оплати' }));
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
