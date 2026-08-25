import { parseOfficePdf } from "./parse-office-pdf.js";
import { parseCrewmeister } from "./parse-crewmeister.js";
import { reconcile } from "./reconcile.js";
import { buildHrExport } from "./hr-export.js";

export async function compareBuffers(pdfBuffer, xlsxBuffer) {
  const office = await parseOfficePdf(pdfBuffer);
  const crew = await parseCrewmeister(xlsxBuffer);
  if (!office.days.length) {
    throw new Error("Im PDF wurden keine Tageszeilen gefunden.");
  }
  if (!crew.days.length) {
    throw new Error("In der Crewmeister-Datei wurden keine Tage gefunden.");
  }
  const result = reconcile(office, crew);
  result.hr = buildHrExport(result);
  return result;
}
