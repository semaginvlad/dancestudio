import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAfterCommit } from '../src/committedMutation.js';

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
