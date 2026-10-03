import { describe, expect, it } from "vitest";
import { groupSitePhotosByDate } from "./sitePhotoDates";

const localIso = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).toISOString();

describe("site photo date groups", () => {
  it("uses local calendar days across midnight, months, and years", () => {
    const now = new Date(2027, 0, 1, 0, 5);
    const photos = [
      { id: "old", createdAt: localIso(2026, 10, 1) },
      { id: "yesterday", createdAt: localIso(2026, 12, 31, 23) },
      { id: "today", createdAt: localIso(2027, 1, 1, 0) },
      { id: "same-day", createdAt: localIso(2026, 12, 31, 8) },
    ];
    const groups = groupSitePhotosByDate(photos, now);
    expect(groups.map(({ label, photos: items }) => [label, items.map((item) => item.id)]))
      .toEqual([
        ["Today", ["today"]],
        ["Yesterday", ["yesterday", "same-day"]],
        ["01 Oct 2026", ["old"]],
      ]);
  });

  it("uses the latest revision timestamp and makes one section per local date", () => {
    const now = new Date(2026, 9, 3, 12);
    const photos = [
      { id: "first", createdAt: localIso(2026, 10, 3, 11) },
      { id: "replacement", createdAt: localIso(2026, 10, 3, 10) },
      { id: "earlier", createdAt: localIso(2026, 10, 2, 9) },
    ];
    const groups = groupSitePhotosByDate(photos, now);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.photos.map((item) => item.id)).toEqual(["first", "replacement"]);
    expect(groups[1]?.photos.map((item) => item.id)).toEqual(["earlier"]);
  });
});
