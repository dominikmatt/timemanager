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
  homeoffice: "Homeoffice",
};

const WORK_TYPES = new Set(["office", "on_the_way", "after_office", "homeoffice"]);

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
      "Jede Zeile ist ein Kommen/Gehen, wie in der Buchungstafel. Weiße Büro-Zeiten sind schon gestempelt und bleiben unverändert. Blaue Zeilen sind Zusatzzeit und werden zusätzlich gebucht, als eigene Kommen/Gehen-Paare vor dem ersten Stempel oder nach dem letzten. IST, SOLL und Puff sind die Werte, die das Tool danach anzeigen muss.",
    rows,
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
    const pairs = row.pairs.length ? row.pairs : [{ kommen: "", gehen: "", label: "" }];
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
