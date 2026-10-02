import { CopyButton, CopyLinkButton, ShareButton } from "@/components/copy-button";
import { Panel } from "@/components/common";
import type { Trip } from "@/types/domain";

export function InvitePanel({ trip }: { trip: Trip }) {
  const path = `/trip/${trip.code}`;
  return (
    <Panel className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Invite friends</h2>
        <p className="text-muted-foreground text-sm">
          Anyone with this link or code can join the trip, add expenses and see balances. Only share
          it with the group.
        </p>
      </div>
      <p className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">Trip code</span>
        <span
          className="bg-muted rounded-lg px-3 py-1.5 font-mono text-lg font-semibold tracking-[0.2em]"
          aria-label={`Trip code ${trip.code.split("").join(" ")}`}
        >
          {trip.code}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <ShareButton
          title={trip.name}
          path={path}
          text={`Join "${trip.name}" on Trip Split. Code: ${trip.code}`}
        />
        <CopyLinkButton path={path} label="Copy trip link" />
        <CopyButton text={trip.code} label="Copy code" successMessage="Trip code copied" />
      </div>
    </Panel>
  );
}
