import { expect, test } from "@playwright/test";

async function enterSplash(page) {
  const enter = page.getByRole("button", { name: "Enter Tha GwapSpot" });
  await expect(enter).toBeVisible({ timeout: 1_000 });
  await enter.click();
  await expect(enter).toBeHidden({ timeout: 1_500 });
}

test("splash requires explicit entry and never auto-enters", async ({ page }) => {
  await page.goto("/");

  const enter = page.getByRole("button", { name: "Enter Tha GwapSpot" });
  await expect(enter).toBeVisible({ timeout: 1_000 });

  // This is intentionally longer than the previous auto-dismiss window.
  // The splash must remain until the visitor explicitly presses Enter.
  await page.waitForTimeout(2_500);
  await expect(enter).toBeVisible();
  await expect(page.locator(".premium-splash--intro")).not.toHaveClass(/is-leaving/);

  await enter.click();
  await expect(enter).toBeHidden({ timeout: 1_500 });
  await expect(page.getByRole("heading", { name: /Grind with/i })).toBeVisible();

  // A prior entry must not create a later automatic bypass.
  await page.reload();
  await expect(page.getByRole("button", { name: "Enter Tha GwapSpot" })).toBeVisible();
});

test("reduced motion still requires the Enter button", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const enter = page.getByRole("button", { name: "Enter Tha GwapSpot" });
  await expect(enter).toBeVisible({ timeout: 1_000 });
  await page.waitForTimeout(1_000);
  await expect(enter).toBeVisible();
});

test("homepage and roadmap use the same integration phase status", async ({ page }) => {
  await page.goto("/");
  await enterSplash(page);

  const homepageRoadmap = page.locator("#roadmap");
  await expect(homepageRoadmap.getByText("Integration", { exact: true })).toBeVisible();
  await expect(homepageRoadmap.getByText("Next", { exact: true })).toBeVisible();

  await page.goto("/roadmap");
  await enterSplash(page);

  const integrationCard = page.locator("article.phase-card").filter({
    has: page.getByRole("heading", { name: "Integration" }),
  });
  await expect(integrationCard.getByText("Next", { exact: true })).toBeVisible();
});

test("mobile navigation remains usable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only behavior");

  await page.goto("/");
  await enterSplash(page);

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  await expect(page.getByRole("link", { name: "Community", exact: true })).toBeVisible();
});
