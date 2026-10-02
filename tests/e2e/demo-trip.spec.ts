import { expect, test } from "@playwright/test";

/**
 * The seeded 13-person Bangalore demo trip (supabase/seed.sql) rendered by the
 * real app must match the calculation engine (tests/unit/bangalore-demo.test.ts).
 * Requires a local database reset with seed data: `npm run db:reset`.
 */
test("seeded Bangalore demo trip shows the expected balances and settlement", async ({ page }) => {
  await page.goto("/trip/BGLDEMX2");
  await expect(page.getByRole("heading", { name: "Bangalore Trip [DEMO]" })).toBeVisible();
  await page.getByRole("button", { name: "Join this trip" }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("₹21,360").first()).toBeVisible();

  await page.goto("/trip/BGLDEMX2/balances");
  const row = (name: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }) });
  await expect(row("Surya")).toContainText(/Should receive\s*₹12,146.92/);
  await expect(row("Gokul")).toContainText(/Should receive\s*₹946.92/);
  await expect(row("Priya")).toContainText(/Should receive\s*₹446.92/);
  await expect(row("Vikram")).toContainText(/Should pay\s*₹1,523.07/);
  await expect(row("Sneha")).toContainText(/Should pay\s*₹1,653.07/);
  await expect(
    page.getByRole("list", { name: "Suggested payments" }).getByRole("listitem"),
  ).toHaveCount(12);
  await expect(page.getByText(/all balances add up to ₹0/)).toBeVisible();

  await page.goto("/trip/BGLDEMX2/expenses/new");
  // The demo is a 3-day trip: the date picker lists each day.
  await expect(page.getByLabel("Date").locator("option")).toHaveCount(3);
});

test("no page scrolls sideways (mobile layout regression check)", async ({ page }) => {
  await page.goto("/trip/BGLDEMX2");
  const join = page.getByRole("button", { name: "Join this trip" });
  if (await join.isVisible()) await join.click();
  for (const path of [
    "",
    "/people",
    "/expenses",
    "/expenses/new",
    "/balances",
    "/summary",
    "/activity",
    "/settings",
  ]) {
    await page.goto(`/trip/BGLDEMX2${path}`);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path || "/"}`).toBeLessThanOrEqual(0);
  }
});
