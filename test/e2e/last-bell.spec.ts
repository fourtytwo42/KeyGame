import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home communicates Closing Print in one screen", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /the last caller keeps the bell/i }),
  ).toBeVisible();
  await expect(page.getByText(/Pick a stock. Pay \$1/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "WATCH ROUND 4663" }),
  ).toBeVisible();
});

test("real devnet starter ticker is the first paid claim", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await page.goto("/play/4663");
  await expect(page.getByText(/ANVIL · CHAIN 31337/)).toBeVisible();
  if (
    await page
      .getByRole("button", { name: /ENTER WITH AAPL · \$1/i })
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole("button", { name: /AAPL.*FLAT/i }).click();
    await page.getByRole("button", { name: /ENTER WITH AAPL · \$1/i }).click();
    await expect(page.getByText(/PRODUCER PASS/i).first()).toBeVisible();
    await expect(page.getByText("$99").first()).toBeVisible();
  }
});

test("live studio exposes four market-labeled one-tap claims", async ({
  page,
}) => {
  await page.goto("/play/4663");
  const entryAction = page.getByRole("button", {
    name: /ENTER WITH NVDA · \$1/i,
  });
  if (await entryAction.isVisible().catch(() => false)) {
    await entryAction.click({ force: true });
  }
  await expect(
    page.locator(".railLabel:visible").filter({ hasText: "THE CLOSING PRINT" }),
  ).toBeVisible();
  for (const ticker of ["NVDA", "TSLA", "AAPL", "SPY"]) {
    await expect(
      page.getByRole("button", {
        name: new RegExp(`PUT ${ticker} ON AIR · \\$1`, "i"),
      }),
    ).toBeVisible();
  }
  await expect(page.getByText(/GREEN · 1.25×/).first()).toBeVisible();
  await expect(page.getByText(/RED · 0.75×/).first()).toBeVisible();
});

test("wallet panel exposes major connector paths and config state", async ({
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
});

test("all trust and proof routes render without a wallet", async ({ page }) => {
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
});

test("desktop studio fits entirely inside the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await page.goto("/play/4663?scenario=entry");
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerHeight,
    page: document.documentElement.scrollHeight,
    footerDisplay: getComputedStyle(
      document.querySelector(".stationFooter") as HTMLElement,
    ).display,
    arenaBottom: document
      .querySelector(".broadcastArena")
      ?.getBoundingClientRect().bottom,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.arenaBottom ?? Infinity).toBeLessThanOrEqual(
    dimensions.viewport,
  );
  expect(dimensions.footerDisplay).toBe("none");
});
