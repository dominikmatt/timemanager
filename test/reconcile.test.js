import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileDay } from "../src/reconcile.js";
import { parseTimeToMinutes } from "../src/time-utils.js";

function t(value) {
  return parseTimeToMinutes(value);
}

describe("reconcileDay", () => {
  it("keeps 04.08 office punches and adds clipped commute around free time", () => {
    const office = {
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
    };
    const crew = {
      iso: "2026-08-04",
      intervals: [{ start: t("06:45"), end: t("17:00") }],
      pauseMinutes: 75,
      istMinutes: 9 * 60,
      comment: "",
      absence: "",
    };

    const day = reconcileDay(office, crew);
    const byType = Object.fromEntries(
      day.reconciledIntervals.map((i) => [`${i.type}:${i.label || ""}`, i]),
    );

    assert.equal(day.office.intervals[0].start, t("07:44"));
    assert.equal(day.office.intervals[1].end, t("16:01"));
    assert.deepEqual(day.pauseSplit, {
      pause: 75,
      lunch: 28,
      morningFree: 15,
      eveningFree: 32,
    });
    assert.equal(byType["on_the_way:"].start, t("06:45"));
    assert.equal(byType["on_the_way:"].end, t("07:29"));
    assert.equal(byType["free:morning"].start, t("07:29"));
    assert.equal(byType["free:morning"].end, t("07:44"));
    assert.equal(byType["lunch:"].start, t("11:47"));
    assert.equal(byType["lunch:"].end, t("12:15"));
    assert.equal(byType["free:evening"].start, t("16:01"));
    assert.equal(byType["free:evening"].end, t("16:33"));
    assert.equal(byType["after_office:"].start, t("16:33"));
    assert.equal(byType["after_office:"].end, t("17:00"));
    assert.equal(day.reconciledIstMinutes, t("7:34") + 44 + 27);
    assert.match(day.note, /unverändert/);
    assert.match(day.note, /11:47–12:15 \(28 Min\)/);
    assert.doesNotMatch(day.note, /Mittag 30/);
    assert.match(day.note, /07:29–07:44/);
    assert.match(day.note, /06:45–07:29/);
    assert.match(day.note, /16:33–17:00/);
  });

  it("uses Crewmeister sickness when office has no punches", () => {
    const office = {
      iso: "2026-08-03",
      weekday: "Mo",
      punches: [],
      intervals: [],
      istMinutes: null,
      sollMinutes: t("8:17"),
      dayModel: "55",
    };
    const crew = {
      iso: "2026-08-03",
      intervals: [],
      pauseMinutes: 0,
      istMinutes: Math.round(7.7 * 60),
      comment: "",
      absence: "Krankheit (1)",
    };

    const day = reconcileDay(office, crew);
    assert.equal(day.reconciledIntervals.length, 0);
    assert.equal(day.reconciledIstMinutes, Math.round(7.7 * 60));
    assert.equal(day.office.intervals.length, 0);
    assert.match(day.note, /Krankheit/);
    assert.match(day.note, /nicht geändert/);
    assert.match(day.note, /KRK/);
  });

  it("credits a full Urlaub day so Ist equals office Soll", () => {
    const office = {
      iso: "2026-08-21",
      weekday: "Fr",
      punches: [],
      intervals: [],
      istMinutes: null,
      sollMinutes: t("5:22"),
      dayModel: "56",
    };
    const crew = {
      iso: "2026-08-21",
      intervals: [],
      pauseMinutes: 0,
      istMinutes: 0,
      sollMinutes: Math.round(7.7 * 60),
      comment: "",
      absence: "Urlaub (1)",
    };
    const day = reconcileDay(office, crew);
    assert.equal(day.kind, "vacation");
    assert.equal(day.reconciledIstMinutes, t("5:22"));
    assert.equal(day.reconciledIstMinutes, day.officeSollMinutes);
    assert.match(day.note, /Urlaub/);
    assert.match(day.note, /Ist auf Soll/);
  });

  it("credits Freizeitausgleich as one compensatory day matching Soll", () => {
    const office = {
      iso: "2026-08-18",
      weekday: "Di",
      punches: [],
      intervals: [],
      istMinutes: null,
      sollMinutes: t("8:17"),
      dayModel: "55",
    };
    const crew = {
      iso: "2026-08-18",
      intervals: [],
      pauseMinutes: 0,
      istMinutes: 0,
      sollMinutes: Math.round(7.7 * 60),
      comment: "",
      absence: "Freizeitausgleich (1)",
    };
    const day = reconcileDay(office, crew);
    assert.equal(day.kind, "compensation");
    assert.equal(day.reconciledIstMinutes, t("8:17"));
    assert.equal(day.reconciledIstMinutes, day.officeSollMinutes);
    assert.match(day.note, /Freizeitausgleich/);
  });

  it("takes homeoffice from Crewmeister when office has no punches", () => {
    const office = {
      iso: "2026-08-12",
      weekday: "Mi",
      punches: [],
      intervals: [],
      istMinutes: null,
      sollMinutes: t("8:17"),
      dayModel: "55",
    };
    const crew = {
      iso: "2026-08-12",
      intervals: [{ start: t("07:15"), end: t("17:30") }],
      pauseMinutes: 75,
      istMinutes: 9 * 60,
      comment: "homeoffice",
      absence: "",
    };

    const day = reconcileDay(office, crew);
    assert.equal(day.reconciledIntervals.length, 1);
    assert.equal(day.reconciledIntervals[0].type, "homeoffice");
    assert.equal(day.reconciledIntervals[0].start, t("07:15"));
    assert.equal(day.reconciledIntervals[0].end, t("17:30"));
    assert.equal(day.reconciledIstMinutes, 9 * 60);
    assert.match(day.note, /Homeoffice/);
    assert.doesNotMatch(day.note, /Arbeitsweg/);
  });
});
