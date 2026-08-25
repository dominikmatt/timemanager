import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { compareBuffers } from "../src/compare.js";
import { parseTimeToMinutes } from "../src/time-utils.js";

const pdfPath = "/home/dominik/Downloads/Auswertung_2026.08.21 .pdf";
const xlsxPath = "/home/dominik/Downloads/Dominik_Matt_01.08.2026_-_31.08.2026.xlsx";

describe("sample files", () => {
  it("reconciles the August 2026 office PDF with Crewmeister xlsx", async () => {
    const [pdf, xlsx] = await Promise.all([readFile(pdfPath), readFile(xlsxPath)]);
    const result = await compareBuffers(pdf, xlsx);
    const byIso = Object.fromEntries(result.days.map((d) => [d.iso, d]));

    const officeDay = byIso["2026-08-04"];
    assert.ok(officeDay, "04.08 missing");
    const hrRow = result.hr.rows.find((row) => row.iso === "2026-08-04");
    assert.equal(hrRow.k1, "07:44");
    assert.equal(hrRow.g2, "16:01");
    assert.doesNotMatch(hrRow.extraText, /07:44/);
    assert.match(hrRow.instruction, /nicht ändern/);
    assert.deepEqual(
      officeDay.office.punches,
      ["07:44", "11:47", "12:15", "16:01"].map(parseTimeToMinutes),
    );
    assert.equal(officeDay.crew.intervals[0].start, parseTimeToMinutes("06:45"));
    assert.equal(
      officeDay.reconciledIntervals.find((i) => i.type === "on_the_way").end,
      parseTimeToMinutes("07:29"),
    );
    assert.equal(
      officeDay.reconciledIntervals.find((i) => i.type === "after_office").start,
      parseTimeToMinutes("16:33"),
    );

    const sick = byIso["2026-08-03"];
    assert.match(sick.crew.absence, /Krankheit/);
    assert.equal(sick.office.intervals.length, 0);
    assert.match(sick.note, /Krankheit/);

    const home = byIso["2026-08-12"];
    assert.equal(home.office.intervals.length, 0);
    assert.equal(home.crew.comment, "homeoffice");
    assert.equal(home.reconciledIntervals[0].type, "homeoffice");

    const friday = byIso["2026-08-07"];
    assert.equal(friday.office.intervals.length, 0);
    assert.match(friday.crew.comment, /homeoffice/i);
  });
});
