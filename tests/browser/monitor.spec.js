import { test, expect } from '@playwright/test';
async function mockSensor(page) {
  await page.addInitScript(() => {
    const characteristic = new EventTarget();
    characteristic.startNotifications = async () => characteristic;
    const device = new EventTarget(); device.id = 'fake-fitbox'; device.name = 'FITBOX-test';
    const server = { connected: false, connect: async () => { server.connected = true; return server; }, disconnect: () => { server.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }, getPrimaryService: async id => {
      if (id !== 0x1816) throw new Error('no battery');
      return { getCharacteristic: async () => characteristic };
    } }; device.gatt = server;
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device } });
    window.notifyCrank = n => { const t = n * 1024 % 65536; characteristic.value = new DataView(Uint8Array.from([2, n & 255, n >> 8, t & 255, t >> 8]).buffer); characteristic.dispatchEvent(new Event('characteristicvaluechanged')); };
  });
}
test('iPad layout, BLE session, pause, disconnect and persistent history', async ({ page }, testInfo) => {
  await mockSensor(page); await page.clock.install(); await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('monitor.png'), fullPage: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'センサーを接続', exact: true }).click();
  await expect(page.locator('#connection')).toContainText('接続済み');
  await page.locator('#start').click();
  await page.evaluate(() => window.notifyCrank(100)); await page.clock.runFor(1000);
  await page.evaluate(() => window.notifyCrank(102)); await page.clock.runFor(100);
  await expect(page.locator('#total')).toHaveText('1.0');
  await page.locator('#pause').click(); await page.evaluate(() => window.notifyCrank(120));
  await expect(page.locator('#total')).toHaveText('1.0');
  await page.locator('#start').click(); await page.evaluate(() => window.notifyCrank(130)); await page.clock.runFor(1000); await page.evaluate(() => window.notifyCrank(132)); await page.clock.runFor(100);
  await expect(page.locator('#total')).toHaveText('2.0');
  await page.locator('#disconnect').click(); await expect(page.locator('#sessionStatus')).toHaveText('一時停止');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#finish').click(); await expect(page.locator('#total')).toHaveText('2.0');
  await page.reload(); await expect(page.locator('#history')).toContainText('2.0回');
  expect(errors).toEqual([]);
  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
test('calibration uses the same counter/rpm and saves per device', async ({ page }) => {
  await mockSensor(page); await page.clock.install(); await page.goto('/');
  await page.locator('#connect').click(); await page.locator('#calibrate').click();
  await page.evaluate(() => window.notifyCrank(100)); await page.clock.runFor(1000); await page.evaluate(() => window.notifyCrank(102)); await page.clock.runFor(1000);
  await expect(page.locator('#previewTotal')).toHaveText('1.0');
  await page.locator('#factor').fill('1.00'); await page.clock.runFor(100);
  await expect(page.locator('#previewTotal')).toHaveText('2.0');
  await page.locator('#saveFactor').click(); await expect(page.locator('#savedFactor')).toHaveText('1.00');
  await page.reload(); await page.locator('#connect').click(); await expect(page.locator('#savedFactor')).toHaveText('1.00');
  await page.locator('#calibrate').click(); await page.locator('#resetFactor').click(); await page.locator('#cancelFactor').click(); await expect(page.locator('#savedFactor')).toHaveText('1.00');
});
test('real log playback finishes at 102 revolutions and exports JSON', async ({ page }) => {
  test.setTimeout(90000);
  await page.clock.install(); await page.goto('/');
  await page.getByText('デバッグ・記録の再生', { exact: true }).click();
  await page.locator('#replay').click();
  await expect(page.locator('#sessionStatus')).toHaveText('計測中'); await page.clock.runFor(110000);
  await expect(page.locator('#sessionStatus')).toHaveText('終了'); await expect(page.locator('#total')).toHaveText('102.0');
  await expect(page.locator('#history')).toContainText('記録の再生');
  const download = page.waitForEvent('download'); await page.locator('#export').click(); expect((await download).suggestedFilename()).toMatch(/fitbox-.*\.json/);
});
test('backgrounding pauses the session and freezes animation and totals', async ({ page }) => {
  await mockSensor(page); await page.clock.install(); await page.goto('/'); await page.locator('#connect').click(); await page.locator('#start').click();
  await page.evaluate(() => window.notifyCrank(100)); await page.clock.runFor(1000); await page.evaluate(() => window.notifyCrank(102));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(200); await expect(page.locator('#sessionStatus')).toHaveText('一時停止');
  const angle = await page.locator('#crank').getAttribute('transform'); await page.clock.runFor(2000);
  expect(await page.locator('#crank').getAttribute('transform')).toBe(angle); await expect(page.locator('#total')).toHaveText('1.0');
});

test('60rpm advances the visual pedal half a turn in half a second', async ({ page }) => {
  await mockSensor(page); await page.clock.install(); await page.goto('/');
  await page.locator('#connect').click(); await page.locator('#start').click();
  await page.evaluate(() => window.notifyCrank(100));
  for (let n = 102; n <= 108; n += 2) {
    await page.clock.runFor(1000); await page.evaluate(n => window.notifyCrank(n), n);
  }
  await page.clock.runFor(100);
  await expect(page.locator('#rpm')).toHaveText('60');
  const read = async () => Number((await page.locator('#crank').getAttribute('transform')).match(/rotate\(([^ ]+)/)[1]);
  const start = await read(); await page.clock.runFor(500); const end = await read();
  const degrees = (end - start + 360) % 360;
  expect(degrees).toBeGreaterThan(170); expect(degrees).toBeLessThan(190);
});

for (const paused of [false, true]) test(`finish confirmation preserves ${paused ? 'paused' : 'running'} session on cancel and saves on accept`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSensor(page); await page.clock.install(); await page.goto('/');
  await page.locator('#connect').click(); await page.locator('#start').click();
  await page.evaluate(() => window.notifyCrank(100)); await page.clock.runFor(1000);
  await page.evaluate(() => window.notifyCrank(102)); await page.clock.runFor(100);
  if (paused) await page.locator('#pause').click();
  const status = paused ? '一時停止' : '計測中';
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('終了後はこの計測を再開できません');
    await dialog.dismiss();
  });
  await page.locator('#finish').click();
  await expect(page.locator('#sessionStatus')).toHaveText(status);
  await expect(page.locator('#total')).toHaveText('1.0');
  // Cancellation must leave the session resumable and able to count more input.
  if (paused) {
    await page.locator('#start').click();
    await page.evaluate(() => window.notifyCrank(102));
  }
  await page.clock.runFor(1000); await page.evaluate(() => window.notifyCrank(104)); await page.clock.runFor(100);
  await expect(page.locator('#total')).toHaveText('2.0');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#finish').click();
  await expect(page.locator('#sessionStatus')).toHaveText('終了');
  await expect(page.locator('#total')).toHaveText('2.0');
  await page.reload(); await expect(page.locator('#history')).toContainText('2.0回');
});
