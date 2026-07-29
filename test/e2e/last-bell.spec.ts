import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home communicates the game in one screen", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /the last caller keeps the bell/i }),
  ).toBeVisible();
  await expect(page.getByText("Pick one ticker bag")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "WATCH ROUND 4663" }),
  ).toBeVisible();
});

test("real devnet round accepts a browser-driven call", async ({ page }) => {
  await page.goto("/play/4663");
  await expect(page.getByText(/ANVIL · CHAIN 31337/)).toBeVisible();
  const potBefore = await page.locator(".lowerThird strong").textContent();
  await page.getByRole("button", { name: "AAPL" }).click();
  await page.getByRole("button", { name: "APE FOR THE BELL · $1" }).click();
  await expect(
    page.getByRole("button", { name: "YOU HAVE THE BELL" }),
  ).toBeVisible();
  await expect(page.locator(".lowerThird strong")).not.toHaveText(
    potBefore ?? "",
  );
});

test("wallet panel exposes injected, MetaMask, Coinbase, Safe and config state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TUNE WALLET" }).click();
  await expect(
    page.getByRole("dialog", { name: "Wallet & session" }),
  ).toBeVisible();
  await expect(page.getByText("MetaMask", { exact: true })).toBeVisible();
  await expect(page.getByText(/Coinbase/i).first()).toBeVisible();
  await expect(page.getByText("Safe", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/WALLETCONNECT NEEDS A PROJECT ID/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close wallet panel" }).click();
});

test("all trust and social routes render without a wallet", async ({
  page,
}) => {
  for (const route of [
    "/rules",
    "/supported-assets",
    "/status",
    "/replay/4663",
    "/receipt/4663/demo",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  }
});

test("core pages have no serious axe violations", async ({ page }) => {
  for (const route of ["/", "/play/4663", "/rules"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
      `${route} accessibility violations`,
    ).toEqual([]);
  }
});

test("narrow layout has no horizontal overflow", async ({ page }) => {
  await page.goto("/play/4663");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(
    page.getByRole("button", { name: "APE FOR THE BELL · $1" }),
  ).toBeInViewport();
});
