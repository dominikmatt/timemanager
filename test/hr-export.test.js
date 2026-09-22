import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { buildHrRow, hrToCsv } from "../src/hr-export.js";
import { hrToXlsxBuffer } from "../src/hr-xlsx.js";
import { reconcileDay } from "../src/reconcile.js";
import { parseTimeToMinutes } from "../src/time-utils.js";

function t(value) {
  return parseTimeToMinutes(value);
}

function pairText(row) {
  return row.pairs.map((pair) => `${pair.kommen}–${pair.gehen}${pair.extra ? " +" : ""}`);
}

describe("hr export", () => {
  it("keeps office punches and adds extra time as further Kommen/Gehen pairs", () => {
    const day = reconcileDay(
      {
        iso: "2026-08-04",
        weekday: "Di",
        punches: [t("07:44"), t("11:47"), t("12:15"), t("16:01")],
        intervals: [
          { start: t("07:44"), end: t("11:47"), type: "office" },
          { start: t("12:15"), end: t("16:01"), type: "office" },
        ],
        istMinutes: t("7:34"),
        sollMinutes: t("8:17"),
        dayModel: "55",
      },
      {
        iso: "2026-08-04",
        intervals: [{ start: t("06:45"), end: t("17:00") }],
        pauseMinutes: 75,
        istMinutes: 9 * 60,
        comment: "",
        absence: "",
      },
    );
    const row = buildHrRow(day);
    assert.deepEqual(pairText(row), ["06:45–07:29 +", "07:44–11:47", "12:15–16:01", "16:33–17:00 +"]);
    assert.equal(row.pairs[0].label, "Auswärts");
    assert.equal(row.pairs[3].label, "Auswärts nach Büro");
    assert.equal(row.ist, "9:00");
    assert.equal(row.soll, "8:17");
    assert.equal(row.puff, "+0:43");
    assert.equal(row.puffMinutes, 43);
    assert.equal(row.needsBooking, true);

    const csv = hrToCsv({ legend: "Legende", rows: [row] });
    assert.match(csv, /Kommen;Gehen;Art;IST;SOLL;Puff/);
    assert.match(csv, /06:45;07:29;Auswärts;9:00;8:17;\+0:43/);
    assert.match(csv, /07:44;11:47;Büro;9:00;8:17;\+0:43/);
    assert.match(csv, /16:33;17:00;Auswärts nach Büro/);
  });

  it("lists 24.08 extra time as Kommen/Gehen around the office stamps", () => {
    const row = buildHrRow(
      reconcileDay(
        {
          iso: "2026-08-24",
          weekday: "Mo",
          punches: [t("07:44"), t("11:47"), t("12:13"), t("16:29")],
          intervals: [
            { start: t("07:44"), end: t("11:47"), type: "office" },
            { start: t("12:13"), end: t("16:29"), type: "office" },
          ],
          istMinutes: t("8:02"),
          sollMinutes: t("8:17"),
          dayModel: "55",
        },
        {
          iso: "2026-08-24",
          intervals: [
            { start: t("06:45"), end: t("07:30") },
            { start: t("07:45"), end: t("11:45") },
            { start: t("12:15"), end: t("16:30") },
            { start: t("17:00"), end: t("17:30") },
          ],
          pauseMinutes: 0,
          istMinutes: t("9:30"),
          comment: "",
          absence: "",
        },
      ),
    );
    assert.deepEqual(pairText(row), [
      "06:45–07:30 +",
      "07:44–11:47",
      "12:13–16:29",
      "16:29–16:30 +",
      "17:00–17:30 +",
    ]);
    assert.equal(row.ist, "9:35");
    assert.equal(row.soll, "8:17");
    assert.equal(row.puff, "+1:18");
  });

  it("asks HR to book sickness when the PDF has no punches", () => {
    const day = reconcileDay(
      {
        iso: "2026-08-03",
        weekday: "Mo",
        punches: [],
        intervals: [],
        istMinutes: null,
        sollMinutes: t("8:17"),
        dayModel: "55",
      },
      {
        iso: "2026-08-03",
        intervals: [],
        pauseMinutes: 0,
        istMinutes: Math.round(7.7 * 60),
        comment: "",
        absence: "Krankheit (1)",
      },
    );
    const row = buildHrRow(day);
    assert.deepEqual(row.pairs, []);
    assert.equal(row.absence, "Krankheit");
    assert.equal(row.ist, "8:17");
    assert.equal(row.soll, "8:17");
    assert.equal(row.puff, "0:00");
    assert.equal(row.needsBooking, true);
  });

  it("asks HR to book Urlaub and Freizeitausgleich as full days", () => {
    const holiday = buildHrRow(
      reconcileDay(
        {
          iso: "2026-08-21",
          weekday: "Fr",
          punches: [],
          intervals: [],
          istMinutes: null,
          sollMinutes: t("5:22"),
          dayModel: "56",
        },
        {
          iso: "2026-08-21",
          intervals: [],
          pauseMinutes: 0,
          istMinutes: 0,
          sollMinutes: 462,
          comment: "",
          absence: "Urlaub (1)",
        },
      ),
    );
    assert.equal(holiday.ist, "5:22");
    assert.equal(holiday.soll, "5:22");
    assert.equal(holiday.puff, "0:00");
    assert.equal(holiday.absence, "Urlaub");
    assert.deepEqual(holiday.pairs, []);

    const compensation = buildHrRow(
      reconcileDay(
        {
          iso: "2026-08-18",
          weekday: "Di",
          punches: [],
          intervals: [],
          istMinutes: null,
          sollMinutes: t("8:17"),
          dayModel: "55",
        },
        {
          iso: "2026-08-18",
          intervals: [],
          pauseMinutes: 0,
          istMinutes: 0,
          sollMinutes: 462,
          comment: "",
          absence: "Freizeitausgleich (1)",
        },
      ),
    );
    assert.equal(compensation.ist, "8:17");
    assert.equal(compensation.soll, "8:17");
    assert.equal(compensation.absence, "Freizeitausgleich");
    assert.equal(compensation.puff, "0:00");
  });

  it("books homeoffice as two Kommen/Gehen blocks with the pause as the gap", () => {
    const row = buildHrRow(
      reconcileDay(
        {
          iso: "2026-08-12",
          weekday: "Mi",
          punches: [],
          intervals: [],
          istMinutes: null,
          sollMinutes: t("8:17"),
          dayModel: "55",
        },
        {
          iso: "2026-08-12",
          intervals: [{ start: t("07:15"), end: t("17:30") }],
          pauseMinutes: 75,
          istMinutes: 9 * 60,
          comment: "homeoffice",
          absence: "",
        },
      ),
    );
    assert.deepEqual(pairText(row), ["07:15–12:00 +", "13:15–17:30 +"]);
    assert.equal(row.pairs[0].label, "Homeoffice");
    assert.equal(row.ist, "9:00");
    assert.equal(row.puff, "+0:43");
    assert.equal(row.absence, "");
  });

  it("writes the booking sheet with one Kommen/Gehen row per pair", async () => {
    const row = buildHrRow(
      reconcileDay(
        {
          iso: "2026-08-24",
          weekday: "Mo",
          punches: [t("07:44"), t("11:47"), t("12:13"), t("16:29")],
          intervals: [
            { start: t("07:44"), end: t("11:47"), type: "office" },
            { start: t("12:13"), end: t("16:29"), type: "office" },
          ],
          istMinutes: t("8:02"),
          sollMinutes: t("8:17"),
          dayModel: "55",
        },
        {
          iso: "2026-08-24",
          intervals: [
            { start: t("06:45"), end: t("07:30") },
            { start: t("07:45"), end: t("11:45") },
            { start: t("12:15"), end: t("16:30") },
            { start: t("17:00"), end: t("17:30") },
          ],
          pauseMinutes: 0,
          istMinutes: t("9:30"),
          comment: "",
          absence: "",
        },
      ),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await hrToXlsxBuffer({ title: "Buchungen", legend: "Legende", rows: [row] }));
    const sheet = workbook.getWorksheet("Buchungen");
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => sheet.getRow(3).getCell(col).value),
      ["Datum", "WT", "Abwesenheit", "Kommen", "Gehen", "Art", "IST", "SOLL", "Puff"],
    );
    assert.equal(sheet.getRow(4).getCell(4).value, "06:45");
    assert.equal(sheet.getRow(4).getCell(5).value, "07:30");
    assert.equal(sheet.getRow(4).getCell(6).value, "Auswärts");
    assert.equal(sheet.getRow(4).getCell(7).value, "9:35");
    assert.equal(sheet.getRow(4).getCell(8).value, "8:17");
    assert.equal(sheet.getRow(4).getCell(9).value, "+1:18");
    assert.equal(sheet.getRow(5).getCell(4).value, "07:44");
    assert.equal(sheet.getRow(5).getCell(5).value, "11:47");
    assert.equal(sheet.getRow(5).getCell(6).value, "Büro");
    assert.equal(sheet.getRow(8).getCell(4).value, "17:00");
    assert.equal(sheet.getRow(8).getCell(5).value, "17:30");
    assert.equal(sheet.getRow(4).getCell(4).fill.fgColor.argb, "FFD6EAF8");
    assert.equal(sheet.getRow(5).getCell(4).fill?.fgColor?.argb, undefined);
  });
});
