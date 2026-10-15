export interface LatLng {
  lat: number;
  lng: number;
}

const ROAD_FACTOR = 1.38;
const SPEED_KMH = 30;

export function roadKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const straight = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.max(0.35, straight * ROAD_FACTOR);
}

export function minutesForKm(km: number): number {
  return Math.max(4, Math.round((km / SPEED_KMH) * 60));
}

export function lerpCoord(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
