/** Client response checks only; does not establish deployed RPC guarantees. */
export function uniqueRecords<T extends Record<string, any>>(rows: T[], key: string): T[] {
  const seen = new Map<string, T>();
  const canonical = (v: any): string => {
    if (Array.isArray(v)) return JSON.stringify(v.map(canonical));
    if (v && typeof v === "object") return JSON.stringify(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
    return JSON.stringify(v);
  };
  for (const row of rows) {
    const id = String(row?.[key] ?? "").trim();
    if (!id) throw new Error("Missing record identity; report is incomplete");
    const previous = seen.get(id);
    if (previous && canonical(previous) !== canonical(row)) throw new Error("Conflicting duplicate record; refresh before using totals");
    if (!previous) seen.set(id, row);
  }
  return Array.from(seen.values());
}
export function summarizeSales(rows: Record<string, any>[], identityKey = "id") {
  // Existing get_sales screen contract: sale id and ordered amount aliases.
  const unique = uniqueRecords(rows, identityKey);
  let total = 0, orders = 0;
  const currencies = new Set<string>();
  for (const row of unique) {
    if (["cancelled", "canceled", "void"].includes(String(row.status ?? "").trim().toLowerCase())) continue;
    const currency = String(row.currency ?? "").trim().toUpperCase();
    if (currency) currencies.add(currency);
    if (currencies.size > 1) throw new Error("Mixed sale currencies; conversion contract is required");
    const amount = [row.total_amount, row.total, row.amount, row.grand_total, row.paid_amount, row.revenue]
      .find(value => value != null && String(value).trim() !== "");
    const n = Number(amount);
    if (amount == null || (typeof amount !== "number" && typeof amount !== "string") || !Number.isFinite(n)) throw new Error("Sale amount unavailable; report is incomplete");
    total += n; orders++;
    if (!Number.isFinite(total)) throw new Error("Sales total exceeds supported range");
  }
  return {total, orders};
}

export function readStockValue(response: unknown): number {
  const raw = Array.isArray(response) ? (response.length === 1 ? response[0] : undefined) : response;
  let value: unknown = raw;
  if (raw && typeof raw === "object") {
    const row = raw as Record<string, unknown>;
    value = ["value", "amount", "total", "sum", "stock_value", "stock_on_hand_value", "on_hand_value", "stock_in_value", "stock_in", "in_value", "received_value"]
      .map(key => row[key]).find(v => v != null && String(v).trim() !== "");
  }
  if (value == null || (typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value))) {
    throw new Error("Stock valuation unavailable; verify the response contract");
  }
  return Number(value);
}
