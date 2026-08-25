import {
  formatInterval,
  intervalDuration,
  isoToGermanDate,
  minutesToDuration,
  splitPause,
  subtractIntervals,
  weekdayDe,
} from "./time-utils.js";
import { absenceCreditMinutes, detectAbsence } from "./absence.js";

function listIntervals(intervals) {
  return intervals.map(formatInterval).join(", ");
}

function officeLunchGaps(officeIntervals) {
  const gaps = [];
  for (let i = 0; i < officeIntervals.length - 1; i += 1) {
    const start = officeIntervals[i].end;
    const end = officeIntervals[i + 1].start;
    if (end > start) gaps.push({ start, end, type: "lunch" });
  }
  return gaps;
}

function spanOf(intervals) {
  if (!intervals.length) return null;
  return {
    start: Math.min(...intervals.map((i) => i.start)),
    end: Math.max(...intervals.map((i) => i.end)),
  };
}

function intersect(a, b) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

function classifyLeftover(interval, firstOffice, lastOffice) {
  if (interval.end <= firstOffice) return "on_the_way";
  if (interval.start >= lastOffice) return "after_office";
  return "extra";
}

function isSick(crew) {
  return detectAbsence(crew)?.type === "sickness";
}

function isHomeoffice(crew) {
  return /homeoffice|home office|home-office/i.test(crew?.comment || "");
}

function isWeekendModel(model) {
  if (!model) return false;
  return /\b[67]\b/.test(model) && !/\b5[56]\b/.test(model);
}

function generateNote(day) {
  const parts = [];
  const office = day.office;
  const crew = day.crew;
  const absence = detectAbsence(crew);

  if (office?.intervals?.length) {
    parts.push(
      `Bürozeiten unverändert gelassen: ${listIntervals(office.intervals)} (Ist ${minutesToDuration(office.istMinutes)}).`,
    );
    if (day.lunchIntervals.length) {
      parts.push(
        `Mittagspause ist die Zeit zwischen Gehen und Kommen im Büro: ${day.lunchIntervals
          .map((interval) => `${formatInterval(interval)} (${intervalDuration(interval)} Min)`)
          .join(", ")}.`,
      );
    }
    if (day.pauseSplit) {
      const { pause, morningFree, eveningFree } = day.pauseSplit;
      parts.push(
        `Rest der Crewmeister-Pause (${minutesToDuration(pause)}) als Freizeit: Morgen ${morningFree} Min, Abend ${eveningFree} Min.`,
      );
    }
    if (day.freeIntervals.length) {
      parts.push(`Freizeit nicht als Arbeit gezählt: ${listIntervals(day.freeIntervals)}.`);
    }
    const added = day.reconciledIntervals.filter(
      (i) => i.type === "on_the_way" || i.type === "after_office",
    );
    if (added.length) {
      parts.push(
        `Ergänzt aus Crewmeister: ${added.map((i) => `${formatInterval(i)} (${i.type === "on_the_way" ? "Arbeitsweg" : "nach Büro"})`).join(", ")}.`,
      );
    } else if (crew?.intervals?.length) {
      parts.push("Kein zusätzlicher Arbeitsweg außerhalb der Bürozeit und Freizeitpuffer.");
    } else {
      parts.push("Keine Crewmeister-Zeiten für diesen Tag.");
    }
    if (isHomeoffice(crew) && office.intervals.length) {
      parts.push("Crewmeister ist als Homeoffice markiert, Büro-Stempel haben Vorrang.");
    }
    if (absence && office.intervals.length) {
      parts.push(`Crewmeister meldet ${absence.label}, Büro-Stempel wurden trotzdem nicht geändert.`);
    }
  } else if (absence?.type === "vacation" || absence?.type === "compensation") {
    parts.push(
      `Keine Büro-Stempel. Crewmeister: ${absence.label} (${absence.days} Tag). Ist auf Soll gesetzt (${minutesToDuration(day.reconciledIstMinutes)}).`,
    );
  } else if (isSick(crew)) {
    parts.push(
      `Keine Büro-Stempel. Crewmeister: Krankheit${crew.istMinutes ? ` ${minutesToDuration(crew.istMinutes)}` : ""}. Bürozeiten nicht geändert.`,
    );
    if (office?.sollMinutes) {
      parts.push(
        `Büro zeigt fehlende Sollzeit (${minutesToDuration(-office.sollMinutes)}), keine KRK-Buchung im Bürosystem.`,
      );
    }
  } else if (crew?.intervals?.length) {
    const label = isHomeoffice(crew) ? "Homeoffice" : "Crewmeister-Zeit";
    parts.push(
      `Keine Büro-Stempel. ${label} übernommen: ${listIntervals(crew.intervals)} (Ist ${minutesToDuration(crew.istMinutes)}, Pause bereits abgezogen).`,
    );
    if (office?.sollMinutes) {
      parts.push(
        `Büro hatte Soll ${minutesToDuration(office.sollMinutes)} ohne Ist — Lücke mit Crewmeister gefüllt, Stempel unverändert (keine).`,
      );
    }
  } else if (office && isWeekendModel(office.dayModel)) {
    parts.push(
      `Wochenende/Frei im Bürosystem (Tagesmodell ${office.dayModel}). Keine Anpassung.`,
    );
  } else if (office?.sollMinutes && !office.intervals.length) {
    parts.push(
      `Büro ohne Stempel bei Soll ${minutesToDuration(office.sollMinutes)}. Keine Crewmeister-Zeit gefunden. Bürozeiten nicht geändert.`,
    );
  } else if (crew && !crew.intervals.length && crew.sollMinutes) {
    parts.push("Nur in Crewmeister, ohne Zeiten. Nichts übernommen.");
  } else {
    parts.push("Keine Zeiten in beiden Quellen.");
  }

  if (day.warnings.length) {
    parts.push(`Hinweis: ${day.warnings.join(" ")}`);
  }

  return parts.join(" ");
}

