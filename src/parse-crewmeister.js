import ExcelJS from "exceljs";
import {
  excelSerialToIso,
  germanDateToIso,
  hoursToMinutes,
  parseTimeToMinutes,
} from "./time-utils.js";

function cellValue(cell) {
  if (!cell) return null;
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (value.result != null) return value.result;
    if (value.text != null) return value.text;
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return value;
}

function cellText(cell) {
  const value = cellValue(cell);
  if (value == null) return "";
  return String(value).trim();
}

function cellDateIso(cell) {
  const value = cellValue(cell);
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return excelSerialToIso(value);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return germanDateToIso(text);
}

function cellHours(cell) {
  const value = cellValue(cell);
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function headerMap(row) {
  const map = {};
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const text = cellText(cell).toLowerCase();
    if (!text) return;
    if (text === "von" && map.fromDate == null) map.fromDate = col;
    else if (text === "von") map.fromTime = col;
    else if (text === "bis" && map.toDate == null) map.toDate = col;
    else if (text === "bis") map.toTime = col;
    else if (text.includes("pause")) map.pause = col;
    else if (text.includes("anwesend")) map.present = col;
    else if (text === "ist (h)" || text.startsWith("ist")) map.ist = col;
    else if (text.startsWith("soll")) map.soll = col;
    else if (text.includes("kommentar")) map.comment = col;
    else if (text.includes("abwesend (d)")) map.absence = col;
    else if (text.includes("mitarbeiter")) map.employee = col;
  });
  return map;
}

function findHeaderRow(sheet) {
  const max = Math.min(sheet.rowCount, 12);
  for (let r = 1; r <= max; r += 1) {
    const map = headerMap(sheet.getRow(r));
    if (map.fromDate && (map.pause || map.ist || map.fromTime)) {
      return { rowNumber: r, columns: map };
    }
  }
  return null;
}

function isTotalRow(row, columns) {
  const employee = columns.employee ? cellText(row.getCell(columns.employee)) : "";
  const from = cellDateIso(row.getCell(columns.fromDate));
  return !from || employee.toLowerCase().includes("erstellt") || employee === "";
}

function ensureDay(map, iso) {
  if (!map.has(iso)) {
    map.set(iso, {
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
  return map.get(iso);
}

export async function parseCrewmeister(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const dailySheet =
    workbook.worksheets.find((s) => /arbeitszeiten/i.test(s.name)) ||
    workbook.worksheets[0];
  const stampSheet =
    workbook.worksheets.find((s) => /zeitstempel/i.test(s.name)) ||
    workbook.worksheets[1];

  const days = new Map();
  const range = { from: null, to: null };

  const dailyHeader = findHeaderRow(dailySheet);
  if (dailyHeader) {
    for (let r = dailyHeader.rowNumber + 1; r <= dailySheet.rowCount; r += 1) {
      const row = dailySheet.getRow(r);
      if (isTotalRow(row, dailyHeader.columns)) continue;
      const iso = cellDateIso(row.getCell(dailyHeader.columns.fromDate));
      if (!iso) continue;
      const day = ensureDay(days, iso);
      day.pauseMinutes = hoursToMinutes(cellHours(row.getCell(dailyHeader.columns.pause)));
      day.istMinutes = hoursToMinutes(cellHours(row.getCell(dailyHeader.columns.ist)));
      day.sollMinutes = hoursToMinutes(cellHours(row.getCell(dailyHeader.columns.soll)));
      if (dailyHeader.columns.present) {
        day.presentMinutes = hoursToMinutes(cellHours(row.getCell(dailyHeader.columns.present)));
      }
      day.comment = dailyHeader.columns.comment
        ? cellText(row.getCell(dailyHeader.columns.comment))
        : "";
      day.absence = dailyHeader.columns.absence
        ? cellText(row.getCell(dailyHeader.columns.absence))
        : "";
      const fromTime = dailyHeader.columns.fromTime
        ? parseTimeToMinutes(cellText(row.getCell(dailyHeader.columns.fromTime)))
        : null;
      const toTime = dailyHeader.columns.toTime
        ? parseTimeToMinutes(cellText(row.getCell(dailyHeader.columns.toTime)))
        : null;
      if (fromTime != null && toTime != null && toTime > fromTime) {
        day.dailySpan = { start: fromTime, end: toTime };
      }
    }
  }

  const stampHeader = stampSheet ? findHeaderRow(stampSheet) : null;
  if (stampHeader) {
    for (let r = stampHeader.rowNumber + 1; r <= stampSheet.rowCount; r += 1) {
      const row = stampSheet.getRow(r);
      if (isTotalRow(row, stampHeader.columns)) continue;
      const iso = cellDateIso(row.getCell(stampHeader.columns.fromDate));
      if (!iso) continue;
      const day = ensureDay(days, iso);
      const start = stampHeader.columns.fromTime
        ? parseTimeToMinutes(cellText(row.getCell(stampHeader.columns.fromTime)))
        : null;
      const end = stampHeader.columns.toTime
        ? parseTimeToMinutes(cellText(row.getCell(stampHeader.columns.toTime)))
        : null;
      if (start != null && end != null && end > start) {
        day.intervals.push({ start, end });
      }
      const comment = stampHeader.columns.comment
        ? cellText(row.getCell(stampHeader.columns.comment))
        : "";
      if (comment && !day.comment) day.comment = comment;
      const absence = stampHeader.columns.absence
        ? cellText(row.getCell(stampHeader.columns.absence))
        : "";
      if (absence && !day.absence) day.absence = absence;
    }
  }

  for (const day of days.values()) {
    if (day.intervals.length === 0 && day.dailySpan) {
      day.intervals.push({ ...day.dailySpan });
    }
    day.intervals.sort((a, b) => a.start - b.start);
    if (!range.from || day.iso < range.from) range.from = day.iso;
    if (!range.to || day.iso > range.to) range.to = day.iso;
  }

  return {
    source: "crewmeister",
    range,
    days: [...days.values()].sort((a, b) => a.iso.localeCompare(b.iso)),
  };
}
