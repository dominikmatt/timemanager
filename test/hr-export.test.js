import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHrRow, hrToCsv } from "../src/hr-export.js";
import { reconcileDay } from "../src/reconcile.js";
import { parseTimeToMinutes } from "../src/time-utils.js";

function t(value) {
  return parseTimeToMinutes(value);
}

describe("hr export", () => {
  it("puts PDF punches in K/G columns and only extras in the booking column", () => {
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
    assert.equal(row.k1, "07:44");
    assert.equal(row.g1, "11:47");
    assert.equal(row.k2, "12:15");
    assert.equal(row.g2, "16:01");
    assert.equal(row.ist, "9:00");
    assert.match(row.extraText, /06:45–07:29 Auswärts/);
    assert.match(row.extraText, /16:33–17:00/);
    assert.doesNotMatch(row.extraText, /07:44/);
    assert.equal(row.extraKind, "Auswärts, Auswärts nach Büro");
    assert.equal(row.extraDuration, "1:11");
    assert.equal(row.extraMinutes, 44 + 27);
    assert.match(row.instruction, /nicht ändern/);
    assert.equal(row.needsBooking, true);

    const csv = hrToCsv({ legend: "Legende", rows: [row] });
    assert.match(csv, /07:44;11:47;12:15;16:01/);
    assert.match(csv, /Art;Zusatzzeit;Zusätzlich buchen/);
    assert.match(csv, /1:11/);
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
    assert.equal(row.k1, "");
    assert.equal(row.g1, "");
    assert.match(row.extraText, /Krankheit/);
    assert.equal(row.extraKind, "Krankheit");
    assert.equal(row.extraDuration, "7:42");
    assert.match(row.instruction, /Krankheit nachbuchen/);
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
    assert.equal(holiday.extraKind, "Urlaub");
    assert.equal(holiday.extraDuration, "5:22");
    assert.match(holiday.extraText, /Urlaub 1 Tag/);
    assert.match(holiday.instruction, /Urlaub nachbuchen/);

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
    assert.equal(compensation.extraKind, "Freizeitausgleich");
    assert.equal(compensation.extraDuration, "8:17");
    assert.match(compensation.extraText, /Freizeitausgleich 1 Tag/);
  });
});
