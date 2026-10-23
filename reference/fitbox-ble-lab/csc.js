// CSC Measurement: little endian; event time is in units of 1/1024 s.
export function parseCSC(view) {
  if (view.byteLength < 1) throw new Error('空のCSCデータです');
  const flags = view.getUint8(0);
  let offset = 1;
  const result = { flags, wheel: null, crank: null };
  for (const [name, width] of [['wheel', 4], ['crank', 2]]) {
    if (!(flags & (name === 'wheel' ? 1 : 2))) continue;
    if (offset + width + 2 > view.byteLength) throw new Error('CSCデータの長さが不足しています');
    const revolutions = width === 4 ? view.getUint32(offset, true) : view.getUint16(offset, true);
    result[name] = { revolutions, time: view.getUint16(offset + width, true) };
    offset += width + 2;
  }
  return result;
}

export function deltaCSC(current, previous, bits) {
  if (!current || !previous) return null;
  const revolutions = (current.revolutions - previous.revolutions + 2 ** bits) % 2 ** bits;
  const ticks = (current.time - previous.time + 65536) % 65536;
  return { revolutions, seconds: ticks / 1024, rpm: ticks > 0 && revolutions > 0 ? revolutions * 60 * 1024 / ticks : null };
}
