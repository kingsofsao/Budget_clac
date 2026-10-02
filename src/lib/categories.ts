export const CATEGORY_IDS = [
  "transport",
  "food",
  "stay",
  "tickets",
  "fuel",
  "parking",
  "shopping",
  "entertainment",
  "other",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  emoji: string;
}

export const CATEGORIES: Record<CategoryId, CategoryInfo> = {
  transport: { id: "transport", label: "Transport", emoji: "🚕" },
  food: { id: "food", label: "Food", emoji: "🍽️" },
  stay: { id: "stay", label: "Stay", emoji: "🏨" },
  tickets: { id: "tickets", label: "Tickets", emoji: "🎟️" },
  fuel: { id: "fuel", label: "Fuel", emoji: "⛽" },
  parking: { id: "parking", label: "Parking", emoji: "🅿️" },
  shopping: { id: "shopping", label: "Shopping", emoji: "🛍️" },
  entertainment: { id: "entertainment", label: "Entertainment", emoji: "🎉" },
  other: { id: "other", label: "Other", emoji: "🧾" },
};

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES[id].label;
}
