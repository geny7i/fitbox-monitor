const KEY = 'fitbox-monitor-v1';
export function loadStore(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage.getItem(KEY) || '{}');
    return { history: Array.isArray(data.history) ? data.history.filter(r => r && typeof r.id === 'string' && Number.isFinite(r.revolutions) && Number.isFinite(r.elapsedMs)) : [], factors: data.factors && typeof data.factors === 'object' && !Array.isArray(data.factors) ? data.factors : {} };
  } catch { return { history: [], factors: {}, loadFailed: true }; }
}
export function saveStore(data, storage = localStorage) { storage.setItem(KEY, JSON.stringify({ history: data.history, factors: data.factors })); }
