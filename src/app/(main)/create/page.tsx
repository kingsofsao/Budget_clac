import type { Metadata } from "next";
import { Panel } from "@/components/common";
import { TripForm } from "@/features/trips/components/trip-form";
import { todayInIndia } from "@/lib/dates";

export const metadata: Metadata = { title: "Create a trip" };

export default function CreateTripPage() {
  const today = todayInIndia();
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a trip</h1>
        <p className="text-muted-foreground">
          A day out or a week away. You can add people and expenses next.
        </p>
      </div>
      <Panel>
        <TripForm
          mode="create"
          defaultValues={{
            name: "",
            creatorName: "",
            description: "",
            startDate: today,
            endDate: today,
          }}
        />
      </Panel>
      <p className="text-muted-foreground text-center text-xs">
        No sign-up needed. A private guest session keeps your trips on this device.
      </p>
    </div>
  );
}
