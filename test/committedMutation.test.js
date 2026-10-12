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

test('committed guest conversion keeps its key across failed refresh and retries refresh only', async () => {
  const keys = new Map([['guest-identity','stable-key']]);
  let mutations = 0;
  let refreshes = 0;
  let committedState = null;
  let notice = '';
  const committed = (() => {
    mutations += 1;
    return { createdStudent:{id:'student'},conversionIdentity:'guest-identity',idempotencyKey:'stable-key' };
  })();
  const result = await reconcileAfterCommit({
    committed,
    applyCommitted: (value) => { committedState = {...value,committed:true,refreshRequired:true}; },
    refresh: async () => { refreshes += 1; throw new Error('offline'); },
    applyFresh: () => { throw new Error('must not apply'); },
    onRefreshFailure: () => { notice = 'Конвертацію вже збережено, але список потребує оновлення.'; },
  });
  assert.equal(result.refreshRequired,true);
  assert.equal(mutations,1);
  assert.equal(keys.get('guest-identity'),'stable-key');
  assert.equal(committedState.createdStudent.id,'student');
  assert.match(notice,/вже збережено/);

  const refreshOnlyRetry = async () => {
    refreshes += 1;
    keys.delete(committedState.conversionIdentity);
    committedState = null;
    notice = '';
  };
  await refreshOnlyRetry();
  assert.equal(mutations,1);
  assert.equal(refreshes,2);
  assert.equal(keys.has('guest-identity'),false);
  assert.equal(committedState,null);
  assert.equal(notice,'');
});
