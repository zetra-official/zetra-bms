// src/utils/scanBus.ts
type ScanListener = (barcode: string) => void;

const listeners = new Set<ScanListener>();

export function publishScanBarcode(barcode: string) {
  const v = String(barcode ?? "").trim();
  if (!v) return;
  for (const fn of Array.from(listeners)) {
    try {
      fn(v);
    } catch {
      // ignore listener crash
    }
  }
}

export function subscribeScanBarcode(fn: ScanListener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}