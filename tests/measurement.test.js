import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Measurement, Session, hexView } from '../src/measurement.js';
import { parseCSC, deltaCSC } from '../src/csc.js';
const packet = (n, t = n * 1024 % 65536) => new DataView(Uint8Array.from([2, n & 255, n >> 8, t & 255, t >> 8]).buffer);
test('CSC parsing, both counters, wraps and malformed input', () => {
  assert.deepEqual(parseCSC(hexView('03 0a 00 00 00 00 04 14 00 00 08')), { flags: 3, wheel: { revolutions: 10, time: 1024 }, crank: { revolutions: 20, time: 2048 } });
  assert.equal(deltaCSC({ revolutions: 0, time: 512 }, { revolutions: 65535, time: 65024 }, 16).rpm, 60);
  assert.equal(deltaCSC({ revolutions: 0, time: 1024 }, { revolutions: 4294967295, time: 0 }, 32).rpm, 60);
  assert.throws(() => parseCSC(hexView('03 00'))); assert.throws(() => hexView('zz'));
});
for (const [name, count] of [['forward', 102], ['reverse', 101]]) test(`${name}: raw HEX replay, totals and calibration`, () => {
  const file = name === 'forward' ? '15-50-25-441Z' : '15-54-02-865Z';
  const { records } = JSON.parse(readFileSync(`reference/fitbox-ble-lab/docs/fitbox-2026-10-22T${file}.${name}.json`));
  const a = new Measurement(0.5), b = new Measurement(1); const origin = Date.parse(records[0].timestamp); let maxRpm = 0;
  for (const r of records) {
    const now = Date.parse(r.timestamp) - origin;
    a.receive(hexView(r.hex), now); b.receive(hexView(r.hex), now);
    assert.equal(b.rpm(now), a.rpm(now) === null ? null : a.rpm(now) * 2);
    assert.equal(b.standardRpm, a.standardRpm);
    maxRpm = Math.max(maxRpm, a.rpm(now) ?? 0);
  }
  assert.equal(a.total, count); assert.equal(b.total, count * 2); assert.ok(maxRpm < 130);
  const seconds = (Date.parse(records.at(-1).timestamp) - origin) / 1000;
  assert.ok(count * 60 / seconds > 50 && count * 60 / seconds < 70);
  assert.equal(a.rpm(seconds * 1000 + 6000), 0); assert.equal(a.total, count);
});
test('session pause, reconnect baseline, finish and retained results', () => {
  const s = new Session(); s.start(0); s.receive(packet(100), 0); s.receive(packet(102), 1000); s.receive(packet(102), 1010);
  assert.equal(s.measurement.total, 1); s.pause(2000, 'disconnect'); s.receive(packet(110), 3000); s.start(4000);
  s.receive(packet(120), 4000); s.receive(packet(122), 5000); s.finish(6000); s.receive(packet(124), 7000);
  assert.equal(s.snapshot(8000).revolutions, 2); assert.equal(s.snapshot(8000).elapsedMs, 4000); assert.equal(s.snapshot(8000).averageRpm, 30);
});
test('reset, long gaps and valid wrap do not add bogus revolutions', () => {
  const m = new Measurement(); m.receive(packet(65535, 65024), 0); m.receive(packet(0, 512), 1000); assert.equal(m.total, 0.5);
  m.receive(packet(500), 2000); assert.equal(m.total, 0.5); m.receive(packet(501), 3000); assert.equal(m.total, 1);
  m.receive(packet(600), 15000); assert.equal(m.total, 1);
});
