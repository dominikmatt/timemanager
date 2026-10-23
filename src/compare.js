import { parseOfficePdf } from "./parse-office-pdf.js";
import { mergeCrewmeister, parseCrewmeister } from "./parse-crewmeister.js";
import { isTempoCsv, parseTempoCsv } from "./parse-tempo-csv.js";
import { reconcile } from "./reconcile.js";
import { buildHrExport } from "./hr-export.js";

function isZip(buffer) {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export async function parseTimeBuffer(buffer) {
  if (isZip(buffer)) return parseCrewmeister(buffer);
  if (isTempoCsv(buffer)) return parseTempoCsv(buffer);
  throw new Error("Datei ist weder eine Crewmeister-Excel noch eine Tempo-CSV (Logged Time).");
}

export async function compareBuffers(pdfBuffer, xlsxBuffers) {
  const buffers = (Array.isArray(xlsxBuffers) ? xlsxBuffers : [xlsxBuffers]).filter(Boolean);
  const office = await parseOfficePdf(pdfBuffer);
  const parsed = [];
  for (const buffer of buffers) {
    parsed.push(await parseTimeBuffer(buffer));
  }
  const crew = mergeCrewmeister(parsed);
  if (!office.days.length) {
    throw new Error("Im PDF wurden keine Tageszeilen gefunden.");
  }
  if (!crew.days.length) {
    throw new Error("In den Arbeitszeit-Dateien wurden keine Tage gefunden.");
  }
  const result = reconcile(office, crew);
  result.hr = buildHrExport(result);
  result.crewFiles = parsed.length;
  return result;
}
