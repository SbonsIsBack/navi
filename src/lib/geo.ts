/** Utility geodetiche. Distanze in metri, angoli in gradi. */

export interface LatLng {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Distanza haversine in metri. Alle scale che ci interessano (metri-chilometri)
 * l'errore rispetto a Vincenty è trascurabile, e ci serve una funzione veloce:
 * la chiamiamo a ogni fix GPS e, in Fase 4, su ogni varco censito.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rotta iniziale da `a` a `b`, in gradi 0-360 (0 = Nord). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export const MS_TO_KMH = 3.6;
