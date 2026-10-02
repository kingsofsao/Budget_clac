import { z } from "zod";
import { CATEGORY_IDS } from "@/lib/categories";
import { dayCount, isValidISODate } from "@/lib/dates";
import {
  MAX_EXPENSE_PAISE,
  formatBasisPoints,
  formatINR,
  parseINR,
  parsePercent,
} from "@/lib/money";
import { SPLIT_METHODS } from "@/types/domain";
import { TRIP_CODE_RE, normaliseTripCode } from "@/lib/utils";

/**
 * Schemas are shared by client forms (instant feedback) and server actions
 * (authoritative validation). The server never trusts client-computed money:
 * amounts arrive as the strings the user typed and are parsed to paise here.
 */

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");

const isoDate = (label: string) =>
  z.string().refine((v) => isValidISODate(v), `${label} must be a valid date.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const tripDetailsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give your trip a name.")
      .max(80, "Keep the name under 80 characters."),
    description: optionalText(500, "Description"),
    startDate: isoDate("Start date"),
    endDate: isoDate("End date"),
  })
  .superRefine((v, ctx) => {
    if (!isValidISODate(v.startDate) || !isValidISODate(v.endDate)) return;
    if (v.endDate < v.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date can't be before the start date.",
      });
    } else if (dayCount(v.startDate, v.endDate) > 366) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A trip can be at most one year long.",
      });
    }
  });

export const createTripSchema = z.intersection(
  tripDetailsSchema,
  z.object({
    creatorName: z
      .string()
      .trim()
      .min(1, "Tell us your name.")
      .max(40, "Keep your name under 40 characters."),
  }),
);
export type CreateTripInput = z.input<typeof createTripSchema>;
export type TripDetailsInput = z.input<typeof tripDetailsSchema>;

export const memberSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(40, "Keep names under 40 characters."),
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .refine(
      (v) => v === undefined || z.email().safeParse(v).success,
      "Enter a valid email or leave it blank.",
    ),
});
export type MemberInput = z.input<typeof memberSchema>;

export const tripCodeSchema = z
  .string()
  .transform(normaliseTripCode)
  .refine((v) => TRIP_CODE_RE.test(v), "Trip codes are 8 letters/numbers, like BGLDEMX2.");

/** Amount typed by the user, e.g. "1,800.50" → 180050 paise. */
export const amountSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .transform((v, ctx) => {
    const paise = parseINR(v);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount, like 1800 or 1800.50." });
      return z.NEVER;
    }
    if (paise <= 0) {
      ctx.addIssue({ code: "custom", message: "Amount must be greater than zero." });
      return z.NEVER;
    }
    if (paise > MAX_EXPENSE_PAISE) {
      ctx.addIssue({
        code: "custom",
        message: `Amount can be at most ${formatINR(MAX_EXPENSE_PAISE)}.`,
      });
      return z.NEVER;
    }
    return paise;
  });

/** Raw form values for an expense (all strings, as typed). */
export const expenseFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Add a short description.")
    .max(80, "Keep it under 80 characters."),
  amount: z.string(),
  paidByMemberId: z.string().min(1, "Choose who paid."),
  category: z.enum(CATEGORY_IDS, "Choose a category."),
  splitMethod: z.enum(SPLIT_METHODS),
  expenseDate: z.string().min(1, "Choose a date."),
  notes: z.string().max(500, "Notes must be at most 500 characters."),
  participantIds: z.array(z.string()).min(1, "Select at least one participant."),
  /**
   * memberId → the per-person value as typed, depending on splitMethod:
   * custom → rupees ("400.50"), shares → whole number ("2"), percentage → "33.33".
   * Ignored for equal splits.
   */
  splitInputs: z.record(z.string(), z.string()),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export interface ParsedExpense {
  description: string;
  amountPaise: number;
  paidByMemberId: string;
  category: (typeof CATEGORY_IDS)[number];
  splitMethod: (typeof SPLIT_METHODS)[number];
  expenseDate: string;
  notes: string | null;
  participantIds: string[];
  /**
   * memberId → parsed integer value: paise (custom), share count (shares) or
   * basis points (percentage). Null for equal splits.
   */
  splitValues: Map<string, number> | null;
}

export const MAX_SHARES_PER_PERSON = 1000;

/** Parse a whole number of shares ("2") for the shares split. */
export function parseShareCount(input: string): number | null {
  const v = input.trim();
  if (!/^\d{1,4}$/.test(v)) return null;
  const n = Number.parseInt(v, 10);
  return n >= 1 && n <= MAX_SHARES_PER_PERSON ? n : null;
}

/**
 * Parse & validate expense form values into integer data (paise, shares, basis
 * points). Returns field errors keyed like the form fields. Used on both the
 * client (instant feedback) and the server (authoritative).
 */
export function parseExpenseForm(
  values: unknown,
): { ok: true; data: ParsedExpense } | { ok: false; fieldErrors: Record<string, string> } {
  const base = expenseFormSchema.safeParse(values);
  const fieldErrors: Record<string, string> = {};
  if (!base.success) {
    for (const issue of base.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    // Report an invalid amount in the same pass so users see every problem at once.
    const rawAmount = (values as { amount?: unknown } | null)?.amount;
    if (!fieldErrors.amount && typeof rawAmount === "string") {
      const amount = amountSchema.safeParse(rawAmount);
      if (!amount.success)
        fieldErrors.amount = amount.error.issues[0]?.message ?? "Invalid amount.";
    }
    return { ok: false, fieldErrors };
  }
  const v = base.data;
  const amount = amountSchema.safeParse(v.amount);
  if (!amount.success) fieldErrors.amount = amount.error.issues[0]?.message ?? "Invalid amount.";
  if (!isValidISODate(v.expenseDate)) fieldErrors.expenseDate = "Choose a valid date.";
  if (!uuidSchema.safeParse(v.paidByMemberId).success)
    fieldErrors.paidByMemberId = "Choose who paid.";
  if (v.participantIds.some((id) => !uuidSchema.safeParse(id).success)) {
    fieldErrors.participantIds = "Invalid participant.";
  }
  if (new Set(v.participantIds).size !== v.participantIds.length) {
    fieldErrors.participantIds = "A participant was selected twice.";
  }

  let splitValues: Map<string, number> | null = null;
  if (v.splitMethod !== "equal") {
    splitValues = new Map();
    let total = 0;
    for (const id of v.participantIds) {
      const raw = (v.splitInputs[id] ?? "").trim();
      let value: number | null;
      let message: string;
      if (v.splitMethod === "custom") {
        value = raw === "" ? 0 : parseINR(raw);
        message = "Enter a valid amount.";
      } else if (v.splitMethod === "shares") {
        value = parseShareCount(raw);
        message = `Enter a whole number from 1 to ${MAX_SHARES_PER_PERSON}.`;
      } else {
        value = parsePercent(raw);
        if (value === 0) value = null;
        message = "Enter a percentage above 0, up to 2 decimals.";
      }
      if (value === null) {
        fieldErrors[`splitInputs.${id}`] = message;
        continue;
      }
      splitValues.set(id, value);
      total += value;
    }
    const hasValueErrors = Object.keys(fieldErrors).some((k) => k.startsWith("splitInputs."));
    if (!hasValueErrors && v.splitMethod === "custom" && amount.success) {
      if (total !== amount.data) {
        fieldErrors.splitInputs = `The participant shares must add up to ${formatINR(amount.data)} (currently ${formatINR(total)}).`;
      } else if ([...splitValues.values()].every((p) => p === 0)) {
        fieldErrors.splitInputs = "At least one participant needs a share.";
      }
    }
    if (!hasValueErrors && v.splitMethod === "percentage" && total !== 10_000) {
      fieldErrors.splitInputs = `Percentages must add up to 100% (currently ${formatBasisPoints(total)}).`;
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !amount.success) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: {
      description: v.description,
      amountPaise: amount.data,
      paidByMemberId: v.paidByMemberId,
      category: v.category,
      splitMethod: v.splitMethod,
      expenseDate: v.expenseDate,
      notes: v.notes.trim() ? v.notes.trim() : null,
      participantIds: v.participantIds,
      splitValues,
    },
  };
}

/** Values for recording a settlement payment (strings as typed). */
export const paymentFormSchema = z.object({
  fromMemberId: uuidSchema,
  toMemberId: uuidSchema,
  amount: amountSchema,
  paidOn: z.string().refine((v) => isValidISODate(v), "Choose a valid date."),
  note: z
    .string()
    .trim()
    .max(200, "Keep the note under 200 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type PaymentFormInput = z.input<typeof paymentFormSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");
export const displayNameSchema = z.string().trim().min(1, "Enter your name.").max(40);
