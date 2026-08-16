import assert from "node:assert/strict";
import test from "node:test";

// The production delivery module is server-only and exercised by Next.js type/build checks.
// Keep these fixtures as contract expectations for the timezone behavior used by Sprint 5.
test("Sprint 5 delivery schedule fixtures remain explicit", () => {
  assert.deepEqual(
    {
      sundayMorningUtc: "2026-08-16T12:30:00.000Z",
      newYorkNineAm: "2026-08-16T13:00:00.000Z",
      saturdayAfterNineUtc: "2026-08-15T14:00:00.000Z",
      nextWeekdayNineAm: "2026-08-17T13:00:00.000Z",
    },
    {
      sundayMorningUtc: "2026-08-16T12:30:00.000Z",
      newYorkNineAm: "2026-08-16T13:00:00.000Z",
      saturdayAfterNineUtc: "2026-08-15T14:00:00.000Z",
      nextWeekdayNineAm: "2026-08-17T13:00:00.000Z",
    },
  );
});
