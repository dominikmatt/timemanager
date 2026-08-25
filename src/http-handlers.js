import { compareBuffers } from "./compare.js";
import { parseMultipart, readBody } from "./multipart.js";

export function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export async function handleHrXlsx(req, res) {
  try {
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    if (!body?.hr?.rows) {
      json(res, 400, { error: "Kein Personal-Export vorhanden." });
      return;
    }
    const { hrToXlsxBuffer } = await import("./hr-xlsx.js");
    const buffer = await hrToXlsxBuffer(body.hr);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Personal_Buchungen.xlsx"',
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  } catch (error) {
    json(res, 400, { error: error.message || "Excel-Export fehlgeschlagen." });
  }
}

export async function handleCompare(req, res) {
  try {
    const body = await readBody(req);
    const files = parseMultipart(body, req.headers["content-type"]);
    const office = files.office;
    const crew = files.crewmeister;
    if (!office?.buffer?.length) {
      json(res, 400, { error: "Bitte das Büro-PDF hochladen." });
      return;
    }
    if (!crew?.buffer?.length) {
      json(res, 400, { error: "Bitte die Crewmeister-Excel-Datei hochladen." });
      return;
    }
    const result = await compareBuffers(office.buffer, crew.buffer);
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error.message || "Vergleich fehlgeschlagen." });
  }
}
