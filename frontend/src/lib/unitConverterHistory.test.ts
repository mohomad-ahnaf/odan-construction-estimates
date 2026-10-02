import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addConverterHistory, converterHistoryKey, historyResultLabel, historySourceLabel,
  readConverterHistory, writeConverterHistory, type ConverterHistoryEntry,
} from "./unitConverterHistory";

function entry(id: string, date = "2026-10-01T10:00:00.000Z"): ConverterHistoryEntry {
  return {
    id, category: "length", fromUnit: "ft-in", toUnit: "m", inputValue: 5.5,
    resultValue: 1.6764, canonicalValue: 1.6764,
    inputRaw: { feet: "5", inches: "6.0" }, precision: 4, createdAt: date,
  };
}

describe("converter history storage", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("sorts newest first, caps at 50 and separates user IDs", () => {
    const entries = Array.from({ length: 55 }, (_, index) => entry(String(index), new Date(2026, 9, 1, 0, index).toISOString()));
    expect(writeConverterHistory("alice", entries)).toBe(true);
    const stored = readConverterHistory("alice");
    expect(stored.entries).toHaveLength(50);
    expect(stored.entries[0]?.id).toBe("49");
    expect(readConverterHistory("bob").entries).toEqual([]);
    expect(converterHistoryKey("alice")).not.toBe(converterHistoryKey("bob"));
  });

  it("rejects corrupt and invalid stored entries without throwing", () => {
    localStorage.setItem(converterHistoryKey("alice"), "{broken");
    expect(readConverterHistory("alice")).toEqual({ entries: [], available: true });
    localStorage.setItem(converterHistoryKey("alice"), JSON.stringify([
      entry("good"), { ...entry("bad"), toUnit: "kg" }, { ...entry("nan"), resultValue: "Infinity" },
      { ...entry("bad-input"), inputRaw: { feet: "5", inches: "12" } },
    ]));
    expect(readConverterHistory("alice").entries.map((item) => item.id)).toEqual(["good"]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readConverterHistory("alice")).toEqual({ entries: [], available: false });
    expect(writeConverterHistory("alice", [])).toBe(false);
  });

  it("keeps original compound notation and the full cube label", () => {
    expect(historySourceLabel(entry("a"))).toBe("5 ft 6.0 in");
    const cube: ConverterHistoryEntry = {
      ...entry("cube"), category: "volume", fromUnit: "m3", toUnit: "cube",
      inputRaw: "28.316846592", inputValue: 28.316846592, resultValue: 1,
      canonicalValue: 28.316846592,
    };
    expect(historyResultLabel(cube)).toBe("1.0000 Construction cube (1,000 ft³)");
  });

  it("prevents only consecutive duplicates and retains the newest 50", () => {
    const first = entry("first");
    expect(addConverterHistory([first], entry("duplicate"))).toEqual([first]);
    const different = { ...entry("different"), inputValue: 6, resultValue: 1.8288 };
    expect(addConverterHistory([different, first], entry("again"))).toHaveLength(3);
    const many = Array.from({ length: 50 }, (_, index) => ({ ...entry(String(index)), inputValue: index }));
    expect(addConverterHistory(many, { ...entry("new"), inputValue: 51 })).toHaveLength(50);
  });
});
