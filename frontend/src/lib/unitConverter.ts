export const converterUnits = {
  length: [
    { id: "mm", label: "Millimetres", symbol: "mm", factor: 0.001 },
    { id: "cm", label: "Centimetres", symbol: "cm", factor: 0.01 },
    { id: "m", label: "Metres", symbol: "m", factor: 1 },
    { id: "km", label: "Kilometres", symbol: "km", factor: 1000 },
    { id: "in", label: "Inches", symbol: "in", factor: 0.0254 },
    { id: "ft", label: "Feet", symbol: "ft", factor: 0.3048 },
    { id: "yd", label: "Yards", symbol: "yd", factor: 0.9144 },
    { id: "ft-in", label: "Feet + Inches", symbol: "ft + in", factor: 0.3048 },
  ],
  area: [
    { id: "mm2", label: "Square millimetres", symbol: "mm²", factor: 0.001 ** 2 },
    { id: "cm2", label: "Square centimetres", symbol: "cm²", factor: 0.01 ** 2 },
    { id: "m2", label: "Square metres", symbol: "m²", factor: 1 },
    { id: "ft2", label: "Square feet", symbol: "ft²", factor: 0.3048 ** 2 },
    { id: "yd2", label: "Square yards", symbol: "yd²", factor: 0.9144 ** 2 },
    { id: "ac", label: "Acres", symbol: "ac", factor: 43_560 * 0.3048 ** 2 },
    { id: "ha", label: "Hectares", symbol: "ha", factor: 10_000 },
    { id: "perch", label: "Perch (272.25 ft²)", symbol: "perch", factor: 272.25 * 0.3048 ** 2 },
  ],
  volume: [
    { id: "m3", label: "Cubic metres", symbol: "m³", factor: 1 },
    { id: "ft3", label: "Cubic feet", symbol: "ft³", factor: 0.3048 ** 3 },
    { id: "l", label: "Litres", symbol: "L", factor: 0.001 },
    { id: "cube", label: "Construction cube (1,000 ft³)", symbol: "Construction cube (1,000 ft³)", factor: 1_000 * 0.3048 ** 3 },
  ],
  weight: [
    { id: "g", label: "Grams", symbol: "g", factor: 0.001 },
    { id: "kg", label: "Kilograms", symbol: "kg", factor: 1 },
    { id: "t", label: "Metric tonnes", symbol: "t", factor: 1000 },
  ],
} as const;

export type ConverterCategory = keyof typeof converterUnits;
export type ConverterUnit<C extends ConverterCategory> = (typeof converterUnits)[C][number]["id"];
export type AnyConverterUnit = ConverterUnit<ConverterCategory>;

export const defaultConverterUnits: { [C in ConverterCategory]: { from: ConverterUnit<C>; to: ConverterUnit<C> } } = {
  length: { from: "m", to: "ft" },
  area: { from: "m2", to: "ft2" },
  volume: { from: "m3", to: "ft3" },
  weight: { from: "kg", to: "g" },
};

export function converterUnit<C extends ConverterCategory>(category: C, id: string) {
  return converterUnits[category].find((unit) => unit.id === id);
}

export function toCanonical(category: ConverterCategory, value: number, unitId: string) {
  const unit = converterUnit(category, unitId);
  if (!unit || !Number.isFinite(value) || value < 0) return null;
  const canonical = value * unit.factor;
  return Number.isFinite(canonical) && canonical <= Number.MAX_SAFE_INTEGER && (value === 0 || canonical > 0) ? canonical : null;
}

export function fromCanonical(category: ConverterCategory, canonical: number, unitId: string) {
  const unit = converterUnit(category, unitId);
  if (!unit || !Number.isFinite(canonical) || canonical < 0) return null;
  const converted = canonical / unit.factor;
  return Number.isFinite(converted) && converted <= Number.MAX_SAFE_INTEGER && (canonical === 0 || converted > 0) ? converted : null;
}

export function convertUnit(category: ConverterCategory, value: number, from: string, to: string) {
  const canonical = toCanonical(category, value, from);
  return canonical === null ? null : fromCanonical(category, canonical, to);
}

const decimalPattern = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseConverterNumber(raw: string) {
  const value = raw.trim();
  if (!value) return { value: null, error: "" };
  if (!decimalPattern.test(value)) return { value: null, error: "Enter a valid nonnegative number." };
  const parsed = Number(value);
  if (parsed === 0 && /[1-9]/.test(value.replace(/[eE][+-]?\d+$/, "")))
    return { value: null, error: "Enter a larger number that can be represented accurately." };
  if (!Number.isFinite(parsed) || parsed > Number.MAX_SAFE_INTEGER)
    return { value: null, error: "Enter a smaller finite number." };
  return { value: parsed, error: "" };
}

export function feetAndInchesToMetres(feetRaw: string, inchesRaw: string) {
  if (!feetRaw.trim() && !inchesRaw.trim()) return { value: null, error: "" };
  const feet = parseConverterNumber(feetRaw);
  const inches = parseConverterNumber(inchesRaw);
  if (feet.error || inches.error)
    return { value: null, error: "Enter whole nonnegative feet and inches from 0 to under 12." };
  const feetValue = feet.value ?? 0;
  const inchesValue = inches.value ?? 0;
  if (!Number.isInteger(feetValue) || inchesValue >= 12)
    return { value: null, error: "Feet must be whole and inches must be below 12." };
  const value = (feetValue * 12 + inchesValue) * 0.0254;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)
    return { value: null, error: "Enter a smaller finite number." };
  return { value, error: "" };
}

export function formatFeetAndInches(metres: number) {
  if (!Number.isFinite(metres) || metres < 0) return "";
  const totalInches = metres / 0.0254;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round((totalInches - feet * 12) * 100) / 100;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet} ft ${inches.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")} in`;
}

export function formatConverterNumber(value: number, precision: number) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return (0).toFixed(precision);
  const fixed = value.toFixed(precision);
  if (Number(fixed) === 0) return value.toExponential(Math.max(1, precision));
  return fixed;
}
