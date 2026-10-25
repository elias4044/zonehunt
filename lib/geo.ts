import type { LatLng, Zone } from "./types";

const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Same ray-casting check the server uses, so the warning shows up instantly
// instead of waiting for the next sync.
export function insideZone(zone: Zone | null, lat: number, lng: number) {
  if (!zone) return true;
  if (zone.type === "circle") return distanceM([zone.lat, zone.lng], [lat, lng]) <= zone.radius;
  let inside = false;
  const p = zone.points;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [yi, xi] = p[i];
    const [yj, xj] = p[j];
    if (xi > lng !== xj > lng && lat < ((yj - yi) * (lng - xi)) / (xj - xi) + yi) inside = !inside;
  }
  return inside;
}

export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

const WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export function bearingWord(deg: number) {
  return WORDS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function zoneLabel(z: Zone | null) {
  if (!z) return "Not set";
  if (z.type === "circle") return `Circle, ${formatDistance(z.radius * 2)} across`;
  return `${z.points.length} corners`;
}
