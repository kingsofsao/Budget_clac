import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return Array.from(parts[0]!).slice(0, 2).join("").toUpperCase();
  return (Array.from(parts[0]!)[0]! + Array.from(parts[parts.length - 1]!)[0]!).toUpperCase();
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Share codes are case-insensitive for typing; normalise to the stored form. */
export function normaliseTripCode(input: string): string {
  const trimmed = input.trim();
  // Accept a full pasted link like https://host/trip/ABCD2345/expenses
  const fromLink = /\/trip\/([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(trimmed);
  return (fromLink?.[1] ?? trimmed).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const TRIP_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
