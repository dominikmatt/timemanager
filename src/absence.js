import { weekdaySollMinutes } from "./time-utils.js";

export function detectAbsence(crew) {
  const text = `${crew?.absence || ""} ${crew?.comment || ""}`.trim();
  if (!text) return null;
  const kinds = [
    { type: "vacation", re: /urlaub/i, label: "Urlaub" },
    { type: "compensation", re: /freizeitausgleich|zeitausgleich/i, label: "Freizeitausgleich" },
    { type: "sickness", re: /krankheit|\bkrank\b/i, label: "Krankheit" },
  ];
  for (const kind of kinds) {
    if (!kind.re.test(text)) continue;
    const daysMatch = /\((\d+(?:[.,]\d+)?)\)/.exec(text);
    const days = daysMatch ? Number(daysMatch[1].replace(",", ".")) : 1;
    return { type: kind.type, label: kind.label, days: Number.isFinite(days) ? days : 1 };
  }
  return null;
}

export function absenceCreditMinutes(office, crew, days = 1) {
  const iso = office?.iso || crew?.iso;
  const soll = weekdaySollMinutes(iso, office?.weekday);
  return Math.round(soll * days);
}
