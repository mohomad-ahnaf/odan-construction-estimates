import { describe, expect, it } from "vitest";
import { convertUnit, feetAndInchesToMetres, formatConverterNumber, formatFeetAndInches, parseConverterNumber } from "./unitConverter";

describe("unit conversion", () => {
  it("uses exact length and area definitions in both directions", () => {
    expect(convertUnit("length", 10, "m", "ft")).toBeCloseTo(32.80839895, 8);
    expect(convertUnit("length", 32.80839895013123, "ft", "m")).toBeCloseTo(10, 10);
    expect(convertUnit("area", 1, "ft2", "m2")).toBeCloseTo(0.09290304, 12);
    expect(convertUnit("area", 1, "perch", "ft2")).toBeCloseTo(272.25, 10);
    expect(convertUnit("area", 1, "ac", "ft2")).toBeCloseTo(43_560, 8);
    expect(convertUnit("area", 1, "ha", "m2")).toBe(10_000);
  });

  it("uses the explicit construction cube and volume factors", () => {
    expect(convertUnit("volume", 1, "ft3", "m3")).toBeCloseTo(0.028316846592, 12);
    expect(convertUnit("volume", 1, "cube", "m3")).toBeCloseTo(28.316846592, 10);
    expect(convertUnit("volume", 28.316846592, "m3", "cube")).toBeCloseTo(1, 12);
    expect(convertUnit("volume", 1, "l", "m3")).toBe(0.001);
    expect(convertUnit("weight", 1, "t", "kg")).toBe(1000);
    expect(convertUnit("length", 1, "m", "ft2")).toBeNull();
  });

  it("validates compound feet and inches and carries rounded inches", () => {
    expect(feetAndInchesToMetres("5", "6").value).toBeCloseTo(5.5 * 0.3048, 12);
    expect(formatFeetAndInches(5.5 * 0.3048)).toBe("5 ft 6 in");
    expect(formatFeetAndInches((5 * 12 + 11.999) * 0.0254)).toBe("6 ft 0 in");
    expect(feetAndInchesToMetres("", "6").value).toBeCloseTo(0.1524, 12);
    expect(feetAndInchesToMetres("5", "").value).toBeCloseTo(1.524, 12);
    expect(feetAndInchesToMetres("5.5", "6").error).toBeTruthy();
    expect(feetAndInchesToMetres("5", "12").error).toBeTruthy();
    expect(feetAndInchesToMetres("", "").value).toBeNull();
  });

  it("keeps blank distinct from zero and rejects invalid or overflowing input", () => {
    expect(parseConverterNumber("").value).toBeNull();
    expect(parseConverterNumber("0").value).toBe(0);
    for (const input of ["-1", "abc", "Infinity", "1e999", "1e-999", "9007199254740992"])
      expect(parseConverterNumber(input).error).toBeTruthy();
    expect(formatConverterNumber(0.00000001, 2)).not.toBe("0.00");
    expect(formatConverterNumber(1.23456, 0)).toBe("1");
    expect(formatConverterNumber(1.23456, 6)).toBe("1.234560");
  });
});
