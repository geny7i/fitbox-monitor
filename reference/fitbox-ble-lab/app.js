import { parseCSC, deltaCSC } from './csc.js';

const $ = (id) => document.getElementById(id);
const CSC = 0x1816;
let device, characteristic, records = [], count = 0, sessionStarted = new Date().toISOString();
const state = {};
const freshState = () => ({ previous: null, total: 0, rpm: null, changedAt: null, received: false });
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function field(name, key, value) { $(name).querySelector(`[data-field="${key}"]`).textContent = value; }
function reset() {
  records = []; count = 0; sessionStarted = new Date().toISOString();
  $('count').textContent = '0'; $('lastReceived').textContent = '—'; $('logs').replaceChildren(); $('export').disabled = true;
  for (const name of ['wheel', 'crank']) {
    state[name] = freshState();
    for (const key of ['rpm', 'revolutions', 'delta', 'time']) field(name, key, '—');
    field(name, 'total', '0'); field(name, 'activity', 'データ待ち');
  }
}
reset();
function receive(event) {
  const view = event.target.value;
  const hex = Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), b => b.toString(16).padStart(2, '0')).join(' ');
  const timestamp = new Date().toISOString();
  const record = { timestamp, hex };
  try {
    const parsed = parseCSC(view);
    record.flags = parsed.flags;
    for (const [name, bits] of [['wheel', 32], ['crank', 16]]) {
      const current = parsed[name], s = state[name];
      if (!current) { record[name] = null; field(name, 'activity', 'この通知にはデータなし'); continue; }
      const delta = deltaCSC(current, s.previous, bits);
      // Event time wraps every 64 s. A long gap cannot be decoded reliably.
      const longGap = s.lastPacket && performance.now() - s.lastPacket >= 64000;
      const invalid = delta && (longGap || delta.revolutions > 10000 || (delta.revolutions > 0 && delta.seconds === 0));
      if (invalid) { s.rpm = null; s.changedAt = null; }
      else if (delta && delta.revolutions > 0) {
        s.total += delta.revolutions; s.rpm = delta.rpm; s.changedAt = performance.now();
      }
      s.previous = current; s.lastPacket = performance.now(); s.received = true;
      const stale = s.changedAt === null || performance.now() - s.changedAt > 5000;
      record[name] = { ...current, delta: invalid ? null : delta, total: s.total, rpm: invalid || stale ? null : s.rpm, discontinuity: Boolean(invalid) };
      field(name, 'revolutions', current.revolutions.toLocaleString());
      field(name, 'total', s.total.toLocaleString());
      field(name, 'delta', invalid ? '不連続・再基準化' : delta ? `+${delta.revolutions}` : '初回（基準）');
      field(name, 'time', `${current.time} ticks / ${(current.time / 1024).toFixed(3)} s`);
    }
  } catch (error) { record.error = error.message; message(`受信データの解析に失敗：${error.message}`, true); }
  records.push(record); if (records.length > 10000) records.shift();
  $('count').textContent = String(++count); $('lastReceived').textContent = new Date(timestamp).toLocaleTimeString('ja-JP'); $('export').disabled = false;
  const row = document.createElement('tr');
  for (const value of [new Date(timestamp).toLocaleTimeString('ja-JP'), ...['wheel', 'crank'].map(name => record[name] ? `${record[name].revolutions} / ${record[name].rpm?.toFixed(1) ?? '—'}` : '—'), hex + (record.error ? ` [${record.error}]` : '')]) {
    const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
  }
  $('logs').prepend(row); while ($('logs').children.length > 100) $('logs').lastChild.remove();
  renderActivity();
}
function renderActivity() {
  for (const name of ['wheel', 'crank']) {
    const s = state[name];
    const stale = s.changedAt !== null && performance.now() - s.changedAt > 5000;
    const active = device?.gatt?.connected && !stale && s.rpm !== null;
    field(name, 'rpm', active ? s.rpm.toFixed(1) : '—');
    field(name, 'activity', !device?.gatt?.connected ? '未接続' : !s.received ? 'データ待ち' : stale ? '5秒以上、回転の更新なし' : s.rpm === null ? '次の回転を待っています' : '回転を検出中');
  }
}
setInterval(renderActivity, 500);
function disconnected() {
  characteristic?.removeEventListener('characteristicvaluechanged', receive); characteristic = null;
  $('status').textContent = '未接続'; $('connect').disabled = false; $('disconnect').disabled = true;
  for (const name of ['wheel', 'crank']) { state[name].previous = null; state[name].rpm = null; state[name].changedAt = null; state[name].lastPacket = null; }
  message('切断しました。ログは保存できます。再接続すると新しい回転値を基準に計測を続けます。'); renderActivity();
}
$('connect').addEventListener('click', async () => {
  if (!navigator.bluetooth || !window.isSecureContext) { message('Web Bluetoothを利用できません。MacのChromeで http://localhost:5173 を開いてください。', true); return; }
  $('connect').disabled = true;
  let subscribed = false;
  try {
    device = await navigator.bluetooth.requestDevice({ ...($('allDevices').checked ? { acceptAllDevices: true } : { filters: [{ name: 'FITBOX-03807' }] }), optionalServices: [CSC, 0x180f, 0x180a] });
    device.addEventListener('gattserverdisconnected', disconnected, { once: true });
    message('センサーに接続しています…');
    const server = await device.gatt.connect();
    $('device').textContent = `接続先：${device.name || '名前なし'}`;
    const service = await server.getPrimaryService(CSC);
    characteristic = await service.getCharacteristic(0x2a5b);
    characteristic.addEventListener('characteristicvaluechanged', receive);
    await characteristic.startNotifications();
    subscribed = true;
    $('status').textContent = '接続中'; $('disconnect').disabled = false;
    message('通知を受信しています。ペダルを回して値の変化を確認してください。');
    $('battery').textContent = '未提供';
    const lines = [];
    // Web Bluetooth only exposes services allowed in requestDevice.
    for (const s of await server.getPrimaryServices()) {
      lines.push(s.uuid);
      try { for (const c of await s.getCharacteristics()) {
        const props = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(p => c.properties[p]);
        lines.push(`  ${c.uuid} [${props.join(', ')}]`);
        if (s.uuid.startsWith('0000180f') && c.uuid.startsWith('00002a19') && c.properties.read) $('battery').textContent = `${(await c.readValue()).getUint8(0)} %`;
      } } catch (e) { lines.push(`  取得失敗：${e.message}`); }
    }
    $('services').textContent = 'アクセスを許可したCSC・Battery・Device Informationの範囲で表示\n' + lines.join('\n');
  } catch (error) {
    if (subscribed && device?.gatt?.connected) {
      message(`通知接続後の処理でエラー：${error.message}`, true);
    } else {
      device?.gatt?.disconnect(); $('connect').disabled = false;
      message(`接続できませんでした：${error.message}。センサーを動かし、ほかのアプリを切断して再試行してください。`, true);
    }
  }
});
$('disconnect').addEventListener('click', () => device?.gatt?.disconnect());
$('reset').addEventListener('click', () => { reset(); message('計測とログをリセットしました。次の通知を基準に計測します。'); });
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ deviceName: device?.name, sessionStarted, exportedAt: new Date().toISOString(), notificationCount: count, retainedCount: records.length, records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `fitbox-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
