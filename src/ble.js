export class BleInput {
  constructor({ onData, onDisconnect, onBattery }) { Object.assign(this, { onData, onDisconnect, onBattery }); }
  async connect(all = false) {
    this.disconnect();
    if (!navigator.bluetooth) throw new Error('BLE接続にはiPadのBluefy、またはMacのChromeを使ってください。');
    const device = await navigator.bluetooth.requestDevice({ ...(all ? { acceptAllDevices: true } : { filters: [{ namePrefix: 'FITBOX' }] }), optionalServices: [0x1816, 0x180f] });
    this.device = device;
    this.disconnected = () => this.onDisconnect();
    device.addEventListener('gattserverdisconnected', this.disconnected);
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(0x1816);
      const characteristic = await service.getCharacteristic(0x2a5b);
      this.characteristic = characteristic;
      this.notification = event => this.onData(event.target.value);
      characteristic.addEventListener('characteristicvaluechanged', this.notification);
      await characteristic.startNotifications();
      // Battery is optional: its failure must not reject a working CSC connection.
      this.battery = (async () => {
        try {
          const batteryService = await server.getPrimaryService(0x180f);
          const level = await batteryService.getCharacteristic(0x2a19);
          const value = await level.readValue();
          if (this.device === device && device.gatt.connected) this.onBattery(value.getUint8(0));
        } catch { /* Device does not expose battery information. */ }
      })();
      return { id: device.id, name: device.name || 'BLEセンサー' };
    } catch (error) { this.disconnect(); throw error; }
  }
  disconnect() {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.notification);
    this.device?.removeEventListener('gattserverdisconnected', this.disconnected);
    const connected = this.device?.gatt?.connected;
    this.device?.gatt?.disconnect(); this.characteristic = null; this.device = null;
    if (connected) this.onDisconnect();
  }
}
