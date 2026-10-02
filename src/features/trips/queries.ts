import "server-only";
import { cache } from "react";
import { buildTripReport, type TripReport } from "@/lib/calculations";
import { isCategoryId } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import { TRIP_CODE_RE } from "@/lib/utils";
import {
  SPLIT_METHODS,
  type Expense,
  type Member,
  type Payment,
  type SplitMethod,
  type Trip,
  type TripRole,
} from "@/types/domain";

export interface CurrentUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

/** The signed-in user (including anonymous guests), verified with Supabase Auth. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const claims = data.claims as { sub: string; email?: string; is_anonymous?: boolean };
  return {
    id: claims.sub,
    email: claims.email || null,
    isAnonymous: Boolean(claims.is_anonymous),
  };
});

type TripRow = {
  id: string;
  public_code: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapTrip(row: TripRow): Trip {
  return {
    id: row.id,
    code: row.public_code,
    name: row.name,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TripAccess {
  trip: Trip;
  role: TripRole;
}

/**
 * Load a trip by share code. Returns null when the trip does not exist OR the
 * user has no access — RLS hides the row in both cases.
 */
export const getTripByCode = cache(async (code: string): Promise<TripAccess | null> => {
  if (!TRIP_CODE_RE.test(code)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, public_code, name, description, start_date, end_date, created_by, created_at, updated_at, trip_access!inner(role)",
    )
    .eq("public_code", code)
    .eq("trip_access.user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load trip: ${error.message}`);
  if (!data) return null;
  const access = (data.trip_access as unknown as { role: string }[])[0];
  return { trip: mapTrip(data), role: access?.role === "owner" ? "owner" : "member" };
});

export const getTripPreview = cache(async (code: string) => {
  if (!TRIP_CODE_RE.test(code)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_trip_preview", { p_code: code });
  if (error) throw new Error(`Failed to load trip preview: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  return {
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    memberCount: row.member_count,
    isMember: row.is_member,
  };
});

export const getMembers = cache(async (tripId: string): Promise<Member[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_members")
    .select("id, display_name, email, color, user_id, position")
    .eq("trip_id", tripId)
    .order("position");
  if (error) throw new Error(`Failed to load people: ${error.message}`);
  return data.map((m) => ({
    id: m.id,
    name: m.display_name,
    email: m.email,
    color: m.color,
    userId: m.user_id,
    position: m.position,
  }));
});

const PAGE_SIZE = 500;

/**
 * All expenses (with shares) for a trip. Paged so trips with thousands of
 * expenses are never truncated by the API's row limit.
 */
export const getExpenses = cache(async (tripId: string): Promise<Expense[]> => {
  const supabase = await createClient();
  const expenses: Expense[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("expenses")
      .select(
        "id, description, amount_paise, paid_by_member_id, category, split_method, expense_date, notes, created_at, updated_at, expense_participants(member_id, share_paise, split_value)",
      )
      .eq("trip_id", tripId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load expenses: ${error.message}`);
    for (const e of data) {
      expenses.push({
        id: e.id,
        description: e.description,
        amountPaise: Number(e.amount_paise),
        paidByMemberId: e.paid_by_member_id,
        category: isCategoryId(e.category) ? e.category : "other",
        splitMethod: (SPLIT_METHODS as readonly string[]).includes(e.split_method)
          ? (e.split_method as SplitMethod)
          : "custom",
        expenseDate: e.expense_date,
        notes: e.notes,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
        shares: e.expense_participants.map((p) => ({
          memberId: p.member_id,
          sharePaise: Number(p.share_paise),
          splitValue: p.split_value,
        })),
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return expenses;
});

/** Payments members recorded as made, oldest first. */
export const getPayments = cache(async (tripId: string): Promise<Payment[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settlement_payments")
    .select("id, from_member_id, to_member_id, amount_paise, paid_on, note, created_at")
    .eq("trip_id", tripId)
    .order("paid_on")
    .order("created_at")
    .limit(2000);
  if (error) throw new Error(`Failed to load payments: ${error.message}`);
  return data.map((p) => ({
    id: p.id,
    fromMemberId: p.from_member_id,
    toMemberId: p.to_member_id,
    amountPaise: Number(p.amount_paise),
    paidOn: p.paid_on,
    note: p.note,
    createdAt: p.created_at,
  }));
});

export interface TripData extends TripAccess {
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  report: TripReport;
  me: Member | null;
}

/** Everything a trip page needs, computed once per request. */
export const getTripData = cache(async (code: string): Promise<TripData | null> => {
  const access = await getTripByCode(code);
  if (!access) return null;
  const [members, expenses, payments, user] = await Promise.all([
    getMembers(access.trip.id),
    getExpenses(access.trip.id),
    getPayments(access.trip.id),
    getCurrentUser(),
  ]);
  const ordered = [...members].sort((a, b) => a.position - b.position);
  // Shares in a stable member order everywhere in the UI.
  const pos = new Map(ordered.map((m) => [m.id, m.position]));
  for (const e of expenses) {
    e.shares.sort((a, b) => (pos.get(a.memberId) ?? 0) - (pos.get(b.memberId) ?? 0));
  }
  return {
    ...access,
    members: ordered,
    expenses,
    payments,
    report: buildTripReport(access.trip, ordered, expenses, payments),
    me: ordered.find((m) => m.userId && m.userId === user?.id) ?? null,
  };
});

export interface ActivityItem {
  id: number;
  actorName: string;
  action: string;
  subject: string | null;
  amountPaise: number | null;
  previousAmountPaise: number | null;
  createdAt: string;
}

export const getActivity = cache(async (tripId: string, limit = 20): Promise<ActivityItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_activity")
    .select("id, actor_name, action, subject, amount_paise, previous_amount_paise, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load activity: ${error.message}`);
  return data.map((a) => ({
    id: a.id,
    actorName: a.actor_name,
    action: a.action,
    subject: a.subject,
    amountPaise: a.amount_paise === null ? null : Number(a.amount_paise),
    previousAmountPaise: a.previous_amount_paise === null ? null : Number(a.previous_amount_paise),
    createdAt: a.created_at,
  }));
});

export interface TripListItem {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  role: TripRole;
  memberCount: number;
  expenseCount: number;
  totalPaise: number;
  updatedAt: string;
}

export const listMyTrips = cache(async (): Promise<TripListItem[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_trips", { p_limit: 30 });
  if (error) throw new Error(`Failed to load trips: ${error.message}`);
  return data.map((t) => ({
    code: t.public_code,
    name: t.name,
    startDate: t.start_date,
    endDate: t.end_date,
    role: t.role === "owner" ? "owner" : "member",
    memberCount: t.member_count,
    expenseCount: t.expense_count,
    totalPaise: Number(t.total_paise),
    updatedAt: t.updated_at,
  }));
});
