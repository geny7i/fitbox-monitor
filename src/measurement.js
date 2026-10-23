import { parseCSC, deltaCSC } from './csc.js';
export const VERSION = 'host-window-v1';
export function hexView(hex) {
  if (typeof hex !== 'string' || !/^[\da-f]{2}(\s+[\da-f]{2})*$/i.test(hex.trim())) throw new Error('不正なHEXです');
  return new DataView(Uint8Array.from(hex.trim().split(/\s+/), x => parseInt(x, 16)).buffer);
}
export class Measurement {
  constructor(factor = 0.5) { this.factor = factor; this.total = 0; this.resetBaseline(); }
  resetBaseline() { this.previous = null; this.samples = []; this.startedAt = null; this.lastReceived = null; this.lastChanged = null; this.standardRpm = null; }
  receive(view, now) {
    const parsed = parseCSC(view);
    this.lastReceived = now;
    if (!parsed.crank) return { parsed, delta: 0 };
    const previous = this.previous;
    this.previous = { ...parsed.crank, at: now };
    if (!previous) { this.startedAt = now; return { parsed, delta: 0 }; }
    const gap = now - previous.at;
    const delta = deltaCSC(parsed.crank, previous, 16);
    // Allow paired bursts, but reject resets and gaps where wrap count is unknowable.
    if (gap < 0 || gap > 10000 || delta.revolutions > Math.max(12, gap / 1000 * 20) || (delta.revolutions && !delta.seconds)) {
      this.resetBaseline(); this.previous = { ...parsed.crank, at: now }; this.startedAt = now; this.lastReceived = now;
      return { parsed, delta: 0, discontinuity: true };
    }
    if (delta.revolutions) {
      this.total += delta.revolutions * this.factor;
      this.samples.push({ at: now, raw: delta.revolutions });
      this.lastChanged = now; this.standardRpm = delta.rpm;
    }
    this.samples = this.samples.filter(s => s.at > now - 4000);
    return { parsed, delta: delta.revolutions };
  }
  rpm(now) {
    if (this.lastChanged === null || now - this.lastChanged >= 5000) return 0;
    const seconds = Math.min(4, (now - this.startedAt) / 1000);
    if (seconds < 2) return null;
    return this.samples.filter(s => s.at > now - 4000).reduce((n, s) => n + s.raw, 0) * this.factor * 60 / seconds;
  }
}
export class Session {
  constructor({ factor = 0.5, device = null, source = 'ble' } = {}) {
    this.measurement = new Measurement(factor); this.status = 'ready'; this.elapsed = 0; this.runningSince = null;
    this.result = { schemaVersion: 1, calculationVersion: VERSION, id: globalThis.crypto.randomUUID(), factor, device, source, startedAt: null, endedAt: null, pauses: [] };
  }
  start(now, date = new Date().toISOString()) {
    if (!['ready', 'paused'].includes(this.status)) return;
    if (!this.result.startedAt) this.result.startedAt = date;
    this.status = 'running'; this.runningSince = now; this.measurement.resetBaseline();
    if (this.result.pauses.at(-1)?.resumedAt === null) this.result.pauses.at(-1).resumedAt = date;
  }
  pause(now, reason = 'manual', date = new Date().toISOString()) {
    if (this.status !== 'running') return;
    this.elapsed += now - this.runningSince; this.runningSince = null; this.status = 'paused'; this.measurement.resetBaseline();
    this.result.pauses.push({ at: date, reason, resumedAt: null });
  }
  finish(now, date = new Date().toISOString()) {
    if (!['running', 'paused'].includes(this.status)) return;
    if (this.status === 'running') this.elapsed += now - this.runningSince;
    this.runningSince = null; this.status = 'finished'; this.result.endedAt = date; this.measurement.resetBaseline();
  }
  receive(view, now) { return this.status === 'running' ? this.measurement.receive(view, now) : { parsed: parseCSC(view), delta: 0 }; }
  snapshot(now) {
    const elapsedMs = this.elapsed + (this.status === 'running' ? now - this.runningSince : 0);
    return { ...this.result, pauses: this.result.pauses.map(p => ({ ...p })), status: this.status, elapsedMs, revolutions: this.measurement.total, averageRpm: elapsedMs > 0 ? this.measurement.total * 60000 / elapsedMs : 0 };
  }
}
