import { expect, test } from "@playwright/test";

const INTRO_SESSION_KEY = "gwap-premium-intro-seen-v2";

test("first visit exposes the intro action immediately", async ({ page }) => {
  await page.goto("/");

  const enter = page.getByRole("button", { name: "Enter Tha GwapSpot" });
  await expect(enter).toBeVisible({ timeout: 1_000 });

  await enter.click();
  await expect(page.getByRole("heading", { name: /Grind with/i })).toBeVisible();
});

test("homepage and roadmap use the same integration phase status", async ({ page }) => {
  await page.addInitScript((key) => {
    window.sessionStorage.setItem(key, "true");
  }, INTRO_SESSION_KEY);

  await page.goto("/");
  const homepageRoadmap = page.locator("#roadmap");
  await expect(homepageRoadmap.getByText("Integration", { exact: true })).toBeVisible();
  await expect(homepageRoadmap.getByText("Next", { exact: true })).toBeVisible();

  await page.goto("/roadmap");
  const integrationCard = page.locator("article.phase-card").filter({
    has: page.getByRole("heading", { name: "Integration" }),
  });
  await expect(integrationCard.getByText("Next", { exact: true })).toBeVisible();
});

test("mobile navigation remains usable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only behavior");

  await page.addInitScript((key) => {
    window.sessionStorage.setItem(key, "true");
  }, INTRO_SESSION_KEY);

  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Open menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  await expect(page.getByRole("link", { name: "Community", exact: true })).toBeVisible();
});
