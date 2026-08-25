import { parseOfficePdf } from "./parse-office-pdf.js";
import { mergeCrewmeister, parseCrewmeister } from "./parse-crewmeister.js";
import { reconcile } from "./reconcile.js";
import { buildHrExport } from "./hr-export.js";

export async function compareBuffers(pdfBuffer, xlsxBuffers) {
  const buffers = (Array.isArray(xlsxBuffers) ? xlsxBuffers : [xlsxBuffers]).filter(Boolean);
  const office = await parseOfficePdf(pdfBuffer);
  const parsed = [];
  for (const buffer of buffers) {
    parsed.push(await parseCrewmeister(buffer));
  }
  const crew = mergeCrewmeister(parsed);
  if (!office.days.length) {
    throw new Error("Im PDF wurden keine Tageszeilen gefunden.");
  }
  if (!crew.days.length) {
    throw new Error("In den Crewmeister-Dateien wurden keine Tage gefunden.");
  }
  const result = reconcile(office, crew);
  result.hr = buildHrExport(result);
  result.crewFiles = parsed.length;
  return result;
}
