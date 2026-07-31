import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSiteTrainerContent, normalizeProfileSections } from '../src/shared/siteTrainerContent.js';

test('blank profile strings normalize to null', () => {
  const result = normalizeSiteTrainerContent({ publicName: '   ', roleLabel: ' Тренер ' });
  assert.equal(result.publicName, null);
  assert.equal(result.roleLabel, 'Тренер');
  assert.equal(result.profileSections, null);
});

test('sections require title and body and receive stable ordering', () => {
  assert.throws(() => normalizeProfileSections([{ title: 'Про мене', body: ' ' }]), /Заповніть/);
  assert.deepEqual(normalizeProfileSections([
    { title: ' About ', body: ' One ' },
    { key: 'existing-key', title: 'Two', body: ' Two body ' },
  ]), [
    { key: 'about', title: 'About', body: 'One', sort_order: 10 },
    { key: 'existing-key', title: 'Two', body: 'Two body', sort_order: 20 },
  ]);
});