function reconcileOfficeDay(office, crew) {
  const warnings = [];
  const officeIntervals = office.intervals.map((i) => ({ ...i, type: "office" }));
  const lunchIntervals = officeLunchGaps(officeIntervals);
  const firstOffice = officeIntervals[0].start;
  const lastOffice = officeIntervals[officeIntervals.length - 1].end;
  const lunchMinutes = lunchIntervals.reduce((sum, interval) => sum + intervalDuration(interval), 0);
  const pauseSplit = splitPause(crew?.pauseMinutes || 0, lunchMinutes);

  const morningWindow = pauseSplit.morningFree
    ? {
        start: firstOffice - pauseSplit.morningFree,
        end: firstOffice,
        type: "free",
        label: "morning",
      }
    : null;
  const eveningWindow = pauseSplit.eveningFree
    ? {
        start: lastOffice,
        end: lastOffice + pauseSplit.eveningFree,
        type: "free",
        label: "evening",
      }
    : null;

  const blocked = [
    ...officeIntervals,
    ...lunchIntervals,
    ...(morningWindow ? [morningWindow] : []),
    ...(eveningWindow ? [eveningWindow] : []),
  ];

  const crewIntervals = crew?.intervals || [];
  const leftover = subtractIntervals(crewIntervals, blocked).map((interval) => ({
    ...interval,
    type: classifyLeftover(interval, firstOffice, lastOffice),
  }));

  const crewSpan = spanOf(crewIntervals);
  const freeIntervals = [morningWindow, eveningWindow]
    .filter(Boolean)
    .map((window) => {
      const clipped = crewSpan ? intersect(window, crewSpan) : { ...window };
      return clipped ? { ...clipped, type: "free", label: window.label } : null;
    })
    .filter(Boolean);

  if (leftover.some((i) => i.type === "extra")) {
    warnings.push("Crewmeister-Zeit lag in der Büro-/Pausenzeit und wurde nicht als Arbeit ergänzt.");
  }
  if (office.punches.length % 2 !== 0) {
    warnings.push("Ungerade Anzahl Büro-Stempel.");
  }

  const addedWork = leftover.filter((i) => i.type === "on_the_way" || i.type === "after_office");
  const officeIst = office.istMinutes ?? officeIntervals.reduce((sum, i) => sum + intervalDuration(i), 0);
  const reconciledIstMinutes = officeIst + addedWork.reduce((sum, i) => sum + intervalDuration(i), 0);

  const reconciledIntervals = [
    ...leftover.filter((i) => i.type !== "extra"),
    ...officeIntervals,
    ...lunchIntervals,
    ...freeIntervals,
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    pauseSplit,
    lunchIntervals,
    freeIntervals,
    warnings,
    reconciledIntervals,
    reconciledIstMinutes,
    addedWork,
  };
}

