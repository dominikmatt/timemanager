import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import {
  germanDateToIso,
  intervalDuration,
  parseTimeToMinutes,
  punchesToIntervals,
} from "./time-utils.js";

globalThis.pdfjsWorker = pdfjsWorker;

const Y_CLUSTER = 8;

function band(x) {
  if (x < 55) return "date";
  if (x < 82) return "weekday";
  if (x < 108) return "k1";
  if (x < 132) return "g1";
  if (x < 156) return "k2";
  if (x < 180) return "g2";
  if (x < 236) return "model";
  if (x < 262) return "ist";
  if (x < 290) return "soll";
  if (x < 325) return "puffer";
  return "other";
}

function clusterRows(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.anchorY - item.y) <= Y_CLUSTER) {
      last.items.push(item);
    } else {
      rows.push({ anchorY: item.y, items: [item] });
    }
  }
  return rows;
}

async function extractItems(buffer) {
  const data = Uint8Array.from(buffer);
  const pdf = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableWorker: true,
    verbosity: 0,
  }).promise;

  const items = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const str = (item.str || "").trim();
      if (!str) continue;
      items.push({
        str,
        x: item.transform[4],
        y: item.transform[5],
      });
    }
  }
  return items;
}

function parseDayRow(rowItems) {
  const byBand = {};
  for (const item of rowItems) {
    const key = band(item.x);
    if (!byBand[key]) byBand[key] = [];
    byBand[key].push(item);
  }

  const dateText = (byBand.date || []).map((i) => i.str).join(" ");
  const iso = germanDateToIso(dateText);
  if (!iso) return null;

  const weekday = (byBand.weekday || []).map((i) => i.str).join("") || null;
  const punchFields = ["k1", "g1", "k2", "g2"];
  const punches = [];
  for (const field of punchFields) {
    const text = (byBand[field] || []).map((i) => i.str).join("");
    const minutes = parseTimeToMinutes(text);
    if (minutes != null) punches.push(minutes);
  }

  const model = (byBand.model || []).map((i) => i.str).join(" ").trim();
  const ist = parseTimeToMinutes((byBand.ist || []).map((i) => i.str).join(""));
  const soll = parseTimeToMinutes((byBand.soll || []).map((i) => i.str).join(""));
  const puffer = parseTimeToMinutes((byBand.puffer || []).map((i) => i.str).join(""));

  return {
    iso,
    weekday,
    punches,
    intervals: punchesToIntervals(punches),
    istMinutes: ist,
    sollMinutes: soll,
    pufferMinutes: puffer,
    dayModel: model || null,
    source: "office",
    mergedContinuation: false,
  };
}

function collapseConsecutivePunches(punches) {
  const out = [];
  for (const time of punches || []) {
    if (time == null) continue;
    if (out.length && out[out.length - 1] === time) continue;
    out.push(time);
  }
  return out;
}

export function mergeOfficeDays(days) {
  const byIso = new Map();
  for (const day of days || []) {
    const existing = byIso.get(day.iso);
    if (!existing) {
      byIso.set(day.iso, {
        ...day,
        punches: [...(day.punches || [])],
        mergedContinuation: false,
      });
      continue;
    }
    existing.punches.push(...(day.punches || []));
    existing.mergedContinuation = true;
    if (!existing.weekday && day.weekday) existing.weekday = day.weekday;
    if (!existing.dayModel && day.dayModel) existing.dayModel = day.dayModel;
    if (existing.istMinutes == null && day.istMinutes != null) existing.istMinutes = day.istMinutes;
    if (existing.sollMinutes == null && day.sollMinutes != null) existing.sollMinutes = day.sollMinutes;
    if (existing.pufferMinutes == null && day.pufferMinutes != null) existing.pufferMinutes = day.pufferMinutes;
  }

  return [...byIso.values()]
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .map((day) => {
      const punches = collapseConsecutivePunches(day.punches).sort((a, b) => a - b);
      const intervals = punchesToIntervals(punches);
      const istMinutes = day.mergedContinuation
        ? intervals.reduce((sum, interval) => sum + intervalDuration(interval), 0)
        : day.istMinutes;
      return { ...day, punches, intervals, istMinutes };
    });
}

export async function parseOfficePdf(buffer) {
  const items = await extractItems(buffer);
  const rows = clusterRows(items);
  const days = [];
  let title = null;
  for (const row of rows) {
    const joined = row.items.map((i) => i.str).join(" ");
    if (!title && /Mitarbeiteruebersicht|Mitarbeiterübersicht/i.test(joined)) {
      title = joined;
    }
    const day = parseDayRow(row.items);
    if (day) days.push(day);
  }
  return { title, days: mergeOfficeDays(days) };
}
