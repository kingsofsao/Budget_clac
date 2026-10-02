// Smoke test a DEPLOYED Trip Split site through a real (headless) phone browser.
//
//   npm run smoke -- https://your-app.vercel.app
//
// It creates a clearly named "[TEST]" trip as a guest, exercises the main
// flows (people, equal / custom / shares splits, balances, recorded payment,
// edit, delete, join, export, access control) and ALWAYS deletes the trip at
// the end. Exit code 0 = everything passed.
import { chromium, devices } from "playwright";

const target = process.argv[2];
if (!target || !/^https?:\/\//.test(target)) {
  console.error("Usage: npm run smoke -- https://your-app.example.com");
  process.exit(2);
}
const B = target.replace(/\/$/, "");

const isoDay = (offsetDays) =>
  new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const step = (m) => console.log("✓", m);
const fail = (m) => {
  throw new Error(m);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
const page = await ctx.newPage();
page.setDefaultTimeout(30_000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

/** Navigate and wait for the page's main heading (pages stream in after "load"). */
async function open(path, heading) {
  await page.goto(`${B}${path}`);
  await page.getByRole("heading", { name: heading }).first().waitFor();
}
const mainText = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");

let base = "";
let ok = true;
try {
  await page.goto(`${B}/create`);
  await page.getByLabel("Trip name").fill("[TEST] Smoke test — safe to delete");
  await page.getByLabel("Your name").fill("Surya");
  await page.getByLabel("One-day outing").uncheck();
  await page.getByLabel("Start date").fill(isoDay(0));
  await page.getByLabel("End date").fill(isoDay(2));
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL(/\/trip\/[A-HJ-NP-Z2-9]{8}\/people/);
  base = new URL(page.url()).pathname.replace("/people", "");
  step(`guest session + trip created (${base})`);

  for (const n of ["Nithish", "Gokul", "Vishal"]) {
    await page.getByLabel("Name", { exact: true }).fill(n);
    await page.getByLabel("Name", { exact: true }).press("Enter");
    await page.getByRole("list").getByText(n, { exact: true }).waitFor();
  }
  step("3 people added");

  const addExpense = async (amount, description, category, configure) => {
    await open(`${base}/expenses/new`, "Add expense");
    await page.getByLabel("Amount").fill(amount);
    await page.getByLabel("Description").fill(description);
    await page
      .locator("label")
      .filter({ has: page.getByRole("radio", { name: category }) })
      .click();
    if (configure) await configure();
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(`**${base}/expenses`);
  };
  await addExpense("1800", "Airport Cab", "Transport");
  await addExpense("1000", "Lunch", "Food", async () => {
    await page.getByLabel("Paid by").selectOption({ label: "Gokul" });
    await page.getByRole("checkbox", { name: "Vishal" }).uncheck();
    await page.getByRole("radio", { name: "Amounts" }).click();
    await page.getByLabel("Surya's share").fill("400");
    await page.getByLabel("Nithish's share").fill("300");
    await page.getByLabel("Gokul's share").fill("300");
  });
  await addExpense("900", "Snacks", "Food", async () => {
    await page.getByLabel("Paid by").selectOption({ label: "Vishal" });
    await page.getByRole("radio", { name: "Shares" }).click();
    await page.getByLabel("Vishal's number of shares").fill("3");
  });
  step("equal, custom-amount and shares expenses saved");

  // Expected nets (₹): Cab 450 each; Lunch S400 N300 G300; Snacks 900 / 6 shares → S150 N150 G150 V450.
  // Surya 1800−1000=+800 · Nithish −900 · Gokul 1000−900=+100 · Vishal 900−900=0
  await open(`${base}/balances`, "Balances");
  const text = await mainText();
  for (const s of ["Should receive ₹800", "Should pay ₹900", "Should receive ₹100"]) {
    if (!text.includes(s)) fail(`balances missing "${s}"`);
  }
  if (!text.includes("all balances add up to ₹0")) fail("reconciliation check missing");
  step("balances correct (Surya +₹800, Nithish −₹900, Gokul +₹100, Vishal settled)");

  await page.getByRole("button", { name: "Mark Nithish → Surya as paid" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("list", { name: "Recorded payments" }).waitFor();
  if (!(await mainText()).includes("Should pay ₹100")) fail("balance after payment wrong");
  step("recorded payment updates balances (Nithish now owes ₹100)");

  await open(`${base}/summary`, "Trip summary");
  step("summary renders");

  await open(`${base}/expenses`, "Expenses");
  await page.getByRole("link", { name: /Airport Cab/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Amount").fill("2000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/expenses\/[0-9a-f-]{36}$/);
  await open(`${base}/expenses`, "Expenses");
  await page.getByRole("link", { name: /Lunch/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete Expense" }).click();
  await page.waitForURL(`**${base}/expenses`);
  // Cab 2000 / 4 = 500 each; Snacks as before; payment N→S 800.
  // Surya 2000−650−800 = +550 · Nithish −650+800 = +150 · Gokul −650 · Vishal 900−950 = −50
  await open(`${base}/balances`, "Balances");
  const after = await mainText();
  for (const s of [
    "Should receive ₹550",
    "Should receive ₹150",
    "Should pay ₹650",
    "Should pay ₹50",
  ]) {
    if (!after.includes(s)) fail(`after edit/delete, balances missing "${s}"`);
  }
  step("edit + delete recalculated balances");

  const friendCtx = await browser.newContext({ serviceWorkers: "block" });
  const friend = await friendCtx.newPage();
  await friend.goto(`${B}${base}`);
  await friend.getByRole("button", { name: "Join this trip" }).click();
  await friend.getByText("Which one are you?").waitFor({ timeout: 30_000 });
  await friendCtx.close();
  step("second browser joined via the share link");

  const csv = await page.request.get(`${B}${base}/export/expenses.csv`);
  if (csv.status() !== 200) fail(`CSV export returned ${csv.status()}`);
  const outsider = await browser.newContext();
  const denied = await outsider.request.get(`${B}${base}/export/expenses.csv`);
  await outsider.close();
  if (denied.status() !== 403) fail(`outsider got ${denied.status()} instead of 403`);
  step("CSV export works; outsider gets 403");

  const home = await page.request.get(`${B}/`);
  if (!home.headers()["content-security-policy"]?.includes("nonce-")) fail("CSP header missing");
  step("Content-Security-Policy header present");
} catch (e) {
  ok = false;
  console.log("✗ FAILED:", e.message.split("\n")[0]);
  await page.screenshot({ path: "smoke-failure.png", fullPage: true }).catch(() => {});
  console.log("  screenshot: smoke-failure.png");
} finally {
  if (base) {
    try {
      await open(`${base}/settings`, "Trip settings");
      await page.getByRole("button", { name: "Delete trip" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete trip" }).click();
      await page.waitForURL(/\/\?deleted=1/);
      step("test trip deleted");
    } catch (e) {
      ok = false;
      console.log(`✗ could not delete test trip ${base}: ${e.message.split("\n")[0]}`);
    }
  }
  if (errors.length) {
    ok = false;
    console.log(`✗ browser console errors: ${errors.join(" | ")}`);
  } else console.log("✓ no browser console errors");
  await browser.close();
  process.exit(ok ? 0 : 1);
}
