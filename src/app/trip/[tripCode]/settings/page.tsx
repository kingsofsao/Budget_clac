import type { Metadata } from "next";
import { Panel, Section } from "@/components/common";
import { DeleteTripButton } from "@/features/trips/components/delete-trip-button";
import { InvitePanel } from "@/features/trips/components/invite-panel";
import { TripForm } from "@/features/trips/components/trip-form";
import { getTripByCode } from "@/features/trips/queries";

export const metadata: Metadata = { title: "Trip settings" };

export default async function TripSettingsPage({ params }: PageProps<"/trip/[tripCode]/settings">) {
  const { tripCode } = await params;
  const access = await getTripByCode(tripCode);
  if (!access) return null;
  const { trip, role } = access;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Trip settings</h1>
      <Section id="details" title="Trip details">
        <Panel>
          <TripForm
            mode="edit"
            tripCode={trip.code}
            defaultValues={{
              name: trip.name,
              description: trip.description ?? "",
              startDate: trip.startDate,
              endDate: trip.endDate,
            }}
          />
        </Panel>
      </Section>
      <InvitePanel trip={trip} />
      <Section id="danger" title="Delete trip">
        <Panel className="flex flex-col gap-3">
          {role === "owner" ? (
            <>
              <p className="text-muted-foreground text-sm">
                Permanently delete this trip and all its expenses for everyone.
              </p>
              <DeleteTripButton code={trip.code} name={trip.name} />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only the person who created this trip can delete it.
            </p>
          )}
        </Panel>
      </Section>
    </div>
  );
}
