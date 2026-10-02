import { expect, test, type Page } from "@playwright/test";

/** Rows on the Balances page are table rows keyed by the person's name. */
function balanceRow(page: Page, name: string) {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }) });
}

async function addExpense(
  page: Page,
  base: string,
  opts: {
    amount: string;
    description: string;
    category: string;
    paidBy?: string;
    uncheck?: string[];
    day?: string;
  },
) {
  await page.goto(`${base}/expenses/new`);
  await page.getByLabel("Amount").fill(opts.amount);
  await page.getByLabel("Description").fill(opts.description);
  // Category chips are labels wrapping a visually hidden radio: click the chip like a user.
  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: opts.category }) })
    .click();
  await expect(page.getByRole("radio", { name: opts.category })).toBeChecked();
  if (opts.paidBy) await page.getByLabel("Paid by").selectOption({ label: opts.paidBy });
  if (opts.day) await page.getByLabel("Date").selectOption({ label: opts.day });
  for (const name of opts.uncheck ?? []) await page.getByRole("checkbox", { name }).uncheck();
}

test("full trip lifecycle: create → people → expenses → balances → summary → edit → delete → share → reopen", async ({
  page,
  browser,
  baseURL,
}) => {
  let base = "";
  let code = "";
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await test.step("1. create a multi-day trip", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /split trip expenses/i })).toBeVisible();
    await page.getByRole("link", { name: "Create a Trip" }).click();
    await page.getByLabel("Trip name").fill("E2E Goa Trip");
    await page.getByLabel("Your name").fill("Surya");
    await page.getByLabel("One-day outing").uncheck();
    await page.getByLabel("Start date").fill("2026-10-01");
    await page.getByLabel("End date").fill("2026-10-03");
    await expect(page.getByText("3-day trip")).toBeVisible();
    await page.getByRole("button", { name: "Create trip" }).click();
    await page.waitForURL(/\/trip\/[A-HJ-NP-Z2-9]{8}\/people\?new=1/);
    code = new URL(page.url()).pathname.split("/")[2]!;
    base = `/trip/${code}`;
    await expect(
      page.getByRole("heading", { name: "Add the people joining this trip" }),
    ).toBeVisible();
  });

  await test.step("2. add members", async () => {
    for (const name of ["Nithish", "Gokul", "Vishal"]) {
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("Name", { exact: true }).press("Enter");
      await expect(page.getByRole("list").getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("4 people on this trip")).toBeVisible();
    // Duplicate names are refused with a clear message.
    await page.getByLabel("Name", { exact: true }).fill("gokul");
    await page.getByLabel("Name", { exact: true }).press("Enter");
    await expect(page.getByText(/already on this trip/)).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("");
  });

  await test.step("3. add an equal-split expense", async () => {
    await addExpense(page, base, {
      amount: "1,800",
      description: "Airport Cab",
      category: "Transport",
    });
    // Live preview: ₹1,800 / 4 = ₹450.
    await expect(page.getByText("₹450").first()).toBeVisible();
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
    await expect(page.getByRole("link", { name: /Airport Cab/ })).toBeVisible();
  });

  await test.step("4. add a custom-split expense with different participants", async () => {
    await addExpense(page, base, {
      amount: "1000",
      description: "Lunch",
      category: "Food",
      paidBy: "Gokul",
      uncheck: ["Vishal"],
      day: "Day 2 · 02 Oct",
    });
    await page.getByRole("radio", { name: "Amounts" }).click();
    await page.getByLabel("Surya's share").fill("400");
    await page.getByLabel("Nithish's share").fill("300");
    await page.getByLabel("Gokul's share").fill("200");
    await expect(page.getByText("₹100 left to assign")).toBeVisible();
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(
      page.getByText("The participant shares must add up to ₹1,000 (currently ₹900).").first(),
    ).toBeVisible();
    await page.getByLabel("Gokul's share").fill("300");
    await expect(page.getByText("Valid")).toBeVisible();
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
    await expect(page.getByRole("heading", { name: "Day 2 — 02 Oct" })).toBeVisible();
    // Search filter
    await page.getByLabel("Search expenses").fill("cab");
    await expect(page.getByRole("link", { name: /Lunch/ })).toBeHidden();
    await expect(page.getByRole("link", { name: /Airport Cab/ })).toBeVisible();
  });

  await test.step("5. balances and settlement", async () => {
    await page.goto(`${base}/balances`);
    // Surya paid 1800, share 450 + 400 = 850 → receives 950.
    await expect(balanceRow(page, "Surya")).toContainText(/Should receive\s*₹950/);
    await expect(balanceRow(page, "Nithish")).toContainText(/Should pay\s*₹750/);
    await expect(balanceRow(page, "Gokul")).toContainText(/Should receive\s*₹250/);
    await expect(balanceRow(page, "Vishal")).toContainText(/Should pay\s*₹450/);
    const transfers = page.getByRole("list", { name: "Suggested payments" }).getByRole("listitem");
    await expect(transfers).toHaveCount(3);
    // Text content also contains the avatars' initials, hence the `.*`.
    await expect(transfers.nth(0)).toContainText(/Nithish.*pays.*Surya₹750/);
    await expect(transfers.nth(1)).toContainText(/Vishal.*pays.*Gokul₹250/);
    await expect(transfers.nth(2)).toContainText(/Vishal.*pays.*Surya₹200/);
    await expect(page.getByText(/all balances add up to ₹0/)).toBeVisible();
  });

  await test.step("6. summary", async () => {
    await page.goto(`${base}/summary`);
    await expect(page.getByRole("heading", { name: "Trip summary" })).toBeVisible();
    const categories = page.getByRole("table", { name: "Spending by category" });
    await expect(categories.getByRole("row", { name: /Transport/ })).toContainText("64%");
    await expect(categories.getByRole("row", { name: /Food/ })).toContainText("36%");
    await expect(
      page
        .getByRole("table", { name: "Spending per day" })
        .getByRole("row", { name: /Whole trip/ }),
    ).toContainText("₹2,800");
    await expect(page.getByRole("button", { name: "Copy Summary" })).toBeVisible();
  });

  await test.step("7. edit an expense → balances recalculate", async () => {
    await page.goto(`${base}/expenses`);
    await page.getByRole("link", { name: /Airport Cab/ }).click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Amount").fill("2000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/expenses\/[0-9a-f-]{36}$/);
    await expect(page.getByText("₹2,000").first()).toBeVisible();
    await page.goto(`${base}/balances`);
    // Share 500 + 400 = 900, paid 2000 → receives 1100.
    await expect(balanceRow(page, "Surya")).toContainText(/Should receive\s*₹1,100/);
  });

  await test.step("8. delete an expense (with confirmation) → balances recalculate", async () => {
    await page.goto(`${base}/expenses`);
    await page.getByRole("link", { name: /Lunch/ }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      "This will recalculate everyone's balances and settlement amounts.",
    );
    await dialog.getByRole("button", { name: "Delete Expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
    await expect(page.getByRole("link", { name: /Lunch/ })).toHaveCount(0);
    await page.goto(`${base}/balances`);
    await expect(balanceRow(page, "Surya")).toContainText(/Should receive\s*₹1,500/);
    await expect(balanceRow(page, "Gokul")).toContainText(/Should pay\s*₹500/);
  });

  await test.step("removing a person who is in an expense is blocked with an explanation", async () => {
    await page.goto(`${base}/people`);
    await page.getByRole("button", { name: "Remove Vishal" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Vishal can't be removed yet");
    await page.getByRole("button", { name: "OK" }).click();
  });

  await test.step("9. share: code and link copy, then a friend joins with the link", async () => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL! });
    await page.goto(`${base}/settings`);
    await page.getByRole("button", { name: "Copy code" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await page.getByRole("button", { name: "Copy trip link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}${base}`);

    const friendContext = await browser.newContext();
    const friend = await friendContext.newPage();
    await friend.goto(base);
    await expect(friend.getByRole("heading", { name: "E2E Goa Trip" })).toBeVisible();
    await friend.getByRole("button", { name: "Join this trip" }).click();
    await expect(friend.getByText("Which one are you?")).toBeVisible();
    await friend.getByLabel("I am").selectOption({ label: "Nithish" });
    await friend.getByRole("button", { name: "Confirm" }).click();
    await expect(friend.getByText(/You \(Nithish\)/)).toBeVisible();
    await friendContext.close();

    await page.goto(`${base}/activity`);
    await expect(page.getByText("Nithish joined the trip")).toBeVisible();
    await expect(page.getByText(/Surya edited “Airport Cab” — ₹1,800 → ₹2,000/)).toBeVisible();
    await expect(page.getByText(/Surya deleted “Lunch” — ₹1,000/)).toBeVisible();
  });

  await test.step("10. re-open the trip from the home page", async () => {
    await page.goto("/");
    const card = page.getByRole("link", { name: /E2E Goa Trip/ });
    await expect(card).toContainText("4 people");
    await expect(card).toContainText("₹2,000");
    await card.click();
    await page.waitForURL(`**${base}`);
    await expect(page.getByText("Total spent")).toBeVisible();
  });

  await test.step("CSV export", async () => {
    const response = await page.request.get(`${base}/export/expenses.csv`);
    expect(response.status()).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("Date,Description,Category,Paid By,Participants,Amount (INR)");
    // New expenses default to today (clamped into the trip), so don't assume the day.
    expect(csv).toMatch(
      /2026-10-0[1-3],Airport Cab,Transport,Surya,Surya; Nithish; Gokul; Vishal,2000\.00,Surya: 500\.00; Nithish: 500\.00/,
    );
  });

  await test.step("no browser console errors during normal use", async () => {
    expect(consoleErrors).toEqual([]);
  });
});

test("the owner can delete a trip (with expenses and payments) after confirming", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByLabel("Trip name").fill("Trip To Delete");
  await page.getByLabel("Your name").fill("Owner");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL(/\/trip\/[A-Z0-9]{8}\/people/);
  const base = new URL(page.url()).pathname.replace("/people", "");
  // Regression: deleting used to fail once a trip had expenses.
  await page.getByLabel("Name", { exact: true }).fill("Friend");
  await page.getByLabel("Name", { exact: true }).press("Enter");
  await expect(page.getByRole("list").getByText("Friend", { exact: true })).toBeVisible();
  await page.goto(`${base}/expenses/new`);
  await page.getByLabel("Amount").fill("500");
  await page.getByLabel("Description").fill("Tea");
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.waitForURL(`**${base}/expenses`);
  await page.goto(`${base}/balances`);
  await page.getByRole("button", { name: "Mark Friend → Owner as paid" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("list", { name: "Recorded payments" })).toBeVisible();
  await page.goto(`${base}/settings`);
  await page.getByRole("button", { name: "Delete trip" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete trip" }).click();
  await page.waitForURL(/\/\?deleted=1$/);
  await expect(page.getByText("The trip was deleted.")).toBeVisible();
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "You don't have access to this trip" }),
  ).toBeVisible();
});

test("unknown or inaccessible trip codes show a clear message", async ({ page }) => {
  await page.goto("/trip/ZZZZZZZZ");
  await expect(
    page.getByRole("heading", { name: "You don't have access to this trip" }),
  ).toBeVisible();
});

test("an outsider cannot download another trip's export", async ({ page, browser }) => {
  // Create a trip as one guest…
  await page.goto("/create");
  await page.getByLabel("Trip name").fill("Private Outing");
  await page.getByLabel("Your name").fill("Owner");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL(/\/trip\/[A-Z0-9]{8}\/people/);
  const code = new URL(page.url()).pathname.split("/")[2]!;
  // …a different browser (no session) gets 403 and no data.
  const outsider = await browser.newContext();
  const res = await outsider.request.get(`/trip/${code}/export/expenses.csv`);
  expect(res.status()).toBe(403);
  await outsider.close();
});

test("validation: an expense needs participants and a valid amount", async ({ page }) => {
  await page.goto("/create");
  await page.getByLabel("Trip name").fill("Chennai Day Out");
  await page.getByLabel("Your name").fill("Gokul");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL(/\/trip\/[A-Z0-9]{8}\/people/);
  const base = new URL(page.url()).pathname.replace("/people", "");
  await page.goto(`${base}/expenses/new`);
  await page.getByLabel("Amount").fill("abc");
  await page.getByLabel("Description").fill("Snacks");
  await page.getByRole("button", { name: "Deselect all" }).click();
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Enter a valid amount, like 1800 or 1800.50.")).toBeVisible();
  await expect(page.getByText("Select at least one participant.")).toBeVisible();
  // One-day outing shows a single date.
  await expect(page.getByText(/\(one-day outing\)/)).toBeVisible();
});
