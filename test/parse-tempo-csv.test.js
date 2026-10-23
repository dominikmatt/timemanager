import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { compareBuffers, parseTimeBuffer } from "../src/compare.js";
import { parseTempoCsv } from "../src/parse-tempo-csv.js";
import { minutesToClock } from "../src/time-utils.js";

const sample = `Work Item Key,Work Item summary,Logged Hours,Logged Seconds,Work date,Work Description
ORG-546,"Emails, Updates",0.75,2700,2026-09-21 06:45,email
DD-3283,Health check,0.75,2700,2026-09-21 07:45,review
DD-5112,SSR,0.5,1800,2026-09-21 08:30,review
DD-1,Late,1.5,5400,2026-09-21 23:30,deploy
DD-2,Home,2,7200,2026-09-22 08:00,homeoffice
`;

describe("parseTempoCsv", () => {
  it("turns each worklog into a block and joins blocks that touch", () => {
    const doc = parseTempoCsv(sample);
    const day = doc.days.find((item) => item.iso === "2026-09-21");
    assert.deepEqual(
      day.intervals.map((item) => [minutesToClock(item.start), minutesToClock(item.end)]),
      [
        ["06:45", "07:30"],
        ["07:45", "09:00"],
        ["23:30", "24:00"],
      ],
    );
    assert.equal(day.istMinutes, 45 + 45 + 30 + 30);
    const next = doc.days.find((item) => item.iso === "2026-09-22");
    assert.deepEqual(
      next.intervals.map((item) => [minutesToClock(item.start), minutesToClock(item.end)]),
      [
        ["00:00", "01:00"],
        ["08:00", "10:00"],
      ],
    );
    assert.equal(next.comment, "homeoffice");
    assert.equal(doc.range.from, "2026-09-21");
    assert.equal(doc.range.to, "2026-09-22");
  });

  it("reads the Tempo logged-time export", async () => {
    const buffer = await readFile("/home/dominik/Downloads/Report_21_Sep_26_20_Oct_26_Raw_Data_Logged_Time.csv");
    const doc = await parseTimeBuffer(buffer);
    assert.equal(doc.source, "tempo");
    assert.equal(doc.range.from, "2026-09-21");
    assert.equal(doc.range.to, "2026-10-20");
    for (const iso of ["2026-09-30", "2026-10-01", "2026-10-02"]) {
      const sick = doc.days.find((item) => item.iso === iso);
      assert.equal(sick.absence, "Krankheit (1)");
      assert.deepEqual(sick.intervals, []);
    }
    const day = doc.days.find((item) => item.iso === "2026-09-21");
    assert.deepEqual(
      day.intervals.map((item) => [minutesToClock(item.start), minutesToClock(item.end)]),
      [
        ["06:45", "07:30"],
        ["07:45", "11:45"],
        ["12:15", "16:30"],
        ["17:00", "17:45"],
        ["19:45", "23:45"],
      ],
    );
  });

  it("books the Krankheit task as a sick day instead of worked time", async () => {
    const [pdf, csv] = await Promise.all([
      readFile("/home/dominik/Downloads/personTime001_DIGANDO dominik.pdf"),
      readFile("/home/dominik/Downloads/Report_21_Sep_26_20_Oct_26_Raw_Data_Logged_Time.csv"),
    ]);
    const result = await compareBuffers(pdf, csv);
    for (const [iso, soll] of [
      ["2026-09-30", "8:17"],
      ["2026-10-01", "8:17"],
      ["2026-10-02", "5:22"],
    ]) {
      const row = result.hr.rows.find((item) => item.iso === iso);
      assert.equal(row.absence, "Krankheit");
      assert.equal(row.art, "Krank");
      assert.deepEqual(row.pairs, []);
      assert.equal(row.ist, soll);
      assert.equal(row.soll, soll);
      assert.equal(row.puff, "0:00");
    }
    assert.equal(result.hr.summary.sick, "21:56");
    const worked = result.hr.rows.find((item) => item.iso === "2026-09-23");
    assert.equal(worked.absence, "");
    assert.ok(worked.pairs.every((pair) => pair.label === "Nachtrag"));
  });
});
