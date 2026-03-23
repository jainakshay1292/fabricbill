// src/utils/bluetoothPrint.js
const ESC = "\x1B";
const GS = "\x1D";
const LF = "\x0A";

// Known TVS printer UUIDs
const KNOWN_SERVICES = [
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // RP3230ABW
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];
const KNOWN_CHARS = [
  "49535343-6daa-4d02-abf6-19569aca69fe", // RP3230ABW
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
  "00002af1-0000-1000-8000-00805f9b34fb",
  "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
];

let cachedDevice = null;

export async function printViaBluetooth(text) {
  try {
    let device = cachedDevice;
    if (!device || !device.gatt?.connected) {
      // Accept ANY nearby Bluetooth printer — not locked to one model
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_SERVICES,
      });
      cachedDevice = device;
    }

    const server = await device.gatt.connect();

    // Try known service/char combos first
    let char = null;
    for (const svcUUID of KNOWN_SERVICES) {
      try {
        const service = await server.getPrimaryService(svcUUID);
        for (const charUUID of KNOWN_CHARS) {
          try {
            char = await service.getCharacteristic(charUUID);
            break;
          } catch {}
        }
        if (char) break;
      } catch {}
    }

    // Fallback: discover any writable characteristic
    if (!char) {
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

    if (!char) throw new Error("No writable characteristic found on this printer.");

    const encoder = new TextEncoder();
    const fullData = new Uint8Array([
      ...encoder.encode(ESC + "@"),       // Reset
      ...encoder.encode(text),            // Content
      ...encoder.encode(LF + LF + LF),   // Feed
      ...encoder.encode(GS + "V\x00"),   // Cut
    ]);

    const CHUNK = 20;
    for (let i = 0; i < fullData.length; i += CHUNK) {
      const chunk = fullData.slice(i, i + CHUNK);
      if (char.writeValueWithoutResponse) {
        await char.writeValueWithoutResponse(chunk);
      } else {
        await char.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    return true;
  } catch (e) {
    console.error("Bluetooth print error:", e);
    throw e;
  }
}
