import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationForBookingEdit } from '../src/roomBookingPayload.js';

const tariffs = ['individual', 'individual_1_2'];

test('editing a room booking into individual training resets both classifications', () => {
  assert.deepEqual(classificationForBookingEdit({
    previousEventType: 'room_booking',
    eventType: 'individual_training',
    type: 'room_booking',
    bookingType: null,
    validIndividualBookingTypes: tariffs,
    defaultIndividualBookingType: 'individual_1_2',
  }), { type: 'individual', bookingType: 'individual_1_2' });
});

test('editing individual training into a room booking clears its tariff classification', () => {
  assert.deepEqual(classificationForBookingEdit({
    previousEventType: 'individual_training',
    eventType: 'room_booking',
    type: 'individual',
    bookingType: 'individual_1_2',
    validIndividualBookingTypes: tariffs,
  }), { type: 'room_booking', bookingType: null });
});

test('unrelated edits preserve stored booking classifications', () => {
  assert.deepEqual(classificationForBookingEdit({
    previousEventType: 'individual_training',
    eventType: 'individual_training',
    type: 'legacy-individual',
    bookingType: 'individual',
    validIndividualBookingTypes: tariffs,
  }), { type: 'legacy-individual', bookingType: 'individual' });
});
