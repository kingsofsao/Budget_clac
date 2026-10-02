/**
 * Money utilities.
 *
 * Every amount in this application is an integer number of **paise**
 * (1 rupee = 100 paise). Floating-point numbers are never used for money:
 *
 *   - User input is parsed from strings directly into integer paise (`parseINR`).
 *   - All arithmetic (sums, splits, balances, settlements) is integer arithmetic.
 *   - Formatting to "₹1,800.50" happens only at the presentation layer (`formatINR`).
 *
 * JavaScript numbers represent integers exactly up to 2^53 - 1 (~₹90 trillion),
 * far above anything a group trip will reach. `assertPaise` guards that boundary.
 */

export type Paise = number;

/** Upper bound for a single expense: ₹1,00,00,000 (one crore). */
export const MAX_EXPENSE_PAISE: Paise = 1_000_000_000;

export class MoneyError extends Error {
  override name = "MoneyError";
}

export function isPaise(value: unknown): value is Paise {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertPaise(value: unknown, label = "amount"): asserts value is Paise {
  if (!isPaise(value)) {
    throw new MoneyError(
      `${label} must be a safe integer number of paise, received ${String(value)}`,
    );
  }
}

export function addMoney(...values: Paise[]): Paise {
  let total = 0;
  for (const v of values) {
    assertPaise(v);
    total += v;
  }
  assertPaise(total, "sum");
  return total;
}

export function sumMoney(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) {
    assertPaise(v);
    total += v;
  }
  assertPaise(total, "sum");
  return total;
}

export function subtractMoney(a: Paise, b: Paise): Paise {
  assertPaise(a);
  assertPaise(b);
  const result = a - b;
  assertPaise(result, "difference");
  return result;
}

export function rupeesToPaise(rupees: number): Paise {
  // Only for whole-rupee literals (seed data, tests). Never for user input.
  if (!Number.isSafeInteger(rupees)) {
    throw new MoneyError(`rupeesToPaise expects whole rupees, received ${rupees}`);
  }
  return rupees * 100;
}

/**
 * Parse a user-entered rupee string into integer paise without floating point.
 *
 * Accepts: "1800", "1,800", "₹1,800", "1800.5", "1800.50", " 18,00,000 ", ".75".
 * Rejects: negatives, more than 2 decimal places, letters, empty input.
 * Returns `null` when the input is not a valid amount.
 */
export function parseINR(input: string): Paise | null {
  const cleaned = input
    .trim()
    .replace(/^₹\s*/, "")
    .replace(/^rs\.?\s*/i, "")
    .replace(/,/g, "");
  if (cleaned === "") return null;
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (whole === "" && fraction === "") return null;
  // Reject absurdly long inputs before converting to avoid precision loss.
  if (whole.replace(/^0+/, "").length > 13) return null;
  const rupees = whole === "" ? 0 : Number.parseInt(whole, 10);
  const paise = fraction === "" ? 0 : Number.parseInt(fraction.padEnd(2, "0"), 10);
  const result = rupees * 100 + paise;
  return Number.isSafeInteger(result) ? result : null;
}

/** Group a string of digits the Indian way: 12345678 → 1,23,45,678. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${groups.join(",")},${last3}`;
}

export interface FormatOptions {
  /** Always show two decimal places, e.g. ₹1,800.00. Default: only when paise ≠ 0. */
  alwaysShowPaise?: boolean;
  /** Prefix positive values with "+". Negative values always get "−". */
  signed?: boolean;
  /** Omit the ₹ symbol. */
  noSymbol?: boolean;
}

/** Format integer paise as Indian Rupees, e.g. 3267000 → "₹32,670", 251350 → "₹2,513.50". */
export function formatINR(paise: Paise, options: FormatOptions = {}): string {
  assertPaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  let text = groupIndian(String(rupees));
  if (rem !== 0 || options.alwaysShowPaise) {
    text += `.${String(rem).padStart(2, "0")}`;
  }
  const symbol = options.noSymbol ? "" : "₹";
  const sign = negative ? "−" : options.signed && paise > 0 ? "+" : "";
  return `${sign}${symbol}${text}`;
}

/** Plain-text variant safe for CSV/WhatsApp (ASCII minus sign). */
export function formatINRPlain(paise: Paise, options: FormatOptions = {}): string {
  return formatINR(paise, options).replace("−", "-");
}

