export type TrackEvent =
  | 'update.delete.initiated'
  | 'update.delete.confirmed'
  | 'update.delete.cancelled_from_modal'
  | 'update.delete.undone'
  | 'update.delete.expired';

export function track(event: TrackEvent, props: Record<string, unknown> = {}): void {
  if (typeof window !== 'undefined') {
    // Browser: log for now; a provider can be wired later.
    console.info('[telemetry]', event, props);
  } else {
    console.info('[telemetry]', event, props);
  }
}
