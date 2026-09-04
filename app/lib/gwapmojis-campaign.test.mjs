import assert from "node:assert/strict";
import test from "node:test";
import {
  GWAPMOJIS_CAMPAIGN,
  getGwapMojisCountdown,
} from "./gwapmojis-campaign.ts";

test("locks the GwapMojis free-drop deadline to October 12 in New York", () => {
  assert.equal(GWAPMOJIS_CAMPAIGN.timezone, "America/New_York");
  assert.equal(GWAPMOJIS_CAMPAIGN.expiresAt, "2026-10-12T23:59:59-04:00");
  assert.equal(
    new Date(GWAPMOJIS_CAMPAIGN.expiresAt).toISOString(),
    "2026-10-13T03:59:59.000Z",
  );
});

test("returns deterministic days, hours, minutes, and seconds before expiration", () => {
  const deadline = Date.parse(GWAPMOJIS_CAMPAIGN.expiresAt);
  const remaining = getGwapMojisCountdown(
    deadline - (((2 * 24 + 3) * 60 * 60 + 4 * 60 + 5) * 1_000),
  );

  assert.deepEqual(remaining, {
    days: 2,
    hours: 3,
    minutes: 4,
    seconds: 5,
    expired: false,
    totalMilliseconds: ((2 * 24 + 3) * 60 * 60 + 4 * 60 + 5) * 1_000,
  });
});

test("clamps the countdown to zero at and after expiration", () => {
  const deadline = Date.parse(GWAPMOJIS_CAMPAIGN.expiresAt);

  for (const now of [deadline, deadline + 60_000]) {
    assert.deepEqual(getGwapMojisCountdown(now), {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
      totalMilliseconds: 0,
    });
  }
});
