import {
  intervalDuration,
  minutesToClock,
  minutesToDuration,
  minutesToSignedDuration,
} from "./time-utils.js";
import { detectAbsence } from "./absence.js";

const EXTRA_LABEL = {
  on_the_way: "Nachtrag",
  after_office: "Nachtrag",
  nachtrag: "Nachtrag",
  homeoffice: "Homeoffice",
};

const ABSENCE_ART = {
  sickness: "Krank",
  vacation: "Urlaub",
  compensation: "Freizeitausgleich",
};

const WORK_TYPES = new Set(["office", "on_the_way", "after_office", "nachtrag", "homeoffice"]);

function pairsForDay(day) {
  return (day.reconciledIntervals || [])
    .filter((interval) => WORK_TYPES.has(interval.type))
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((interval) => ({
      kommen: minutesToClock(interval.start),
      gehen: minutesToClock(interval.end),
      type: interval.type,
      label: interval.type === "office" ? "Büro" : EXTRA_LABEL[interval.type] || interval.type,
      extra: interval.type !== "office",
      minutes: intervalDuration(interval),
    }));
}

export function buildHrRow(day) {
  const pairs = pairsForDay(day);
  const absence = pairs.length ? null : detectAbsence(day.crew);
  const istMinutes = pairs.length
    ? pairs.reduce((sum, pair) => sum + pair.minutes, 0)
    : absence
      ? day.reconciledIstMinutes || 0
      : 0;
  const sollMinutes = day.officeSollMinutes || 0;
  const puffMinutes = istMinutes - sollMinutes;
  const hasOfficePunches = (day.office?.punches || []).length > 0;
  const needsBooking = pairs.some((pair) => pair.extra) || Boolean(absence);
  return {
    iso: day.iso,
    date: day.date,
    weekday: day.weekday,
    pairs,
    absence: absence?.label || "",
    absenceType: absence?.type || "",
    art: absence ? ABSENCE_ART[absence.type] || absence.label : "",
    istMinutes,
    sollMinutes,
    ist: minutesToDuration(istMinutes),
    soll: minutesToDuration(sollMinutes) || "",
    puffMinutes,
    puff: minutesToSignedDuration(puffMinutes),
    diffMinutes: puffMinutes,
    diff: minutesToSignedDuration(puffMinutes),
    needsBooking,
    hasOfficePunches,
  };
}

export function summarizeHrRows(rows) {
  const totals = { istMinutes: 0, sollMinutes: 0, sickMinutes: 0, vacationMinutes: 0 };
  for (const row of rows || []) {
    totals.istMinutes += row.istMinutes || 0;
    totals.sollMinutes += row.sollMinutes || 0;
    if (row.absenceType === "sickness") totals.sickMinutes += row.istMinutes || 0;
    if (row.absenceType === "vacation") totals.vacationMinutes += row.istMinutes || 0;
  }
  totals.diffMinutes = totals.istMinutes - totals.sollMinutes;
  totals.ist = minutesToDuration(totals.istMinutes);
  totals.soll = minutesToDuration(totals.sollMinutes);
  totals.diff = minutesToSignedDuration(totals.diffMinutes);
  totals.sick = minutesToDuration(totals.sickMinutes);
  totals.vacation = minutesToDuration(totals.vacationMinutes);
  return totals;
}

export function buildHrExport(result) {
  const rows = (result.days || [])
    .map(buildHrRow)
    .filter((row) => {
      if (row.hasOfficePunches || row.needsBooking) return true;
      return Boolean(row.soll) && row.weekday !== "Sa" && row.weekday !== "So";
    });

  return {
    title: result.officeTitle || "Arbeitszeiten",
    legend:
      "Jede Zeile ist ein Kommen/Gehen, wie in der Buchungstafel. Weiße Büro-Zeiten bleiben unverändert. Nachtrag ist blau, Urlaub grün, Krank rot. IST, SOLL und Puff müssen danach im Tool übereinstimmen.",
    rows,
    summary: summarizeHrRows(rows),
    toBook: rows.filter((row) => row.needsBooking).length,
    unchanged: rows.filter((row) => row.hasOfficePunches).length,
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function hrToCsv(hr) {
  const header = ["Datum", "WT", "Abwesenheit", "Kommen", "Gehen", "Art", "IST", "SOLL", "Puff"];
  const lines = [hr.legend, header.join(";")];
  for (const row of hr.rows) {
    const pairs = row.pairs.length ? row.pairs : [{ kommen: "", gehen: "", label: row.art || "" }];
    for (const pair of pairs) {
      lines.push(
        [row.date, row.weekday, row.absence, pair.kommen, pair.gehen, pair.label, row.ist, row.soll, row.puff]
          .map(csvCell)
          .join(";"),
      );
    }
  }
  return `\uFEFF${lines.join("\n")}`;
}
