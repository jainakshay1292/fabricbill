// src/utils/bluetoothPrint.js
// Web Bluetooth printing for TVS RP3230ABW (ESC/POS)

const ESC = "\x1B";
const GS = "\x1D";
const LF = "\x0A";

// Common BLE printer service UUIDs — try these first
const PRINTER_SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];
const PRINTER_CHAR_UUIDS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
];

let cachedDevice = null;

export async function printViaBluetooth(text) {
  try {
    // Reuse previously paired device or request new one
    let device = cachedDevice;
    if (!device || !device.gatt.connected) {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "TVS" }],
        optionalServices: PRINTER_SERVICE_UUIDS,
      });
      cachedDevice = device;
    }

    const server = await device.gatt.connect();

    // Try each service/characteristic combo
    let char = null;
    for (const svcUUID of PRINTER_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(svcUUID);
        for (const charUUID of PRINTER_CHAR_UUIDS) {
          try {
            char = await service.getCharacteristic(charUUID);
            break;
          } catch {}
        }
        if (char) break;
      } catch {}
    }

    if (!char) {
      // Fallback: discover all services
      const services = await server.getPrimaryServices();
      for (const svc of services) {
        const chars = await svc.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            char = c;
            break;
          }
        }
        if (char) break;
      }
    }

    if (!char) throw new Error("No writable printer characteristic found. Use nRF Connect app to find correct UUIDs.");

    // Build ESC/POS payload
    const encoder = new TextEncoder();
    const reset = encoder.encode(ESC + "@");        // Reset printer
    const cut = encoder.encode(GS + "V" + "\x00");  // Full cut
    const feedAndCut = encoder.encode(LF + LF + LF);

    const payload = encoder.encode(text);

    // BLE has 20-byte MTU limit — send in chunks
    const fullData = new Uint8Array([...reset, ...payload, ...feedAndCut, ...cut]);
    const CHUNK = 20;
    for (let i = 0; i < fullData.length; i += CHUNK) {
      const chunk = fullData.slice(i, i + CHUNK);
      await char.writeValueWithoutResponse
        ? char.writeValueWithoutResponse(chunk)
        : char.writeValue(chunk);
      // Small delay between chunks for printer buffer
      await new Promise((r) => setTimeout(r, 50));
    }

    return true;
  } catch (e) {
    console.error("Bluetooth print error:", e);
    throw e;
  }
}
