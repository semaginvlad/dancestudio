import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAfterCommit } from '../src/committedMutation.js';

test('committed mutation is retained and refresh failure is not a save failure', async () => {
  const committed = { id: 'saved', entryType: 'unpaid' };
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

test('successful refresh replaces the committed fallback without repeating mutation', async () => {
  let local = null;
  let refreshes = 0;
  const result = await reconcileAfterCommit({
    committed: { id: 'saved', entryType: 'subscription' },
    applyCommitted: (row) => { local = row; },
    refresh: async () => { refreshes += 1; return [{ id: 'saved', entryType: 'subscription' }]; },
    applyFresh: (rows) => { local = rows[0]; },
  });
  assert.equal(result.refreshed, true);
  assert.equal(refreshes, 1);
  assert.deepEqual(local, { id: 'saved', entryType: 'subscription' });
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
