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
    assert.equal(row.ist, "7:34");
    assert.match(row.extraText, /06:45–07:29 Arbeitsweg/);
    assert.match(row.extraText, /16:33–17:00/);
    assert.doesNotMatch(row.extraText, /07:44/);
    assert.match(row.instruction, /nicht ändern/);
    assert.equal(row.needsBooking, true);

    const csv = hrToCsv({ legend: "Legende", rows: [row] });
    assert.match(csv, /07:44;11:47;12:15;16:01/);
    assert.match(csv, /Zusätzlich buchen/);
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
    assert.match(row.instruction, /Krankheit nachbuchen/);
  });
});
