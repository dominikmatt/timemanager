import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcile, reconcileDay } from "../src/reconcile.js";
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
    assert.equal(day.reconciledIstMinutes, 9 * 60);
    assert.equal(Math.abs(day.reconciledIstMinutes - crew.istMinutes) <= 5, true);
    assert.equal(day.diffMinutes, t("0:43"));
    assert.equal(day.freeMinutes, 28 + 15 + 32);
    assert.match(day.note, /unverändert/);
    assert.match(day.note, /11:47–12:15 \(28 Min\)/);
    assert.doesNotMatch(day.note, /Mittag 30/);
    assert.match(day.note, /07:29–07:44/);
    assert.match(day.note, /06:45–07:29/);
    assert.match(day.note, /16:33–17:00/);
  });

  it("credits Krankheit as weekday Soll instead of Crewmeister Ist", () => {
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
    assert.equal(day.kind, "sickness");
    assert.equal(day.reconciledIntervals.length, 0);
    assert.equal(day.reconciledIstMinutes, t("8:17"));
    assert.equal(day.reconciledIstMinutes, day.officeSollMinutes);
    assert.equal(day.diffMinutes, 0);
    assert.match(day.note, /Krankheit/);
    assert.match(day.note, /Ist auf Soll/);

    const friday = reconcileDay(
      {
        iso: "2026-08-07",
        weekday: "Fr",
        punches: [],
        intervals: [],
        istMinutes: null,
        sollMinutes: t("5:22"),
        dayModel: "56",
      },
      {
        iso: "2026-08-07",
        intervals: [],
        pauseMinutes: 0,
        istMinutes: Math.round(7.7 * 60),
        comment: "",
        absence: "Krankheit (1)",
      },
    );
    assert.equal(friday.reconciledIstMinutes, t("5:22"));
    assert.equal(friday.diffMinutes, 0);
  });

  it("uses weekday Soll even when files show a different target", () => {
    const monday = reconcileDay(
      {
        iso: "2026-08-03",
        weekday: "Mo",
        punches: [],
        intervals: [],
        istMinutes: null,
        sollMinutes: 0,
        dayModel: "55",
      },
      {
        iso: "2026-08-03",
        intervals: [{ start: t("07:15"), end: t("17:00") }],
        pauseMinutes: 45,
        istMinutes: 9 * 60,
        sollMinutes: Math.round(7.7 * 60),
        comment: "homeoffice",
        absence: "",
      },
    );
    const friday = reconcileDay(null, {
      iso: "2026-08-21",
      intervals: [],
      pauseMinutes: 0,
      istMinutes: 0,
      sollMinutes: Math.round(7.7 * 60),
      comment: "",
      absence: "Urlaub (1)",
    });
    assert.equal(monday.officeSollMinutes, t("8:17"));
    assert.equal(friday.officeSollMinutes, t("5:22"));
    assert.equal(friday.reconciledIstMinutes, t("5:22"));
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
    assert.equal(day.diffMinutes, 0);
    assert.equal(day.freeMinutes, 0);
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

  it("treats Zeitausgleich like Freizeitausgleich with weekday Soll", () => {
    const day = reconcileDay(
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
        comment: "",
        absence: "Zeitausgleich (1)",
      },
    );
    assert.equal(day.kind, "compensation");
    assert.equal(day.reconciledIstMinutes, t("8:17"));
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
    assert.deepEqual(
      day.reconciledIntervals.map((interval) => [interval.type, interval.start, interval.end]),
      [
        ["homeoffice", t("07:15"), t("12:00")],
        ["lunch", t("12:00"), t("13:15")],
        ["homeoffice", t("13:15"), t("17:30")],
      ],
    );
    assert.deepEqual(day.pauseSplit, {
      pause: 75,
      lunch: 75,
      morningFree: 0,
      eveningFree: 0,
    });
    assert.equal(day.lunchIntervals.length, 1);
    assert.equal(day.reconciledIstMinutes, 9 * 60);
    assert.equal(day.freeMinutes, 75);
    assert.match(day.note, /Homeoffice/);
    assert.match(day.note, /als Mittag gebucht/);
    assert.doesNotMatch(day.note, /Nachtrag/);
  });

  it("does not invent a Mittag when Crewmeister already has separate bookings", () => {
    const day = reconcileDay(
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
        intervals: [
          { start: t("07:15"), end: t("12:00") },
          { start: t("13:15"), end: t("17:30") },
        ],
        pauseMinutes: 75,
        istMinutes: 9 * 60,
        comment: "homeoffice",
        absence: "",
      },
    );
    assert.equal(day.lunchIntervals.length, 0);
    assert.equal(day.pauseSplit, null);
    assert.deepEqual(
      day.reconciledIntervals.map((interval) => interval.type),
      ["homeoffice", "homeoffice"],
    );
  });

  it("snaps Abgleich Ist to Crewmeister Ist when they differ by at most 5 minutes", () => {
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
      istMinutes: 9 * 60 + 3,
      comment: "",
      absence: "",
    };
    const day = reconcileDay(office, crew);
    assert.equal(day.reconciledIstMinutes, 9 * 60 + 3);
    assert.equal(day.warnings.length, 0);
  });
});

describe("reconcile", () => {
  it("fills every calendar day between the first and last source date", () => {
    const result = reconcile(
      {
        days: [
          {
            iso: "2026-07-03",
            weekday: "Fr",
            punches: [],
            intervals: [],
            istMinutes: null,
            sollMinutes: 0,
          },
        ],
      },
      {
        days: [
          {
            iso: "2026-07-06",
            intervals: [],
            pauseMinutes: 0,
            istMinutes: 0,
            absence: "Freizeitausgleich (1)",
          },
        ],
      },
    );
    assert.deepEqual(
      result.days.map((day) => day.iso),
      ["2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06"],
    );
    assert.equal(result.days[3].kind, "compensation");
    assert.match(result.days[1].note, /Wochenende/);
    assert.equal(result.days[1].officeSollMinutes, 0);
  });
});
