import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStore, saveStore } from '../src/storage.js';
test('storage survives unavailable/corrupt data and round-trips session history', () => {
  assert.equal(loadStore({ getItem() { throw new Error('denied'); } }).loadFailed, true);
  assert.equal(loadStore({ getItem: () => '{' }).loadFailed, true);
  assert.equal(loadStore({ getItem: () => '{"history":[null,1]}' }).history.length, 0);
  let json; const storage = { setItem: (_, value) => { json = value; }, getItem: () => json };
  const data = { history: [{ id: 'test', revolutions: 102, elapsedMs: 100000 }], factors: { device: 0.5 } };
  saveStore(data, storage); assert.deepEqual(loadStore(storage), data);
  assert.throws(() => saveStore(data, { setItem() { throw new Error('quota'); } }));
});
