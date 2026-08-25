import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  excelSerialToIso,
  minutesToDuration,
  parseTimeToMinutes,
  punchesToIntervals,
  splitPause,
  subtractIntervals,
  eachIso,
  weekdaySollMinutes,
} from "../src/time-utils.js";

describe("time-utils", () => {
  it("parses signed German durations", () => {
    assert.equal(parseTimeToMinutes("07:44"), 7 * 60 + 44);
    assert.equal(parseTimeToMinutes("7:34"), 7 * 60 + 34);
    assert.equal(parseTimeToMinutes("-8:17"), -(8 * 60 + 17));
    assert.equal(parseTimeToMinutes("-0:43"), -43);
    assert.equal(minutesToDuration(454), "7:34");
  });

  it("converts Excel serial 46237 to 2026-08-03", () => {
    assert.equal(excelSerialToIso(46237), "2026-08-03");
  });

  it("uses 8:17 Soll Mon–Thu and 5:22 on Friday", () => {
    assert.equal(weekdaySollMinutes("2026-08-03"), parseTimeToMinutes("8:17")); // Mo
    assert.equal(weekdaySollMinutes("2026-08-04"), parseTimeToMinutes("8:17")); // Di
    assert.equal(weekdaySollMinutes("2026-08-05"), parseTimeToMinutes("8:17")); // Mi
    assert.equal(weekdaySollMinutes("2026-08-06"), parseTimeToMinutes("8:17")); // Do
    assert.equal(weekdaySollMinutes("2026-08-07"), parseTimeToMinutes("5:22")); // Fr
    assert.equal(weekdaySollMinutes("2026-08-08"), 0); // Sa
    assert.equal(weekdaySollMinutes("2026-08-09"), 0); // So
  });

  it("lists every calendar day between two dates", () => {
    assert.deepEqual(eachIso("2026-08-07", "2026-08-10"), [
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
    assert.deepEqual(eachIso("2026-08-10", "2026-08-07"), []);
  });

  it("pairs punches into office intervals", () => {
    assert.deepEqual(punchesToIntervals([464, 707, 735, 961]), [
      { start: 464, end: 707, type: "office" },
      { start: 735, end: 961, type: "office" },
    ]);
  });

  it("uses the office lunch gap, then 15 min morning and the rest evening", () => {
    assert.deepEqual(splitPause(75, 28), {
      pause: 75,
      lunch: 28,
      morningFree: 15,
      eveningFree: 32,
    });
  });

  it("uses a shorter office lunch when pause is 0.75h", () => {
    assert.deepEqual(splitPause(45, 26), {
      pause: 45,
      lunch: 26,
      morningFree: 15,
      eveningFree: 4,
    });
  });

  it("subtracts blocked ranges from a source interval", () => {
    const leftover = subtractIntervals(
      [{ start: 405, end: 1020 }],
      [
        { start: 449, end: 464 },
        { start: 464, end: 707 },
        { start: 707, end: 735 },
        { start: 735, end: 961 },
        { start: 961, end: 991 },
      ],
    );
    assert.deepEqual(leftover, [
      { start: 405, end: 449 },
      { start: 991, end: 1020 },
    ]);
  });
});
