import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { mergeOfficeDays, parseOfficePdf } from "../src/parse-office-pdf.js";
import { parseTimeToMinutes } from "../src/time-utils.js";

function t(value) {
  return parseTimeToMinutes(value);
}

describe("mergeOfficeDays", () => {
  it("folds a continuation Kommen into Gehen on the same date", () => {
    const days = mergeOfficeDays([
      {
        iso: "2026-09-01",
        weekday: "Di",
        punches: [t("07:44"), t("11:38"), t("12:04")],
        intervals: [],
        istMinutes: t("3:46"),
        sollMinutes: t("8:17"),
        dayModel: "55",
      },
      {
        iso: "2026-09-01",
        weekday: "Di",
        punches: [t("16:30")],
        intervals: [],
        istMinutes: null,
        sollMinutes: null,
        dayModel: null,
      },
    ]);

    assert.equal(days.length, 1);
    assert.equal(days[0].mergedContinuation, true);
    assert.deepEqual(days[0].punches, [t("07:44"), t("11:38"), t("12:04"), t("16:30")]);
    assert.deepEqual(days[0].intervals, [
      { start: t("07:44"), end: t("11:38"), type: "office" },
      { start: t("12:04"), end: t("16:30"), type: "office" },
    ]);
    assert.equal(days[0].istMinutes, 234 + 266);
    assert.equal(days[0].sollMinutes, t("8:17"));
    assert.equal(days[0].dayModel, "55");
  });

  it("drops a duplicate time when the continuation repeats the last punch", () => {
    const days = mergeOfficeDays([
      {
        iso: "2026-09-14",
        weekday: "Mo",
        punches: [t("07:45"), t("11:45"), t("12:17")],
        intervals: [],
        istMinutes: t("7:31"),
        sollMinutes: t("8:17"),
        dayModel: "55",
      },
      {
        iso: "2026-09-14",
        weekday: "Mo",
        punches: [t("16:01"), t("16:01")],
        intervals: [],
        istMinutes: null,
        sollMinutes: null,
        dayModel: null,
      },
    ]);

    assert.equal(days.length, 1);
    assert.deepEqual(days[0].punches, [t("07:45"), t("11:45"), t("12:17"), t("16:01")]);
    assert.equal(days[0].intervals[1].end, t("16:01"));
  });
});

describe("parseOfficePdf", () => {
  it("merges 01.09 continuation Kommen 16:30 into Gehen", async () => {
    const pdf = await parseOfficePdf(await readFile("/home/dominik/Downloads/Auswertung_2026.09.21 .pdf"));
    const first = pdf.days.filter((day) => day.iso === "2026-09-01");
    assert.equal(first.length, 1);
    assert.deepEqual(
      first[0].punches,
      ["07:44", "11:38", "12:04", "16:30"].map(parseTimeToMinutes),
    );
    assert.equal(first[0].intervals[1].end, parseTimeToMinutes("16:30"));
    assert.equal(first[0].mergedContinuation, true);

    const second = pdf.days.find((day) => day.iso === "2026-09-02");
    assert.deepEqual(
      second.punches,
      ["08:22", "11:46", "12:09", "16:29"].map(parseTimeToMinutes),
    );
  });
});
