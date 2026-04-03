// src/utils/scanBus.ts
type ScanListener = (barcode: string) => void;

type ScanScope = "GLOBAL" | "SALES" | "PRODUCTS" | "INVENTORY";

type ListenerEntry = {
  fn: ScanListener;
  scope: ScanScope;
};

const listeners = new Set<ListenerEntry>();

let activeScope: ScanScope = "GLOBAL";

function cleanBarcode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

export function setActiveScanScope(scope: ScanScope) {
  activeScope = scope;
}

export function getActiveScanScope(): ScanScope {
  return activeScope;
}

export function publishScanBarcode(barcode: string) {
  const v = cleanBarcode(barcode);
  if (!v) return;

  const all = Array.from(listeners);

  const scoped = all.filter((x) => x.scope === activeScope);
  const fallbackSales =
    activeScope === "GLOBAL" ? all.filter((x) => x.scope === "SALES") : [];

  const targets = scoped.length > 0 ? scoped : fallbackSales;

  for (const entry of targets) {
    try {
      entry.fn(v);
    } catch {
      // ignore listener crash
    }
  }
}

export function subscribeScanBarcode(
  fn: ScanListener,
  options?: { scope?: ScanScope }
) {
  const entry: ListenerEntry = {
    fn,
    scope: options?.scope ?? "GLOBAL",
  };

  listeners.add(entry);

  return () => {
    listeners.delete(entry);
  };
}