export function detectAbsence(crew) {
  const text = `${crew?.absence || ""} ${crew?.comment || ""}`.trim();
  if (!text) return null;
  const kinds = [
    { type: "vacation", re: /urlaub/i, label: "Urlaub" },
    { type: "compensation", re: /freizeitausgleich/i, label: "Freizeitausgleich" },
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
  const soll = office?.sollMinutes || crew?.sollMinutes || crew?.istMinutes || 0;
  return Math.round(soll * days);
}
