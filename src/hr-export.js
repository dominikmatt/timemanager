import { formatInterval, intervalDuration, minutesToClock, minutesToDuration } from "./time-utils.js";
import { detectAbsence } from "./absence.js";

const EXTRA_LABEL = {
  on_the_way: "Auswärts",
  after_office: "Auswärts nach Büro",
  homeoffice: "Homeoffice",
  sickness: "Krankheit",
  vacation: "Urlaub",
  compensation: "Freizeitausgleich",
};

function punchClocks(punches = []) {
  return {
    k1: punches[0] != null ? minutesToClock(punches[0]) : "",
    g1: punches[1] != null ? minutesToClock(punches[1]) : "",
    k2: punches[2] != null ? minutesToClock(punches[2]) : "",
    g2: punches[3] != null ? minutesToClock(punches[3]) : "",
  };
}

function extrasForDay(day) {
  const extras = [];
  for (const interval of day.reconciledIntervals || []) {
    if (interval.type === "on_the_way" || interval.type === "after_office" || interval.type === "homeoffice") {
      extras.push({
        type: interval.type,
        label: EXTRA_LABEL[interval.type],
        from: minutesToClock(interval.start),
        to: minutesToClock(interval.end),
        minutes: intervalDuration(interval),
        text: `${formatInterval(interval)} ${EXTRA_LABEL[interval.type]}`,
      });
    }
  }
  if (!extras.length) {
    const absence = detectAbsence(day.crew);
    if (absence) {
      extras.push({
        type: absence.type,
        label: absence.label,
        from: "",
        to: "",
        minutes: day.reconciledIstMinutes || 0,
        text: `${absence.label} ${absence.days} Tag`,
      });
    }
  }
  return extras;
}

function instruction(day, extras, hasOfficePunches) {
  if (!extras.length) {
    if (hasOfficePunches) return "Keine Nachbuchung. Vorhandene Büro-Stempel nicht ändern.";
    return "Keine Buchung.";
  }
  const extraText = extras.map((item) => item.text).join("; ");
  if (hasOfficePunches) {
    return `Büro-Stempel nicht ändern. Zusätzlich buchen: ${extraText}.`;
  }
  if (extras.some((item) => item.type === "sickness")) {
    return `Krankheit nachbuchen${day.crew?.istMinutes ? ` (${minutesToDuration(day.crew.istMinutes)})` : ""}.`;
  }
  if (extras.some((item) => item.type === "vacation")) {
    return `Urlaub nachbuchen (${extras.find((item) => item.type === "vacation").text}).`;
  }
  if (extras.some((item) => item.type === "compensation")) {
    return `Freizeitausgleich nachbuchen (${extras.find((item) => item.type === "compensation").text}).`;
  }
  return `Nachbuchen: ${extraText}.`;
}

export function buildHrRow(day) {
  const punches = day.office?.punches || [];
  const clocks = punchClocks(punches);
  const extras = extrasForDay(day);
  const hasOfficePunches = punches.length > 0;
  const needsBooking = extras.length > 0;
  const extraMinutes = extras.reduce((sum, extra) => sum + (extra.minutes || 0), 0);
  const extraKind = [...new Set(extras.map((extra) => extra.label))].join(", ");
  return {
    iso: day.iso,
    date: day.date,
    weekday: day.weekday,
    ...clocks,
    ist: minutesToDuration(day.reconciledIstMinutes),
    soll: minutesToDuration(day.officeSollMinutes) || "",
    extras,
    extraKind,
    extraMinutes: needsBooking ? extraMinutes : null,
    extraDuration: needsBooking ? minutesToDuration(extraMinutes) : "",
    extraText: extras.map((item) => item.text).join("; "),
    instruction: instruction(day, extras, hasOfficePunches),
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
      "Spalten K und G sind die Stempel aus der Büro-Auswertung (PDF). Diese Zeiten nicht ändern. Art und Zusatzzeit sind die Nachbuchung.",
    rows,
    toBook: rows.filter((row) => row.needsBooking).length,
    unchanged: rows.filter((row) => row.hasOfficePunches).length,
  };
}

export function hrToCsv(hr) {
  const header = [
    "Datum",
    "WT",
    "K",
    "G",
    "K",
    "G",
    "Istzeit",
    "Sollzeit",
    "Art",
    "Zusatzzeit",
    "Zusätzlich buchen",
    "Anweisung",
  ];
  const lines = [
    hr.legend,
    header.join(";"),
    ...hr.rows.map((row) =>
      [
        row.date,
        row.weekday,
        row.k1,
        row.g1,
        row.k2,
        row.g2,
        row.ist,
        row.soll,
        row.extraKind,
        row.extraDuration,
        row.extraText,
        row.instruction,
      ]
        .map((value) => {
          const text = String(value ?? "");
          return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(";"),
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}
