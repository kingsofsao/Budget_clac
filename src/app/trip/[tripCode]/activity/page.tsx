import type { Metadata } from "next";
import { Panel } from "@/components/common";
import { ActivityFeed } from "@/features/trips/components/activity-feed";
import { getActivity, getTripByCode } from "@/features/trips/queries";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params }: PageProps<"/trip/[tripCode]/activity">) {
  const { tripCode } = await params;
  const access = await getTripByCode(tripCode);
  if (!access) return null;
  const items = await getActivity(access.trip.id, 200);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">Every change to this trip, newest first.</p>
      </div>
      <Panel className="py-1 sm:py-1">
        <ActivityFeed items={items} />
      </Panel>
    </div>
  );
}
