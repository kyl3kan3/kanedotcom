import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFactualFamilyChapter,
  familyHolidayForCaptureDate,
  familyHolidaysForCaptureDates,
} from "../lib/family-holidays";

test("Father's Day follows the third Sunday in June", () => {
  const examples = [
    ["2025-06-15T17:00:00Z", "2025-06-15"],
    ["2026-06-21T17:00:00Z", "2026-06-21"],
    ["2027-06-20T17:00:00Z", "2027-06-20"],
  ] as const;

  for (const [capturedAt, dateKey] of examples) {
    const holiday = familyHolidayForCaptureDate(capturedAt);
    assert.equal(holiday?.id, "fathers-day");
    assert.equal(holiday?.dateKey, dateKey);
    assert.equal(holiday?.matchKind, "exact");
  }
});

test("a June 20-21, 2026 group is labeled Father's Day weekend", () => {
  const chapter = buildFactualFamilyChapter([
    { kind: "image", capturedAt: "2026-06-21T00:09:43Z" },
    { kind: "image", capturedAt: "2026-06-21T17:09:56Z" },
    { kind: "video", capturedAt: "2026-06-21T17:20:00Z" },
  ]);

  assert.equal(chapter.title, "Father's Day Weekend");
  assert.equal(chapter.holidays[0]?.id, "fathers-day");
  assert.equal(chapter.holidays[0]?.matchKind, "weekend");
  assert.match(chapter.summary, /June 20.+June 21|June 20.+21/);
  assert.match(chapter.summary, /Father's Day Weekend/);
});

test("Fourth of July uses Chicago dates and a bounded weekend window", () => {
  const exact = familyHolidayForCaptureDate("2026-07-05T02:00:00Z");
  assert.equal(exact?.id, "fourth-of-july");
  assert.equal(exact?.matchKind, "exact");

  const nearby = familyHolidayForCaptureDate("2026-07-06T01:43:29Z");
  assert.equal(nearby?.id, "fourth-of-july");
  assert.equal(nearby?.matchKind, "weekend");
  assert.equal(nearby?.name, "Fourth of July Weekend");

  assert.equal(
    familyHolidayForCaptureDate("2026-07-06T05:00:00Z"),
    null,
  );

  assert.equal(
    familyHolidayForCaptureDate("2028-07-03T17:00:00Z"),
    null,
  );
  assert.equal(
    familyHolidayForCaptureDate("2028-07-05T17:00:00Z"),
    null,
  );
  assert.equal(
    familyHolidayForCaptureDate("2028-07-04T17:00:00Z")?.matchKind,
    "exact",
  );
});

test("holiday prose stays factual and broad ranges keep date-based titles", () => {
  const chapter = buildFactualFamilyChapter([
    { kind: "image", capturedAt: "2026-07-01T17:00:00Z" },
    { kind: "video", capturedAt: "2026-07-06T01:43:29Z" },
    { kind: "image", capturedAt: "2026-07-20T17:00:00Z" },
  ]);

  assert.doesNotMatch(chapter.title, /^Fourth of July/);
  assert.match(chapter.summary, /Fourth of July Weekend/);
  assert.doesNotMatch(
    chapter.summary,
    /likely|looks like|appears|uncertain|feels like|matching outfits/i,
  );
});

test("invalid and epoch-sentinel capture dates do not create holidays", () => {
  assert.equal(familyHolidayForCaptureDate(null), null);
  assert.equal(familyHolidayForCaptureDate("not-a-date"), null);
  assert.equal(familyHolidayForCaptureDate(new Date(0)), null);
  assert.deepEqual(
    familyHolidaysForCaptureDates([null, "not-a-date", new Date(0)]),
    [],
  );

  const chapter = buildFactualFamilyChapter([
    { kind: "image", capturedAt: new Date(0) },
  ]);
  assert.equal(chapter.title, "Family Memories");
  assert.equal(chapter.startAt, null);
  assert.equal(chapter.endAt, null);
});