/** Convert paise to the string a user would type into an amount field ("1800" / "1800.50"). */
export function paiseToInputString(paise: Paise): string {
  assertPaise(paise);
  const rupees = Math.floor(Math.abs(paise) / 100);
  const rem = Math.abs(paise) % 100;
  const sign = paise < 0 ? "-" : "";
  return rem === 0 ? `${sign}${rupees}` : `${sign}${rupees}.${String(rem).padStart(2, "0")}`;
}

/**
 * Split `amount` paise into shares proportional to integer `weights`, so that the
 * shares always sum to exactly `amount`.
 *
 * Algorithm (largest remainder / Hamilton method, integer-only):
 *   1. Each share gets floor(amount * weight / totalWeight).
 *   2. The leftover paise (always < number of shares) are handed out one at a
 *      time to the shares with the largest fractional remainder.
 *   3. **Deterministic tie-break:** equal remainders are resolved by position —
 *      the share that appears earlier in the input receives the extra paisa first.
 *
 * BigInt is used internally so `amount * weight` can never overflow.
 */
export function splitByWeights(amount: Paise, weights: readonly number[]): Paise[] {
  assertPaise(amount);
  if (amount < 0) throw new MoneyError("Cannot split a negative amount");
  if (weights.length === 0) throw new MoneyError("Cannot split between zero participants");
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w <= 0) {
      throw new MoneyError("Split weights must be positive integers");
    }
  }
  const total = BigInt(amount);
  const weightSum = weights.reduce((acc, w) => acc + BigInt(w), 0n);
  const shares: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0n;
  weights.forEach((w, index) => {
    const numerator = total * BigInt(w);
    const share = numerator / weightSum;
    shares.push(share);
    remainders.push({ index, remainder: numerator % weightSum });
    allocated += share;
  });
  let leftover = Number(total - allocated);
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const { index } of remainders) {
    if (leftover === 0) break;
    shares[index] = (shares[index] ?? 0n) + 1n;
    leftover -= 1;
  }
  return shares.map((s) => Number(s));
}

/**
 * Split `amount` paise equally between `count` people.
 *
 * Rounding rule: every person gets floor(amount / count); the remaining
 * `amount % count` paise go one each to the **first** people in the given order.
 * Example: splitEqual(100, 3) → [34, 33, 33].
 */
export function splitEqual(amount: Paise, count: number): Paise[] {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new MoneyError("Cannot split between zero participants");
  }
  return splitByWeights(amount, new Array<number>(count).fill(1));
}

export interface SplitValidation {
  valid: boolean;
  total: Paise;
  /** expected − entered. Positive: still to allocate. Negative: over-allocated. */
  remaining: Paise;
}

/** Check that individual shares add up to the expense amount exactly. */
export function validateSplit(amount: Paise, shares: readonly Paise[]): SplitValidation {
  assertPaise(amount);
  const total = sumMoney(shares);
  const allNonNegative = shares.every((s) => s >= 0);
  return {
    valid: allNonNegative && shares.length > 0 && total === amount,
    total,
    remaining: amount - total,
  };
}

/**
 * Parse a percentage typed by the user into integer basis points (1/100 of a
 * percent), without floating point: "33.33" → 3333, "50" → 5000, "12.5%" → 1250.
 * Returns null for invalid input or values outside 0–100%.
 */
export function parsePercent(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, "").trim();
  const match = /^(\d{1,3})?(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match || cleaned === "" || cleaned === ".") return null;
  const whole = match[1] ? Number.parseInt(match[1], 10) : 0;
  const fraction = match[2] ? Number.parseInt(match[2].padEnd(2, "0"), 10) : 0;
  const bp = whole * 100 + fraction;
  return bp <= 10_000 ? bp : null;
}

/** Format basis points as a percentage: 3333 → "33.33%", 5000 → "50%", 1250 → "12.5%". */
export function formatBasisPoints(bp: number): string {
  const whole = Math.floor(Math.abs(bp) / 100);
  const rem = Math.abs(bp) % 100;
  const sign = bp < 0 ? "−" : "";
  if (rem === 0) return `${sign}${whole}%`;
  const fraction = String(rem).padStart(2, "0").replace(/0$/, "");
  return `${sign}${whole}.${fraction}%`;
}

/** The text a user would type for a basis-point value: 3333 → "33.33", 5000 → "50". */
export function basisPointsToInputString(bp: number): string {
  return formatBasisPoints(bp).replace("%", "");
}
