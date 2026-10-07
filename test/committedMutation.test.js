import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCommittedBooking, reconcileAfterCommit } from '../src/committedMutation.js';

test('committed mutation is retained and refresh failure is not a save failure', async () => {
  const committed = { id: 'saved', price: 500 };
  let local = null;
  let warning = '';
  const result = await reconcileAfterCommit({
    committed,
    applyCommitted: (row) => { local = row; },
    refresh: async () => { throw new Error('offline'); },
    applyFresh: () => { throw new Error('must not apply'); },
    onRefreshFailure: () => { warning = 'refresh only'; },
  });
  assert.deepEqual(local, committed);
  assert.equal(result.refreshed, false);
  assert.equal(result.refreshRequired, true);
  assert.equal(warning, 'refresh only');
});

test('partial booking response preserves omitted finance and respects explicit null', () => {
  const existing = { id: 'booking', color: 'red', price: 500, paymentMethod: 'cash' };
  assert.deepEqual(
    mergeCommittedBooking(existing, { id: 'booking', color: 'blue' }, { color: 'blue' }),
    { id: 'booking', color: 'blue', price: 500, paymentMethod: 'cash' },
  );
  assert.deepEqual(
    mergeCommittedBooking(existing, { id: 'booking', color: 'blue' }, { color: 'blue', price: null, paymentMethod: null }),
    { id: 'booking', color: 'blue', price: null, paymentMethod: null },
  );
});

test('color-only committed update keeps finance when refresh fails without retrying mutation', async () => {
  let local;
  let mutations = 1;
  const committed = mergeCommittedBooking(
    { id: 'booking', color: 'red', price: 500, paymentMethod: 'card' },
    { id: 'booking', color: 'blue' },
    { color: 'blue' },
  );
  const result = await reconcileAfterCommit({
    committed,
    applyCommitted: (row) => { local = row; },
    refresh: async () => { throw new Error('refresh failed'); },
  });
  assert.equal(result.refreshRequired, true);
  assert.deepEqual(local, { id: 'booking', color: 'blue', price: 500, paymentMethod: 'card' });
  assert.equal(mutations, 1);
});

test('successful refresh replaces the committed fallback without repeating mutation', async () => {
  let local = null;
  let refreshes = 0;
  const result = await reconcileAfterCommit({
    committed: { id: 'saved', price: 500 },
    applyCommitted: (row) => { local = row; },
    refresh: async () => { refreshes += 1; return [{ id: 'saved', price: 500 }]; },
    applyFresh: (rows) => { local = rows[0]; },
  });
  assert.equal(result.refreshed, true);
  assert.equal(refreshes, 1);
  assert.deepEqual(local, { id: 'saved', price: 500 });
});
