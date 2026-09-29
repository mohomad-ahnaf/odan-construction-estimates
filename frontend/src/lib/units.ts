/** Stable values are stored in estimates; descriptions are only shown in the form. */
export const constructionUnits = [
  { value: "No.", label: "No. — Number" },
  { value: "Item", label: "Item" },
  { value: "Lot", label: "Lot" },
  { value: "Job", label: "Job" },
  { value: "LS", label: "LS — Lump Sum" },
  { value: "m", label: "m — Metre" },
  { value: "m²", label: "m² — Square Metre" },
  { value: "m³", label: "m³ — Cubic Metre" },
  { value: "ft", label: "ft — Foot" },
  { value: "ft²", label: "ft² — Square Foot" },
  { value: "ft³", label: "ft³ — Cubic Foot" },
  { value: "mm", label: "mm — Millimetre" },
  { value: "kg", label: "kg — Kilogram" },
  { value: "t", label: "t — Tonne" },
  { value: "L", label: "L — Litre" },
  { value: "bag", label: "bag" },
  { value: "day", label: "day" },
  { value: "hour", label: "hour" },
] as const;

export const constructionUnitValues = new Set<string>(
  constructionUnits.map((unit) => unit.value),
);
