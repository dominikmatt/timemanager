function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

function headerIndex(header) {
  const index = {};
  header.forEach((name, col) => {
    index[String(name).trim().toLowerCase()] = col;
  });
  return index;
}

function cell(row, index, name) {
  const col = index[name];
  if (col == null) return "";
  return String(row[col] ?? "").trim();
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ensureDay(days, iso) {
  if (!days.has(iso)) {
    days.set(iso, {
      iso,
      intervals: [],
      pauseMinutes: 0,
      istMinutes: 0,
      sollMinutes: 0,
      presentMinutes: 0,
      comment: "",
      absence: "",
    });
  }
  return days.get(iso);
}

function addBlock(days, iso, start, minutes) {
  let cursor = start;
  let left = minutes;
  let day = iso;
  while (left > 0) {
    const room = 24 * 60 - cursor;
    const take = Math.min(room, left);
    if (take > 0) ensureDay(days, day).intervals.push({ start: cursor, end: cursor + take });
    left -= take;
    if (left <= 0) break;
    day = addDays(day, 1);
    cursor = 0;
  }
}

function mergeIntervals(intervals) {
  const sorted = [...intervals]
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else merged.push({ start: item.start, end: item.end });
  }
  return merged;
}

function absenceFromText(text) {
  if (/krankheit|\bkrank\b/i.test(text)) return "Krankheit (1)";
  if (/freizeitausgleich|zeitausgleich/i.test(text)) return "Freizeitausgleich (1)";
  if (/urlaub/i.test(text)) return "Urlaub (1)";
  return "";
}

export function parseTempoCsv(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer);
  const rows = parseCsv(text);
  if (!rows.length) {
    return { source: "tempo", range: { from: null, to: null }, days: [] };
  }
  const columns = headerIndex(rows[0]);
  if (columns["work date"] == null || (columns["logged seconds"] == null && columns["logged hours"] == null)) {
    throw new Error("Die CSV hat keine Tempo-Spalten Work date und Logged Seconds.");
  }

  const days = new Map();
  for (const row of rows.slice(1)) {
    const stamp = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(cell(row, columns, "work date"));
    if (!stamp) continue;
    const seconds = Number(cell(row, columns, "logged seconds"));
    const hours = Number(String(cell(row, columns, "logged hours")).replace(",", "."));
    const minutes = Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds / 60)
      : Number.isFinite(hours) && hours > 0
        ? Math.round(hours * 60)
        : 0;
    if (!minutes) continue;
    const summary = cell(row, columns, "work item summary");
    const description = cell(row, columns, "work description");
    const day = ensureDay(days, stamp[1]);
    const absence = absenceFromText(`${summary} ${description}`);
    if (absence) {
      if (!day.absence) day.absence = absence;
      day.absenceMinutes = (day.absenceMinutes || 0) + minutes;
      continue;
    }
    const start = Number(stamp[2]) * 60 + Number(stamp[3]);
    addBlock(days, stamp[1], start, minutes);
    if (/homeoffice|home office|home-office/i.test(`${summary} ${description}`)) day.comment = "homeoffice";
  }

  const range = { from: null, to: null };
  for (const day of days.values()) {
    day.intervals = mergeIntervals(day.intervals);
    const worked = day.intervals.reduce((sum, item) => sum + (item.end - item.start), 0);
    day.istMinutes = worked || day.absenceMinutes || 0;
    day.presentMinutes = day.istMinutes;
    if (day.intervals.length) {
      day.dailySpan = {
        start: day.intervals[0].start,
        end: day.intervals[day.intervals.length - 1].end,
      };
    }
    if (!range.from || day.iso < range.from) range.from = day.iso;
    if (!range.to || day.iso > range.to) range.to = day.iso;
  }

  return {
    source: "tempo",
    range,
    days: [...days.values()].sort((a, b) => a.iso.localeCompare(b.iso)),
  };
}

export function isTempoCsv(buffer) {
  const head = Buffer.isBuffer(buffer) ? buffer.subarray(0, 500).toString("utf8") : String(buffer).slice(0, 500);
  const text = head.replace(/^\uFEFF/, "");
  return /work date/i.test(text) && /logged (seconds|hours)/i.test(text);
}
