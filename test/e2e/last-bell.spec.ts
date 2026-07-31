import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";

let cleanDevnetSnapshot: string;
const devnetRpc = process.env.PLAYWRIGHT_RPC_URL || "http://127.0.0.1:8545";

async function rpc(
  request: APIRequestContext,
  method: string,
  params: unknown[] = [],
) {
  const response = await request.post(devnetRpc, {
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  const payload = (await response.json()) as { result: string | boolean };
  return payload.result;
}

test.beforeEach(async ({ request }) => {
  cleanDevnetSnapshot = (await rpc(request, "evm_snapshot")) as string;
});

test.afterEach(async ({ request }) => {
  if (cleanDevnetSnapshot) {
    expect(await rpc(request, "evm_revert", [cleanDevnetSnapshot])).toBe(true);
  }
});

test("the main page opens directly into the game and archive", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/ANVIL · CHAIN 31337/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Historical runs" }),
  ).toBeAttached();
});

test("real devnet starter ticker is the first paid contribution", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/ANVIL · CHAIN 31337/)).toBeVisible();
  await page
    .locator(".amountPresets button")
    .filter({ hasText: /^\$1$/ })
    .click();
  const entryAction = page.getByRole("button", {
    name: /APE \$1 ON .*/i,
  });
  if (await entryAction.isVisible().catch(() => false)) {
    await expect(page.getByText("TIMER WAITS FOR YOU")).toBeVisible();
    await expect(page.locator(".entryClock")).toContainText("00:45");
    await expect(page.locator(".entryClock")).toContainText(
      "WAITING · FIRST $1 STARTS IT",
    );
    await expect(page.locator(".clockAssembly")).not.toBeVisible();
    await page.getByRole("button", { name: /AAPL/i }).first().click();
    await page.getByRole("button", { name: /APE \$1 ON AAPL/i }).click();
    await expect(page.locator(".clockAssembly")).toBeVisible();
    await expect(page.locator(".clockAssembly strong")).not.toContainText(
      "00:00",
    );
    await expect(page.getByText(/PRODUCER PASS/i).first()).toBeVisible();
    await expect(page.locator(".sessionPanel")).toContainText("SPENT");
    await expect(page.locator(".sessionPanel")).toContainText("$1");
    await expect(page.locator(".sessionPanel")).toContainText("MAX");
  }
});

test("live studio exposes four Stock Pot contribution controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".amountPresets button")
    .filter({ hasText: /^\$1$/ })
    .click();
  const entryAction = page.getByRole("button", {
    name: /APE \$1 ON NVDA/i,
  });
  if (await entryAction.isVisible().catch(() => false)) {
    await entryAction.click({ force: true });
  }
  await expect(
    page.locator(".railLabel:visible").filter({ hasText: "WINNING STOCK" }),
  ).toBeVisible();
  for (const ticker of ["NVDA", "TSLA", "AAPL", "SPY"]) {
    await expect(
      page.getByRole("button", {
        name: new RegExp(`APE \\$1 ON ${ticker}`, "i"),
      }),
    ).toBeVisible();
  }
  await expect(page.getByText(/30S HEAT/).first()).toBeAttached();
  await expect(page.getByText(/PTS/).first()).toBeAttached();
});

test("wallet panel exposes major connector paths and config state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "CONNECT WALLET" }).click();
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

test("projected rewards and earning units are immediately understandable", async ({
  page,
}) => {
  await page.goto("/?scenario=live");
  await page
    .locator(".amountPresets button")
    .filter({ hasText: /^\$1$/ })
    .click();
  const entryAction = page.getByRole("button", {
    name: /APE \$1 ON .*/i,
  });
  if (await entryAction.isVisible().catch(() => false)) {
    await entryAction.click();
    await expect(page.locator(".clockAssembly")).toBeVisible();
  }
  await expect(page.getByText("IF THE BELL RANG NOW")).toBeAttached();
  await expect(page.getByText(/FINAL CALLER · 50%/)).toBeAttached();
  await expect(page.getByText(/WINNING STOCK · 30%/).first()).toBeAttached();
  await expect(page.getByText(/LIFETIME POINTS · 10%/).first()).toBeAttached();
  if (
    await page
      .locator(".clockAssembly")
      .isVisible()
      .catch(() => false)
  ) {
    await expect(page.getByText(/PTS WON/)).toBeAttached();
  } else {
    await expect(page.getByText(/30S HEAT/).first()).toBeAttached();
    await expect(page.getByText(/FIRST \$1 STARTS IT/)).toBeAttached();
  }
  await expect(page.getByText(/FINAL AMOUNTS SETTLE ONCHAIN/)).toBeAttached();
});

test("financial and interactive labels respect the 11px floor", async ({
  page,
}) => {
  await page.goto("/");
  const tooSmall = await page.evaluate(() => {
    const selectors = [
      ".walletTrigger",
      ".primaryAction",
      ".secondaryAction",
      ".textButton",
      ".entryTerms",
      ".actionFinePrint",
      ".lowerThird",
      ".airtimeMetrics small",
      ".factionChoice small",
      ".apeButton small",
      ".sessionPanel dt",
      ".sessionPanel dd",
    ];
    return [...document.querySelectorAll<HTMLElement>(selectors.join(","))]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
      .map((element) => ({
        text: element.textContent?.trim().slice(0, 50),
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter((item) => item.size < 11);
  });
  expect(tooSmall).toEqual([]);
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
  for (const route of ["/", "/rules"]) {
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
  await page.goto("/");
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
  await page.goto("/?scenario=entry");
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerHeight,
    studioBottom: document.querySelector(".homeStudio")?.getBoundingClientRect()
      .bottom,
    arenaBottom: document
      .querySelector(".broadcastArena")
      ?.getBoundingClientRect().bottom,
  }));
  expect(dimensions.studioBottom ?? Infinity).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
  expect(dimensions.arenaBottom ?? Infinity).toBeLessThanOrEqual(
    dimensions.viewport,
  );

  const entryAction = page.locator(".entryDesk > .primaryAction");
  await expect(entryAction).toBeVisible();
  const actionBounds = await entryAction.boundingBox();
  expect(
    actionBounds ? actionBounds.y + actionBounds.height : Infinity,
  ).toBeLessThanOrEqual(dimensions.viewport);
});

test("mobile entry action fits the paid-flow viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.goto("/?scenario=entry");
  const entryAction = page.locator(".entryDesk > .primaryAction");
  await expect(entryAction).toBeVisible();
  const actionBounds = await entryAction.boundingBox();
  expect(
    actionBounds ? actionBounds.y + actionBounds.height : Infinity,
  ).toBeLessThanOrEqual(844);
});
