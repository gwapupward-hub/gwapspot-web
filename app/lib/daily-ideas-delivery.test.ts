import { describe, expect, it } from "vitest";
import { nextDailyIdeasDeliveryAt } from "./daily-ideas-delivery";

describe("nextDailyIdeasDeliveryAt", () => {
  it("finds the next 9 AM delivery in New York", () => {
    expect(
      nextDailyIdeasDeliveryAt(
        new Date("2026-08-16T12:30:00.000Z"),
        "America/New_York",
        9,
        "daily",
      ),
    ).toBe("2026-08-16T13:00:00.000Z");
  });

  it("skips weekends for weekday delivery", () => {
    expect(
      nextDailyIdeasDeliveryAt(
        new Date("2026-08-15T14:00:00.000Z"),
        "America/New_York",
        9,
        "weekdays",
      ),
    ).toBe("2026-08-17T13:00:00.000Z");
  });
});
