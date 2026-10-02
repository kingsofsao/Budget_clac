import { expect, test, type Page } from "@playwright/test";

async function createTrip(page: Page, name: string, people: string[]) {
  await page.goto("/create");
  await page.getByLabel("Trip name").fill(name);
  await page.getByLabel("Your name").fill("Surya");
  await page.getByLabel("One-day outing").uncheck();
  await page.getByLabel("Start date").fill("2026-10-01");
  await page.getByLabel("End date").fill("2026-10-03");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL(/\/trip\/[A-HJ-NP-Z2-9]{8}\/people/);
  const base = new URL(page.url()).pathname.replace("/people", "");
  for (const n of people) {
    await page.getByLabel("Name", { exact: true }).fill(n);
    await page.getByLabel("Name", { exact: true }).press("Enter");
    await expect(page.getByRole("list").getByText(n, { exact: true })).toBeVisible();
  }
  return base;
}

async function startExpense(
  page: Page,
  base: string,
  amount: string,
  description: string,
  category: string,
) {
  await page.goto(`${base}/expenses/new`);
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Description").fill(description);
  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: category }) })
    .click();
}

const balanceRow = (page: Page, name: string) =>
  page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }) });

test("shares and percentage splits, then recording and undoing a payment", async ({ page }) => {
  const base = await createTrip(page, "Upgrade Trip", ["Nithish", "Gokul"]);

  await test.step("split by shares: 2 shares pay twice as much as 1", async () => {
    await startExpense(page, base, "3000", "Hotel", "Stay");
    await page.getByRole("radio", { name: "Shares" }).click();
    await page.getByRole("checkbox", { name: "Gokul" }).uncheck();
    await page.getByLabel("Surya's number of shares").fill("2");
    await expect(page.getByText("3 shares in total")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Surya" })).toContainText("₹2,000");
    await expect(page.getByRole("listitem").filter({ hasText: "Nithish" })).toContainText("₹1,000");
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
  });

  await test.step("split by percentage must total 100%", async () => {
    await startExpense(page, base, "1000", "Dinner", "Food");
    await page.getByLabel("Paid by").selectOption({ label: "Gokul" });
    await page.getByRole("radio", { name: "Percent" }).click();
    await expect(page.getByLabel("Surya's percentage")).toHaveValue("33.34");
    await page.getByLabel("Surya's percentage").fill("50");
    await page.getByLabel("Nithish's percentage").fill("30");
    await page.getByLabel("Gokul's percentage").fill("10");
    await expect(page.getByText("10% left")).toBeVisible();
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(
      page.getByText("Percentages must add up to 100% (currently 90%).").first(),
    ).toBeVisible();
    await page.getByLabel("Gokul's percentage").fill("20");
    await expect(page.getByText("Valid")).toBeVisible();
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
  });

  await test.step("balances: Surya +500, Nithish −1,300, Gokul +800", async () => {
    await page.goto(`${base}/balances`);
    await expect(balanceRow(page, "Surya")).toContainText(/Should receive\s*₹500/);
    await expect(balanceRow(page, "Nithish")).toContainText(/Should pay\s*₹1,300/);
    await expect(balanceRow(page, "Gokul")).toContainText(/Should receive\s*₹800/);
    const transfers = page.getByRole("list", { name: "Suggested payments" }).getByRole("listitem");
    await expect(transfers).toHaveCount(2);
  });

  await test.step("mark a suggested payment as paid", async () => {
    await page.getByRole("button", { name: "Mark Nithish → Gokul as paid" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("can't check that it happened");
    await expect(dialog.getByLabel("Amount")).toHaveValue("800");
    await dialog.getByLabel("Note").fill("UPI");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("list", { name: "Suggested payments" }).getByRole("listitem"),
    ).toHaveCount(1);
    await expect(balanceRow(page, "Gokul")).toContainText("Settled");
    await expect(balanceRow(page, "Nithish")).toContainText(/Should pay\s*₹500/);
    await expect(page.getByRole("list", { name: "Recorded payments" })).toContainText(
      "recorded, not verified",
    );
    await expect(page.getByText(/all balances add up to ₹0/)).toBeVisible();
  });

  await test.step("the overview shows my own settle-up", async () => {
    await page.goto(base);
    await expect(page.getByRole("region", { name: "Your settle-up" })).toContainText(
      /Nithish\s*pays you\s*₹500/,
    );
  });

  await test.step("deleting the payment restores the balance", async () => {
    await page.goto(`${base}/balances`);
    await page.getByRole("button", { name: /Delete payment: Nithish paid Gokul/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete payment" }).click();
    await expect(
      page.getByRole("list", { name: "Suggested payments" }).getByRole("listitem"),
    ).toHaveCount(2);
    await expect(balanceRow(page, "Gokul")).toContainText(/Should receive\s*₹800/);
  });

  await test.step("edit keeps the percentage inputs", async () => {
    await page.goto(`${base}/expenses`);
    await page.getByRole("link", { name: /Dinner/ }).click();
    await expect(page.getByText("By percentage")).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page.getByLabel("Surya's percentage")).toHaveValue("50");
    await expect(page.getByLabel("Gokul's percentage")).toHaveValue("20");
  });

  await test.step("duplicate an expense", async () => {
    await page.goto(`${base}/expenses`);
    await page.getByRole("link", { name: /Hotel/ }).click();
    await page.getByRole("link", { name: "Duplicate" }).click();
    await expect(page.getByRole("heading", { name: "Duplicate expense" })).toBeVisible();
    await expect(page.getByLabel("Amount")).toHaveValue("3000");
    await expect(page.getByLabel("Surya's number of shares")).toHaveValue("2");
    await page.getByLabel("Description").fill("Hotel night 2");
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
    await expect(page.getByRole("link", { name: /Hotel night 2/ })).toBeVisible();
  });
});

test("owner gets a new code; a member can leave", async ({ page, browser }) => {
  const base = await createTrip(page, "Code Trip", ["Nithish"]);
  const oldCode = base.split("/")[2]!;

  // A friend joins with the original link, then leaves.
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await friend.goto(base);
  await friend.getByRole("button", { name: "Join this trip" }).click();
  await friend.getByRole("button", { name: "Not now" }).click();
  await friend.goto(`${base}/settings`);
  await expect(
    friend.getByText("Only the person who created this trip can change its code."),
  ).toBeVisible();
  await friend.getByRole("button", { name: "Leave trip" }).click();
  await friend.getByRole("alertdialog").getByRole("button", { name: "Leave trip" }).click();
  await friend.waitForURL(/\/$/);
  await expect(friend.getByRole("link", { name: /Code Trip/ })).toHaveCount(0);

  // The owner changes the code.
  await page.goto(`${base}/settings`);
  await expect(page.getByRole("button", { name: "Leave trip" })).toHaveCount(0);
  await page.getByRole("button", { name: "Get a new code" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Get new code" }).click();
  await page.waitForURL(
    (url) =>
      /\/trip\/[A-HJ-NP-Z2-9]{8}\/settings$/.test(url.pathname) && !url.pathname.includes(oldCode),
  );
  const newCode = new URL(page.url()).pathname.split("/")[2]!;
  expect(newCode).not.toBe(oldCode);

  // The old link no longer works for the friend, who has left.
  await friend.goto(`/trip/${oldCode}`);
  await expect(
    friend.getByRole("heading", { name: "You don't have access to this trip" }),
  ).toBeVisible();
  await friendContext.close();
});
