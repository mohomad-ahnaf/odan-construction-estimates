type DatedPhoto = { createdAt: string };

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function groupSitePhotosByDate<T extends DatedPhoto>(photos: T[], now = new Date()) {
  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: { key: string; label: string; photos: T[] }[] = [];
  const byDay = new Map<string, (typeof groups)[number]>();

  for (const photo of [...photos].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const date = new Date(photo.createdAt);
    const key = localDayKey(date);
    let group = byDay.get(key);
    if (!group) {
      group = {
        key,
        label: key === today ? "Today" : key === yesterday ? "Yesterday" :
          date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        photos: [],
      };
      byDay.set(key, group);
      groups.push(group);
    }
    group.photos.push(photo);
  }
  return groups;
}
