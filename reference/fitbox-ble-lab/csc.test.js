import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSC, deltaCSC } from './csc.js';
test('wheel and crank fields are decoded independently in little endian order', () => {
  const value = new DataView(Uint8Array.from([3, 10, 0, 0, 0, 0, 4, 20, 0, 0, 8]).buffer);
  assert.deepEqual(parseCSC(value), { flags: 3, wheel: { revolutions: 10, time: 1024 }, crank: { revolutions: 20, time: 2048 } });
  assert.equal(parseCSC(new DataView(Uint8Array.from([2, 1, 0, 0, 4]).buffer)).wheel, null);
});
test('counter and timer wraparound preserves cadence', () => {
  assert.deepEqual(deltaCSC({ revolutions: 0, time: 512 }, { revolutions: 65535, time: 65024 }, 16), { revolutions: 1, seconds: 1, rpm: 60 });
  assert.equal(deltaCSC({ revolutions: 0, time: 1024 }, { revolutions: 4294967295, time: 0 }, 32).rpm, 60);
});
test('duplicate samples and incomplete packets do not produce a bogus rpm', () => {
  assert.equal(deltaCSC({ revolutions: 1, time: 1 }, { revolutions: 1, time: 1 }, 16).rpm, null);
  assert.throws(() => parseCSC(new DataView(Uint8Array.from([3, 1]).buffer)));
});
