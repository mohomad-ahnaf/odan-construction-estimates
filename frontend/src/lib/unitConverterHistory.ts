import { converterUnit, feetAndInchesToMetres, formatConverterNumber, formatFeetAndInches, parseConverterNumber, type ConverterCategory } from "./unitConverter";

export type ConverterHistoryEntry = {
  id: string;
  category: ConverterCategory;
  fromUnit: string;
  toUnit: string;
  inputValue: number;
  resultValue: number;
  canonicalValue: number;
  inputRaw: string | { feet: string; inches: string };
  precision: number;
  createdAt: string;
};

export const MAX_CONVERTER_HISTORY = 50;
const keyPrefix = "odan-unit-converter-history:";

export function converterHistoryKey(userId: string) {
  return `${keyPrefix}${encodeURIComponent(userId)}`;
}

function validEntry(value: unknown): value is ConverterHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ConverterHistoryEntry>;
  if (typeof entry.id !== "string" || !entry.id || entry.id.length > 100) return false;
  if (!(["length", "area", "volume", "weight"] as unknown[]).includes(entry.category)) return false;
  const category = entry.category!;
  if (typeof entry.fromUnit !== "string" || typeof entry.toUnit !== "string" ||
    !converterUnit(category, entry.fromUnit) || !converterUnit(category, entry.toUnit)) return false;
  if (![entry.inputValue, entry.resultValue, entry.canonicalValue].every(
    (number) => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER,
  )) return false;
  if (!Number.isInteger(entry.precision) || entry.precision! < 0 || entry.precision! > 6) return false;
  if (typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) return false;
  if (entry.fromUnit === "ft-in") {
    if (typeof entry.inputRaw !== "object" || !entry.inputRaw ||
      typeof entry.inputRaw.feet !== "string" || typeof entry.inputRaw.inches !== "string" ||
      entry.inputRaw.feet.length > 40 || entry.inputRaw.inches.length > 40) return false;
    if (feetAndInchesToMetres(entry.inputRaw.feet, entry.inputRaw.inches).value === null) return false;
  } else if (typeof entry.inputRaw !== "string" || entry.inputRaw.length > 100 ||
    parseConverterNumber(entry.inputRaw).value === null) return false;
  return true;
}

export function readConverterHistory(userId: string): { entries: ConverterHistoryEntry[]; available: boolean } {
  try {
    const stored = localStorage.getItem(converterHistoryKey(userId));
    if (!stored) return { entries: [], available: true };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return { entries: [], available: true };
    const entries = parsed.filter(validEntry).sort((a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ).slice(0, MAX_CONVERTER_HISTORY);
    return { entries, available: true };
  } catch {
    try {
      localStorage.getItem(converterHistoryKey(userId));
      return { entries: [], available: true };
    } catch {
      return { entries: [], available: false };
    }
  }
}

export function writeConverterHistory(userId: string, entries: ConverterHistoryEntry[]) {
  try {
    localStorage.setItem(converterHistoryKey(userId), JSON.stringify(entries.slice(0, MAX_CONVERTER_HISTORY)));
    return true;
  } catch {
    return false;
  }
}

export function addConverterHistory(entries: ConverterHistoryEntry[], entry: ConverterHistoryEntry) {
  const latest = entries[0];
  if (latest && latest.category === entry.category && latest.fromUnit === entry.fromUnit &&
    latest.toUnit === entry.toUnit && latest.inputValue === entry.inputValue &&
    latest.resultValue === entry.resultValue) return entries;
  return [entry, ...entries].slice(0, MAX_CONVERTER_HISTORY);
}

export function historySourceLabel(entry: ConverterHistoryEntry) {
  if (entry.fromUnit === "ft-in" && typeof entry.inputRaw === "object")
    return `${entry.inputRaw.feet || "0"} ft ${entry.inputRaw.inches || "0"} in`;
  return `${entry.inputRaw} ${converterUnit(entry.category, entry.fromUnit)?.symbol ?? ""}`;
}

export function historyResultLabel(entry: ConverterHistoryEntry) {
  if (entry.toUnit === "ft-in") return formatFeetAndInches(entry.canonicalValue);
  return `${formatConverterNumber(entry.resultValue, entry.precision)} ${converterUnit(entry.category, entry.toUnit)?.symbol ?? ""}`;
}
