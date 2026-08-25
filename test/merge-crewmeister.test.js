import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeCrewmeister } from "../src/parse-crewmeister.js";

describe("mergeCrewmeister", () => {
  it("joins days from several monthly files", () => {
    const merged = mergeCrewmeister([
      {
        days: [
          {
            iso: "2026-08-04",
            intervals: [{ start: 405, end: 1020 }],
            pauseMinutes: 75,
            istMinutes: 540,
            sollMinutes: 462,
            comment: "",
            absence: "",
          },
        ],
      },
      {
        days: [
          {
            iso: "2026-09-01",
            intervals: [{ start: 420, end: 990 }],
            pauseMinutes: 45,
            istMinutes: 480,
            sollMinutes: 462,
            comment: "homeoffice",
            absence: "",
          },
        ],
      },
    ]);
    assert.deepEqual(
      merged.days.map((d) => d.iso),
      ["2026-08-04", "2026-09-01"],
    );
    assert.equal(merged.range.from, "2026-08-04");
    assert.equal(merged.range.to, "2026-09-01");
    assert.equal(merged.days[1].comment, "homeoffice");
  });

  it("dedupes the same interval if two files overlap a day", () => {
    const merged = mergeCrewmeister([
      {
        days: [
          {
            iso: "2026-08-04",
            intervals: [{ start: 405, end: 1020 }],
            pauseMinutes: 75,
            istMinutes: 540,
            sollMinutes: 462,
            comment: "",
            absence: "",
          },
        ],
      },
      {
        days: [
          {
            iso: "2026-08-04",
            intervals: [
              { start: 405, end: 1020 },
              { start: 1080, end: 1140 },
            ],
            pauseMinutes: 75,
            istMinutes: 600,
            sollMinutes: 462,
            comment: "homeoffice",
            absence: "",
          },
        ],
      },
    ]);
    assert.equal(merged.days.length, 1);
    assert.deepEqual(merged.days[0].intervals, [
      { start: 405, end: 1020 },
      { start: 1080, end: 1140 },
    ]);
    assert.equal(merged.days[0].istMinutes, 600);
    assert.equal(merged.days[0].comment, "homeoffice");
  });
});
