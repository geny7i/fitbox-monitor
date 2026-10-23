import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseCSC } from '../csc.js';

const defaults = [
  'docs/fitbox-2026-10-22T15-50-25-441Z.forward.json',
  'docs/fitbox-2026-10-22T15-54-02-865Z.reverse.json',
];
const files = process.argv.length > 2 ? process.argv.slice(2) : defaults;
const at = r => Date.parse(r.timestamp) / 1000;
const tickDelta = (a, b) => (b.crank.time - a.crank.time + 65536) % 65536;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

for (const file of files) {
  const { records } = JSON.parse(readFileSync(file, 'utf8'));
  // Verify the saved values against the original packet bytes, not UI totals.
  for (const r of records) {
    const bytes = Uint8Array.from(r.hex.split(/\s+/).map(x => parseInt(x, 16)));
    const decoded = parseCSC(new DataView(bytes.buffer));
    assert.equal(decoded.flags, r.flags);
    for (const name of ['wheel', 'crank']) {
      assert.equal(decoded[name].revolutions, r[name].revolutions);
      assert.equal(decoded[name].time, r[name].time);
    }
  }
  const uniqueChanges = records.filter((r, i) => i === 0 || r.hex !== records[i - 1].hex);
  const steps = uniqueChanges.slice(1).map((r, i) => ({
    seconds: at(r) - at(uniqueChanges[i]),
    crank: r.crank.revolutions - uniqueChanges[i].crank.revolutions,
    wheel: r.wheel.revolutions - uniqueChanges[i].wheel.revolutions,
    ticks: tickDelta(uniqueChanges[i], r),
  }));
  const pairs = [];
  for (let i = 0; i + 1 < steps.length; i += 2) {
    pairs.push({ equalTicks: steps[i].ticks === steps[i + 1].ticks,
      equalCrank: steps[i].crank === steps[i + 1].crank,
      separation: steps[i + 1].seconds });
  }
  const first = records[0], last = records.at(-1);
  const wheel = last.wheel.revolutions - first.wheel.revolutions;
  const crank = last.crank.revolutions - first.crank.revolutions;
  // Remove the first pair: its event interval includes pre-experiment rest.
  // Pairing is an observed pattern for these logs, not a generic BLE rule.
  const start = uniqueChanges[2], end = uniqueChanges.at(-1);
  const hostSeconds = at(end) - at(start);
  const elapsedTicks = steps.slice(2).reduce((sum, s) => sum + s.ticks, 0);
  console.log(JSON.stringify({
    file, rawPacketsVerified: records.length,
    logSeconds: at(last) - at(first),
    changedPackets: steps.length,
    unchangedPackets: records.length - uniqueChanges.length,
    wheelIncrement: wheel, crankIncrement: crank,
    wheelPerCrank: wheel / crank,
    crankDividedByTwo: crank / 2,
    pairedChanges: pairs.length,
    pairsWithEqualTicks: pairs.filter(x => x.equalTicks).length,
    pairsWithEqualCrank: pairs.filter(x => x.equalCrank).length,
    maxWithinPairSeconds: Math.max(...pairs.map(x => x.separation)),
    wheelAndCrankTimesAlwaysEqual: records.every(r => r.wheel.time === r.crank.time),
    medianStandardCrankRpmAfterFirstPair: median(steps.slice(2).map(s => s.crank * 60 * 1024 / s.ticks)),
    hostSecondsAfterFirstPair: hostSeconds,
    sensorTicksAfterFirstPair: elapsedTicks,
    standardSensorSecondsPerHostSecond: elapsedTicks / 1024 / hostSeconds,
    hostRpmWithHalfCounterAfterFirstPair: (end.crank.revolutions - start.crank.revolutions) / 2 * 60 / hostSeconds,
    wheelMinus3Point14CrankRange: [
      Math.min(...records.map(r => r.wheel.revolutions - 3.14 * r.crank.revolutions)),
      Math.max(...records.map(r => r.wheel.revolutions - 3.14 * r.crank.revolutions)),
    ],
  }, null, 2));
}
