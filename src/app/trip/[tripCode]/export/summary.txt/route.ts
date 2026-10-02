import { getTripData } from "@/features/trips/queries";
import { buildSummaryText, fileSafeName } from "@/lib/export";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/trip/[tripCode]/export/summary.txt">,
) {
  const { tripCode } = await ctx.params;
  const data = await getTripData(tripCode);
  if (!data) return new Response("You don't have access to this trip.", { status: 403 });
  return new Response(buildSummaryText(data.trip, data.members, data.report) + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSafeName(data.trip.name)}-summary.txt"`,
      "Cache-Control": "private, no-store",
    },
  });
}
