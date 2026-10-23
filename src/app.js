import './style.css';
import { Measurement, Session, hexView } from './measurement.js';
import { BleInput } from './ble.js';
import { loadStore, saveStore } from './storage.js';
import forwardURL from '../reference/fitbox-ble-lab/docs/fitbox-2026-10-22T15-50-25-441Z.forward.json?url';
import reverseURL from '../reference/fitbox-ble-lab/docs/fitbox-2026-10-22T15-54-02-865Z.reverse.json?url';
const $ = id => document.getElementById(id);
const store = loadStore();
let device = null, source = 'ble', connected = false, connecting = false, battery = null;
let session = new Session(), calibrating = false, draft = 0.5, preview = null, replay = null, replayLoading = false;
let angle = 0, frameAt = performance.now(), tickAt = frameAt, checkpointAt = frameAt, wakeLock = null;
let lastReceive = null, lastInfo = null, saveError = false;
const fmt = n => n.toLocaleString('ja-JP', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
function duration(ms) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function message(text) { $('message').textContent = text; }
function factor() { const n = Number(store.factors[device?.id]); return device?.id && n >= 0.1 && n <= 2 ? n : 0.5; }
function persist() {
  try { saveStore(store); saveError = false; $('storageNotice').textContent = '記録はこのブラウザに保存されます。'; }
  catch { saveError = true; $('storageNotice').textContent = 'ブラウザに保存できません。JSON出力で記録を保管してください。'; }
}
function checkpoint() {
  if (!session.result.startedAt) return;
  const result = session.snapshot(performance.now());
  const index = store.history.findIndex(r => r.id === result.id);
  if (index < 0) store.history.unshift(result); else store.history[index] = result;
  persist(); renderHistory();
}
function renderHistory() {
  $('history').replaceChildren();
  if (!store.history.length) { const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = 'まだ記録はありません。今日の運動から始めましょう。'; $('history').append(p); }
  for (const result of store.history) {
    const row = document.createElement('details'); row.className = 'history-row';
    const title = document.createElement('summary');
    title.textContent = `${new Date(result.startedAt).toLocaleString('ja-JP')} · ${duration(result.elapsedMs)} · ${fmt(result.revolutions)}回${result.source === 'replay' ? '［記録の再生］' : ''}${result.status !== 'finished' ? '［中断記録］' : ''}`;
    const body = document.createElement('p');
    body.textContent = `平均 ${fmt(result.averageRpm)} rpm ／ 倍率 ${result.factor} ／ ${result.device?.name || '記録の再生'} ／ 一時停止 ${result.pauses?.length || 0}回`;
    row.append(title, body); $('history').append(row);
  }
  $('export').disabled = !store.history.length;
}
function newSession() {
  session = new Session({ factor: factor(), device, source }); angle = 0;
  $('savedFactor').textContent = factor().toFixed(2); render();
}
async function holdScreen() {
  try { if (!wakeLock && navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch { /* Optional on browsers without Wake Lock support. */ }
}
function releaseScreen() { wakeLock?.release().catch(() => {}); wakeLock = null; }
function pause(reason = 'manual') {
  session.pause(performance.now(), reason); checkpoint(); releaseScreen();
  if (reason !== 'manual') message('計測を一時停止しました。状態を確認して「再開」を押してください。');
  render();
}
function receive(view, now = performance.now()) {
  lastReceive = now;
  try {
    const hex = Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), n => n.toString(16).padStart(2, '0')).join(' ');
    const info = calibrating && !document.hidden ? preview.receive(view, now) : session.receive(view, now);
    lastInfo = { hex, ...info };
    $('diagnostics').textContent = JSON.stringify({ source, device, factor: calibrating ? draft : session.measurement.factor, ...lastInfo, standardRpm: (calibrating ? preview : session.measurement).standardRpm, battery }, null, 2);
    if (info.discontinuity) message('不連続なデータを除外して基準を更新しました。');
  } catch (error) { $('diagnostics').textContent = `解析エラー: ${error.message}`; message('不正な通知を除外しました。次の正常な通知を待っています。'); }
}
const ble = new BleInput({ onData: receive, onDisconnect: () => {
  connected = false; battery = null;
  if (calibrating) preview.resetBaseline();
  pause('disconnect'); message('センサーが切断されました。結果は保持しています。'); render();
}, onBattery: value => { battery = value; render(); } });
$('connect').onclick = async () => {
  if (connecting) return;
  connecting = true; render();
  try {
    const next = await ble.connect($('allDevices').checked);
    const different = device?.id && device.id !== next.id;
    if (different && session.result.startedAt) { session.finish(performance.now()); checkpoint(); }
    device = next; source = 'ble'; connected = true; lastReceive = performance.now(); battery = null;
    if (different || !session.result.startedAt) newSession();
    else session.measurement.resetBaseline();
    message('接続しました。開始または再開を押してください。');
  } catch (error) { message(error.name === 'NotFoundError' ? '接続する機器が選択されませんでした。' : `接続できません: ${error.message}`); }
  finally { connecting = false; render(); }
};
$('disconnect').onclick = () => ble.disconnect();
$('start').onclick = () => { session.start(performance.now()); checkpoint(); holdScreen(); message(source === 'replay' ? '記録を再生しています。' : '計測中です。'); render(); };
$('pause').onclick = () => { pause(); message('一時停止中です。合計は保持しています。'); };
function finish() { session.finish(performance.now()); replay = null; checkpoint(); releaseScreen(); message(saveError ? '終了しました。保存できないためJSON出力してください。' : '終了して記録を保存しました。'); render(); }
$('finish').onclick = finish;
$('new').onclick = () => { replay = null; source = 'ble'; newSession(); message('新しい計測の準備ができました。'); };
function endCalibration() { calibrating = false; preview = null; releaseScreen(); $('calibrationBody').hidden = true; render(); }
$('calibrate').onclick = () => {
  calibrating = true; draft = factor(); preview = new Measurement(draft); angle = 0;
  $('factor').value = $('factorRange').value = draft; $('calibrationBody').hidden = false; holdScreen();
  message('実物と画面の回転速度を比べて倍率を調整してください。'); render();
};
function updateFactor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.1 || n > 2) { $('factor').setCustomValidity('0.1〜2.0を入力してください'); return false; }
  $('factor').setCustomValidity('');
  const rawTotal = preview.total / preview.factor;
  draft = Math.round(n * 100) / 100; preview.factor = draft; preview.total = rawTotal * draft;
  $('factor').value = $('factorRange').value = draft; return true;
}
$('factor').oninput = () => updateFactor($('factor').value);
$('factorRange').oninput = () => updateFactor($('factorRange').value);
$('slower').onclick = () => updateFactor(Math.max(0.1, draft - 0.01));
$('faster').onclick = () => updateFactor(Math.min(2, draft + 0.01));
$('resetFactor').onclick = () => updateFactor(0.5);
$('cancelFactor').onclick = () => { endCalibration(); message('補正をキャンセルしました。'); };
$('saveFactor').onclick = () => {
  if (!updateFactor($('factor').value)) { $('factor').reportValidity(); return; }
  store.factors[device.id] = draft; persist(); endCalibration();
  if (!session.result.startedAt) newSession();
  $('savedFactor').textContent = factor().toFixed(2);
  message(saveError ? '補正を保存できませんでした。この画面では適用されます。' : '補正を保存しました。次の計測から適用します。');
};
$('export').onclick = () => {
  checkpoint();
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), sessions: store.history }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `fitbox-${new Date().toISOString().replaceAll(':', '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};
$('replay').onclick = async () => {
  replayLoading = true; render();
  try {
    const response = await fetch($('replayChoice').value === 'forward' ? forwardURL : reverseURL);
    if (!response.ok) throw new Error('ログを取得できませんでした');
    const log = await response.json(); const origin = Date.parse(log.records[0].timestamp);
    source = 'replay'; session = new Session({ factor: 0.5, source, device: { name: log.deviceName, id: 'replay' } });
    session.start(performance.now()); angle = 0;
    replay = { records: log.records.map(r => ({ ...r, at: Date.parse(r.timestamp) - origin })), index: 0, position: 0, previousTick: performance.now() };
    message('記録の再生です。受信時刻の間隔を再現しています。'); holdScreen();
  } catch (error) { message(error.message); }
  finally { replayLoading = false; render(); }
};
$('stopReplay').onclick = finish;
function render() {
  const now = performance.now(), m = calibrating ? preview : session.measurement;
  const running = calibrating ? connected : session.status === 'running';
  const rpm = running ? m.rpm(now) : 0;
  const snapshot = session.snapshot(now);
  $('connection').textContent = connecting ? '接続中…' : connected ? `接続済み${battery === null ? '' : ` · 電池${battery}%`}` : '未接続';
  $('deviceName').textContent = device?.name || 'センサーを接続して始めましょう';
  $('connect').disabled = connected || connecting || source === 'replay' || calibrating || replayLoading;
  $('disconnect').hidden = !connected;
  $('allDevices').disabled = connecting || connected;
  $('sessionStatus').textContent = calibrating ? '補正プレビュー' : ({ ready: '準備完了', running: '計測中', paused: '一時停止', finished: '終了' })[session.status];
  $('sourceLabel').textContent = source === 'replay' ? '記録の再生 · 実測ではありません' : '実機モード';
  $('rpm').textContent = rpm === null ? '—' : Math.round(rpm);
  $('activity').textContent = !running ? '結果を保持しています' : m.lastReceived === null ? 'データ待ち' : now - m.lastReceived > 5000 ? '受信の更新なし' : rpm === null ? '計測中…' : rpm === 0 ? '回転の更新なし' : '回転を受信中';
  $('elapsed').textContent = duration(snapshot.elapsedMs); $('total').textContent = fmt(snapshot.revolutions); $('average').textContent = fmt(snapshot.averageRpm);
  $('start').textContent = session.status === 'paused' ? '再開' : '開始';
  $('start').disabled = calibrating || !['ready', 'paused'].includes(session.status) || !(connected || replay);
  $('pause').disabled = calibrating || session.status !== 'running';
  $('finish').disabled = calibrating || !['running', 'paused'].includes(session.status);
  $('new').disabled = calibrating || !['finished', 'paused'].includes(session.status);
  $('calibrate').disabled = calibrating || !connected || connecting || session.status === 'running' || source === 'replay';
  $('replay').disabled = replayLoading || connected || connecting || calibrating || !!replay || ['running', 'paused'].includes(session.status);
  $('stopReplay').disabled = !replay;
  $('replayStatus').textContent = replay ? `${replay.index} / ${replay.records.length} 件 · ${duration(replay.position)}` : source === 'replay' ? '再生終了。結果を保持しています。' : '';
  if (calibrating) $('previewTotal').textContent = fmt(preview.total);
}
// Pause before any delayed/background input can be counted as known exercise.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause('background'); if (calibrating) { preview.resetBaseline(); releaseScreen(); } }
  else { frameAt = performance.now(); if (replay) replay.previousTick = frameAt; }
});
window.addEventListener('pagehide', () => { pause('pagehide'); });
setInterval(() => {
  const now = performance.now();
  if (session.status === 'running' && (now - tickAt > 10000 || (source === 'ble' && lastReceive !== null && now - lastReceive > 10000))) pause('input-gap');
  if (calibrating && now - tickAt > 10000) preview.resetBaseline();
  tickAt = now;
  if (replay) {
    if (session.status === 'running') {
      replay.position += now - replay.previousTick;
      while (replay && replay.index < replay.records.length && replay.records[replay.index].at <= replay.position) {
        const r = replay.records[replay.index++];
        // Map source timestamps to the monotonic clock, preserving burst spacing.
        receive(hexView(r.hex), now - (replay.position - r.at));
      }
      if (replay && replay.index === replay.records.length) finish();
    }
    if (replay) replay.previousTick = now;
  }
  if (session.status === 'running' && now - checkpointAt >= 5000) { checkpoint(); checkpointAt = now; }
  render();
}, 100);
function frame(now) {
  const delta = Math.min((now - frameAt) / 1000, 0.1); frameAt = now;
  const m = calibrating ? preview : session.measurement;
  const active = !document.hidden && (calibrating ? connected : session.status === 'running');
  const rpm = active ? m.rpm(now) ?? 0 : 0;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) angle = (angle + rpm * 6 * delta) % 360;
  $('crank').setAttribute('transform', `rotate(${angle} 120 120)`);
  requestAnimationFrame(frame);
}
$('support').textContent = !window.isSecureContext ? '実機接続にはHTTPSが必要です。LANのHTTPでは画面・再生のみ確認できます。' : !navigator.bluetooth ? 'このブラウザはBLE未対応です。iPadはBluefy、MacはChromeをご利用ください。記録の再生は利用できます。' : 'iPadはBluefy、MacはChromeに対応。ほかのセンサー接続アプリは切断してください。';
if (store.loadFailed) $('storageNotice').textContent = '保存データを読み込めませんでした。ブラウザの保存設定を確認してください。';
renderHistory(); newSession(); requestAnimationFrame(frame);
