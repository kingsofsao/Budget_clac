import { calculateExpenseShares, orderByMembers } from "@/lib/calculations";
import type { ParsedExpense } from "@/lib/validation";
import type { ExpenseShare, Member } from "@/types/domain";

/**
 * Turn a validated expense into per-person shares. Pure and shared by the
 * client (live preview) and the server (authoritative). Participants are put
 * in trip-member order first so rounding is deterministic.
 * Throws SplitError for an impossible split.
 */
export function sharesForExpense(
  e: Pick<ParsedExpense, "splitMethod" | "amountPaise" | "participantIds" | "splitValues">,
  members: readonly Pick<Member, "id" | "position">[],
): ExpenseShare[] {
  const ordered = orderByMembers(e.participantIds, members);
  switch (e.splitMethod) {
    case "equal":
      return calculateExpenseShares({
        method: "equal",
        amountPaise: e.amountPaise,
        participantIds: ordered,
      });
    case "custom":
      return calculateExpenseShares({
        method: "custom",
        amountPaise: e.amountPaise,
        shares: ordered.map((memberId) => ({
          memberId,
          sharePaise: e.splitValues?.get(memberId) ?? 0,
        })),
      });
    case "shares":
    case "percentage":
      return calculateExpenseShares({
        method: e.splitMethod,
        amountPaise: e.amountPaise,
        weights: ordered.map((memberId) => ({
          memberId,
          value: e.splitValues?.get(memberId) ?? 0,
        })),
      });
  }
}
