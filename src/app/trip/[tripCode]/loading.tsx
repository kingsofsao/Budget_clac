export default function TripLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="bg-muted h-8 w-48 rounded-lg" />
      <div className="bg-muted h-28 rounded-2xl" />
      <div className="bg-muted h-12 rounded-xl" />
      <div className="bg-muted h-48 rounded-2xl" />
    </div>
  );
}
