/** Minutes from midnight. Negative values are allowed for signed durations. */

export function parseTimeToMinutes(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value < 1.5) {
      return Math.round(value * 24 * 60);
    }
    return Math.round(value);
  }
  const text = String(value).trim();
  const match = /^(-)?(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] ? -minutes : minutes;
}

export function minutesToClock(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "";
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesToDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "";
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function minutesToSignedDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "";
  const rounded = Math.round(minutes);
  if (rounded === 0) return "0:00";
  const sign = rounded > 0 ? "+" : "-";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

export function hoursToMinutes(hours) {
  if (hours == null || hours === "") return 0;
  return Math.round(Number(hours) * 60);
}

export function germanDateToIso(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value).trim());
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function isoToGermanDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function excelSerialToIso(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  const utc = Date.UTC(1899, 11, 30) + whole * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function weekdayDe(iso) {
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const [y, m, d] = iso.split("-").map(Number);
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Contract Soll: Mo–Do 8:17, Fr 5:22, weekend 0. */
export const WEEKDAY_SOLL_MINUTES = {
  Mo: 8 * 60 + 17,
  Di: 8 * 60 + 17,
  Mi: 8 * 60 + 17,
  Do: 8 * 60 + 17,
  Fr: 5 * 60 + 22,
};

export function weekdaySollMinutes(iso, weekday = null) {
  if (!iso && !weekday) return 0;
  const day = weekday || weekdayDe(iso);
  return WEEKDAY_SOLL_MINUTES[day] ?? 0;
}

export function eachIso(from, to) {
  if (!from || !to || from > to) return [];
  const days = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function intervalDuration(interval) {
  return Math.max(0, interval.end - interval.start);
}

export function formatInterval(interval) {
  return `${minutesToClock(interval.start)}–${minutesToClock(interval.end)}`;
}

export function subtractIntervals(sources, blocked) {
  const blocks = [...blocked]
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result = [];
  for (const src of sources) {
    if (!src || src.end <= src.start) continue;
    let cursor = src.start;
    const end = src.end;
    for (const block of blocks) {
      if (block.end <= cursor) continue;
      if (block.start >= end) break;
      if (block.start > cursor) {
        result.push({ start: cursor, end: Math.min(block.start, end) });
      }
      cursor = Math.max(cursor, block.end);
      if (cursor >= end) break;
    }
    if (cursor < end) result.push({ start: cursor, end });
  }
  return result.filter((item) => item.end > item.start);
}

export const MORNING_FREE_MINUTES = 15;

/** Remaining Crewmeister pause after the office lunch gap (Gehen→Kommen). */
export function splitPause(pauseMinutes, lunchMinutes = 0) {
  const pause = Math.max(0, Math.round(pauseMinutes || 0));
  const lunch = Math.max(0, Math.round(lunchMinutes || 0));
  const flex = Math.max(0, pause - lunch);
  const morningFree = Math.min(flex, MORNING_FREE_MINUTES);
  const eveningFree = flex - morningFree;
  return { pause, lunch, morningFree, eveningFree };
}

export function punchesToIntervals(punches) {
  const times = (punches || []).filter((t) => t != null);
  const intervals = [];
  for (let i = 0; i + 1 < times.length; i += 2) {
    const start = times[i];
    const end = times[i + 1];
    if (end > start) intervals.push({ start, end, type: "office" });
  }
  return intervals;
}
