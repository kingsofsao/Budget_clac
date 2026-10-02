import { getTripData } from "@/features/trips/queries";
import { buildExpensesCsv, fileSafeName } from "@/lib/export";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/trip/[tripCode]/export/expenses.csv">,
) {
  const { tripCode } = await ctx.params;
  const data = await getTripData(tripCode);
  if (!data) return new Response("You don't have access to this trip.", { status: 403 });
  // BOM so Excel opens UTF-8 (₹, names in other scripts) correctly.
  const body = String.fromCharCode(0xfeff) + buildExpensesCsv(data.members, data.expenses);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSafeName(data.trip.name)}-expenses.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
