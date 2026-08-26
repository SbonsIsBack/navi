import { db, type Checkpoint, type Trip, type TripSegment } from '@/lib/db';

/** Un viaggio con tutto ciò che vi è successo. */
export interface TripDetail {
  trip: Trip;
  checkpoints: Checkpoint[];
  segments: TripSegment[];
}

/** Viaggi di una stessa giornata. */
export interface DayGroup {
  /** Chiave `YYYY-MM-DD` in ora locale. */
  key: string;
  label: string;
  trips: TripDetail[];
  totalDistanceM: number;
}

/** Viaggi che ripercorrono la stessa sequenza di varchi. */
export interface RouteGroup {
  key: string;
  label: string;
  trips: TripDetail[];
  /** Migliore e peggiore media fra le tratte percorse su questo tragitto. */
  bestAverageKmh: number | null;
  worstAverageKmh: number | null;
  /** Tratte che hanno superato il limite censito. */
  overLimitCount: number;
}

/** Chiave giorno in ora locale (non UTC: un viaggio serale non va a domani). */
export function dayKey(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(t: number): string {
  const key = dayKey(t);
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86_400_000);
  if (key === today) return 'Oggi';
  if (key === yesterday) return 'Ieri';
  return new Date(t).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Carica i viaggi conclusi, dal più recente. Checkpoint e tratte vengono letti
 * in blocco e poi distribuiti sui viaggi: una query per tabella invece di due
 * query per ogni viaggio.
 */
export async function loadTrips(limit = 200): Promise<TripDetail[]> {
  const trips = await db.trips.orderBy('startedAt').reverse().limit(limit).toArray();
  if (trips.length === 0) return [];

  const ids = new Set(trips.map((t) => t.id!));
  const [allPoints, allSegments] = await Promise.all([
    db.checkpoints.where('tripId').anyOf([...ids]).toArray(),
    db.segments.where('tripId').anyOf([...ids]).toArray(),
  ]);

  const pointsByTrip = new Map<number, Checkpoint[]>();
  for (const c of allPoints) {
    const list = pointsByTrip.get(c.tripId) ?? [];
    list.push(c);
    pointsByTrip.set(c.tripId, list);
  }
  const segmentsByTrip = new Map<number, TripSegment[]>();
  for (const s of allSegments) {
    const list = segmentsByTrip.get(s.tripId) ?? [];
    list.push(s);
    segmentsByTrip.set(s.tripId, list);
  }

  return trips.map((trip) => ({
    trip,
    checkpoints: (pointsByTrip.get(trip.id!) ?? []).sort((a, b) => a.t - b.t),
    segments: (segmentsByTrip.get(trip.id!) ?? []).sort((a, b) => a.startedAt - b.startedAt),
  }));
}

export function groupByDay(details: TripDetail[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const detail of details) {
    const key = dayKey(detail.trip.startedAt);
    const group =
      groups.get(key) ??
      {
        key,
        label: dayLabel(detail.trip.startedAt),
        trips: [],
        totalDistanceM: 0,
      };
    group.trips.push(detail);
    group.totalDistanceM += detail.trip.distanceM;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function groupByRoute(details: TripDetail[]): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  for (const detail of details) {
    const key = detail.trip.routeKey || '';
    const group =
      groups.get(key) ??
      {
        key,
        label: key || 'Senza varchi',
        trips: [],
        bestAverageKmh: null,
        worstAverageKmh: null,
        overLimitCount: 0,
      };
    group.trips.push(detail);
    for (const seg of detail.segments) {
      const avg = seg.averageKmh;
      group.bestAverageKmh =
        group.bestAverageKmh === null ? avg : Math.min(group.bestAverageKmh, avg);
      group.worstAverageKmh =
        group.worstAverageKmh === null ? avg : Math.max(group.worstAverageKmh, avg);
      if (seg.speedLimit != null && avg > seg.speedLimit) group.overLimitCount++;
    }
    groups.set(key, group);
  }
  // I tragitti percorsi più spesso stanno in cima: sono quelli che interessano.
  return [...groups.values()].sort((a, b) => b.trips.length - a.trips.length);
}

/** Elimina un viaggio con tutto ciò che vi è collegato. */
export async function deleteTrip(id: number): Promise<void> {
  await db.transaction('rw', db.trips, db.checkpoints, db.segments, async () => {
    await db.checkpoints.where('tripId').equals(id).delete();
    await db.segments.where('tripId').equals(id).delete();
    await db.trips.delete(id);
  });
}
