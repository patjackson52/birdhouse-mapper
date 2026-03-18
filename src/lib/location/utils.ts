/**
 * Calculate distance between two coordinates using the Haversine formula.
 * Returns distance in meters.
 */
export function distanceBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const FEET_PER_METER = 3.28084;
const FEET_PER_MILE = 5280;

/**
 * Format a distance in meters to a human-readable string.
 * Under 1000 ft → "350 ft", over → "0.8 mi"
 */
export function formatDistance(meters: number): string {
  const feet = meters * FEET_PER_METER;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = feet / FEET_PER_MILE;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Get distance from a user position to an item.
 * Returns meters, or null if position is unavailable.
 */
export function getDistanceToItem(
  position: { lat: number; lng: number } | null,
  item: { latitude: number; longitude: number }
): number | null {
  if (!position) return null;
  return distanceBetween(position.lat, position.lng, item.latitude, item.longitude);
}