function reconcileRemoteDay(office, crew) {
  const warnings = [];
  const absence = detectAbsence(crew);
  let reconciledIntervals = [];
  let reconciledIstMinutes = 0;
  let kind = "empty";

  if (absence && (absence.type === "vacation" || absence.type === "compensation")) {
    reconciledIstMinutes = absenceCreditMinutes(office, crew, absence.days);
    kind = absence.type;
  } else if (absence?.type === "sickness") {
    reconciledIstMinutes = crew?.istMinutes || 0;
    kind = "sickness";
  } else if (crew?.intervals?.length) {
    reconciledIntervals = crew.intervals.map((interval) => ({
      ...interval,
      type: "homeoffice",
    }));
    reconciledIstMinutes = crew.istMinutes || crew.intervals.reduce((sum, i) => sum + intervalDuration(i), 0);
    kind = "homeoffice";
  }

  if (office?.sollMinutes && !crew) {
    warnings.push("Nur Büro-Soll, keine Crewmeister-Daten.");
  }

  return {
    pauseSplit: null,
    lunchIntervals: [],
    freeIntervals: [],
    warnings,
    reconciledIntervals,
    reconciledIstMinutes,
    addedWork: [],
    kind,
    absenceDays: absence?.days ?? null,
    absenceLabel: absence?.label ?? null,
  };
}

export function reconcileDay(office, crew) {
  const iso = office?.iso || crew?.iso;
  const result = {
    iso,
    date: isoToGermanDate(iso),
    weekday: office?.weekday || weekdayDe(iso),
    office: office || null,
    crew: crew || null,
    warnings: [],
    pauseSplit: null,
    lunchIntervals: [],
    freeIntervals: [],
    reconciledIntervals: [],
    reconciledIstMinutes: 0,
    officeSollMinutes: office?.sollMinutes ?? crew?.sollMinutes ?? null,
    kind: "empty",
    absenceDays: null,
    absenceLabel: null,
    note: "",
  };

  if (office?.intervals?.length) {
    Object.assign(result, reconcileOfficeDay(office, crew));
  } else {
    Object.assign(result, reconcileRemoteDay(office, crew));
  }

  result.note = generateNote(result);
  return result;
}

export function reconcile(officeDoc, crewDoc) {
  const officeByIso = new Map((officeDoc.days || []).map((d) => [d.iso, d]));
  const crewByIso = new Map((crewDoc.days || []).map((d) => [d.iso, d]));
  const isos = new Set([...officeByIso.keys(), ...crewByIso.keys()]);
  const days = [...isos].sort().map((iso) =>
    reconcileDay(officeByIso.get(iso) || null, crewByIso.get(iso) || null),
  );

  const totals = days.reduce(
    (acc, day) => {
      acc.officeIst += day.office?.istMinutes || 0;
      acc.crewIst += day.crew?.istMinutes || 0;
      acc.reconciledIst += day.reconciledIstMinutes || 0;
      acc.officeSoll += day.office?.sollMinutes || 0;
      return acc;
    },
    { officeIst: 0, crewIst: 0, reconciledIst: 0, officeSoll: 0 },
  );

  return {
    officeTitle: officeDoc.title || null,
    crewRange: crewDoc.range || null,
    totals,
    days,
  };
}
