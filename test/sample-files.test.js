import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { compareBuffers } from "../src/compare.js";
import { parseTimeToMinutes } from "../src/time-utils.js";

const pdfPath = "/home/dominik/Downloads/Auswertung_2026.08.21 .pdf";
const julyPath = "/home/dominik/Downloads/Dominik_Matt_01.07.2026_-_31.07.2026.xlsx";
const augustPath = "/home/dominik/Downloads/Dominik_Matt_01.08.2026_-_31.08.2026.xlsx";

describe("sample files", () => {
  it("merges both Crewmeister months and keeps every calendar day", async () => {
    const [pdf, july, august] = await Promise.all([
      readFile(pdfPath),
      readFile(julyPath),
      readFile(augustPath),
    ]);
    const result = await compareBuffers(pdf, [july, august]);
    const byIso = Object.fromEntries(result.days.map((d) => [d.iso, d]));

    assert.equal(result.crewFiles, 2);
    assert.equal(result.crewRange.from, "2026-07-01");
    assert.equal(result.crewRange.to, "2026-08-31");
    assert.equal(result.days[0].iso, "2026-07-01");
    assert.equal(result.days.at(-1).iso, "2026-08-31");
    assert.equal(result.days.length, 62);
    assert.ok(byIso["2026-07-04"], "weekend 04.07 missing");
    assert.ok(byIso["2026-08-23"], "weekend 23.08 missing");
    assert.equal(byIso["2026-07-04"].weekday, "Sa");
    assert.equal(byIso["2026-07-04"].officeSollMinutes, 0);

    const compensation = byIso["2026-07-06"];
    assert.equal(compensation.kind, "compensation");
    assert.equal(compensation.reconciledIstMinutes, parseTimeToMinutes("8:17"));
    assert.equal(compensation.reconciledIstMinutes, compensation.officeSollMinutes);

    const holiday = byIso["2026-07-16"];
    assert.equal(holiday.kind, "vacation");
    assert.equal(holiday.reconciledIstMinutes, parseTimeToMinutes("8:17"));

    const fridayHoliday = byIso["2026-07-17"];
    assert.equal(fridayHoliday.kind, "vacation");
    assert.equal(fridayHoliday.reconciledIstMinutes, parseTimeToMinutes("5:22"));

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
    assert.ok(Math.abs(officeDay.reconciledIstMinutes - officeDay.crew.istMinutes) <= 5);
    assert.equal(officeDay.reconciledIstMinutes, parseTimeToMinutes("9:00"));
    assert.equal(hrRow.ist, "9:00");

    const sick = byIso["2026-08-03"];
    assert.match(sick.crew.absence, /Krankheit/);
    assert.equal(sick.office.intervals.length, 0);
    assert.match(sick.note, /Krankheit/);

    const home = byIso["2026-08-12"];
    assert.equal(home.office.intervals.length, 0);
    assert.equal(home.crew.comment, "homeoffice");
    assert.equal(home.crew.intervals.length, 1);
    assert.deepEqual(
      home.reconciledIntervals.map((interval) => interval.type),
      ["homeoffice", "lunch", "homeoffice"],
    );
    assert.equal(home.lunchIntervals[0].start, parseTimeToMinutes("12:00"));
    assert.equal(home.lunchIntervals[0].end, parseTimeToMinutes("13:15"));
    assert.equal(home.pauseSplit.lunch, 75);
    assert.equal(home.pauseSplit.morningFree, 0);
    assert.equal(home.pauseSplit.eveningFree, 0);

    const friday = byIso["2026-08-07"];
    assert.equal(friday.office.intervals.length, 0);
    assert.match(friday.crew.comment, /homeoffice/i);
  });
});
