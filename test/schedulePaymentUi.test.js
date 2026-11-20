import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
after(() => server.close());
const { default: Payment, paymentForEvent } = await server.ssrLoadModule('/src/components/SchedulePayment.jsx');
const event = { kind: 'booking', eventType: 'individual_training', parentId: 'series-segment', date: '2026-11-17', status: 'active' };
const row = { id: 'operation', bookingId: 'series-segment', occurrenceDate: '2026-11-17', categoryCode: 'room_rental', status: 'pending', amountUah: 250, paymentMethod: null, operationDate: null };
const button = (root, text) => root.findAllByType('button').find(node => node.children.includes(text));

test('admin confirms selected occurrence with edited fields and sees paid details', async () => {
  assert.equal(paymentForEvent([row], event, true), row);
  assert.equal(paymentForEvent([row], { ...event, date: '2026-11-24' }, true), null);
  let submitted, renderer;
  const confirm = async (selected, payload) => { submitted = { selected, payload }; };
  await act(() => { renderer = create(React.createElement(Payment, { row, event, onConfirm: confirm })); });
  assert.match(JSON.stringify(renderer.toJSON()), /Очікує оплату/);
  await act(() => button(renderer.root, 'Підтвердити оплату').props.onClick());
  const dialog = renderer.root.findByProps({ 'aria-label': 'Підтвердження оплати' });
  for (const [label, value] of [['Сума', '325'], ['Спосіб оплати', 'card'], ['Дата оплати', '2026-11-19'], ['Категорія', 'individual_training']]) {
    await act(() => dialog.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
  }
  await act(async () => button(dialog, 'Підтвердити оплату').props.onClick());
  assert.deepEqual(submitted, { selected: row, payload: { amountUah: 325, paymentMethod: 'card', operationDate: '2026-11-19', categoryCode: 'individual_training' } });
  await act(() => renderer.update(React.createElement(Payment, { row: { ...row, ...submitted.payload, status: 'posted' }, event, onConfirm: confirm })));
  const result = JSON.stringify(renderer.toJSON());
  for (const value of ['Оплачено', '325', 'Картка', '2026-11-19', 'Індивідуальне тренування']) assert.match(result, new RegExp(value));
  assert.equal(button(renderer.root, 'Підтвердити оплату'), undefined);
});

test('trainer gets no payment and cancelled event cannot be confirmed', async () => {
  assert.equal(paymentForEvent([row], event, false), null);
  let renderer;
  await act(() => { renderer = create(React.createElement(Payment, { row: paymentForEvent([row], event, false), event, onConfirm: () => {} })); });
  assert.equal(renderer.toJSON(), null);
  await act(() => renderer.update(React.createElement(Payment, { row, event: { ...event, status: 'cancelled' }, onConfirm: () => {} })));
  assert.equal(button(renderer.root, 'Підтвердити оплату'), undefined);
});
