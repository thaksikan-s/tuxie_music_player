const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDevicePage, nextVisibleCount } = require('../library-state.js');

const local = { id: 'local:1', kind: 'local', title: 'Picked file' };
const pageOne = Array.from({ length: 200 }, (_, index) => ({ id: `android:${index + 1}`, kind: 'android' }));
const pageTwo = Array.from({ length: 200 }, (_, index) => ({ id: `android:${index + 201}`, kind: 'android' }));

test('device indexing retains every auto-scanned page beyond 200 songs', () => {
  const first = mergeDevicePage([local], pageOne, { append: false });
  const all = mergeDevicePage(first, pageTwo, { append: true });
  assert.equal(all.length, 401);
  assert.equal(all.filter(track => track.kind === 'android').length, 400);
  assert.equal(all[0].id, 'local:1');
});

test('a fresh rescan drops stale library rows but preserves an active queue item', () => {
  const old = [{ id: 'android:gone', kind: 'android' }, { id: 'android:playing', kind: 'android' }, local];
  const merged = mergeDevicePage(old, [{ id: 'android:new', kind: 'android' }], {
    append: false,
    queueIds: ['android:playing'],
    currentId: 'android:playing'
  });
  assert.deepEqual(merged.map(track => track.id), ['local:1', 'android:playing', 'android:new']);
});

test('the scrolling window grows in fixed bounded increments', () => {
  assert.equal(nextVisibleCount(60, 400, 60), 120);
  assert.equal(nextVisibleCount(360, 400, 60), 400);
  assert.equal(nextVisibleCount(0, 42, 60), 42);
});
