import { effect, untracked } from '@preact/signals';
import {
  db,
  type Checkpoint,
  type Trip,
  type TripSegment,
  type Fix,
} from '@/lib/db';
import { lastFix } from '@/lib/gps';
import { lastPass, lastCompleted, travelledBetween } from '@/lib/tutor';
import { enqueueLivePosition } from '@/lib/sync';

/**
 * Registratore dello storico: trasforma il flusso di eventi del motore Tutor
 * in righe persistenti su IndexedDB.
 *
 * Un "viaggio" coincide con una sessione di tracking (avvio → arresto del
 * GPS). Durante il viaggio si accumulano distanza e velocità massima, e ogni
 * transito sotto un varco diventa un checkpoint con orario e velocità.
 */

/**
 * Ogni quanti fix riscrivere il viaggio su disco.
 *
 * Aggiornare la riga a ogni fix significherebbe migliaia di scritture per
 * un'ora di guida, per un dato che l'utente non sta guardando. Con un
 * salvataggio ogni 10 fix una chiusura brutale dell'app costa al massimo una
 * decina di secondi di percorso, e i checkpoint vengono comunque scritti
 * subito perché sono l'informazione che non si può ricostruire.
 */
const PERSIST_EVERY_FIXES = 10;

let tripId: number | null = null;
let prevFix: Fix | null = null;
let distanceM = 0;
let maxSpeedKmh = 0;
let startedAt = 0;
let fixesSincePersist = 0;
let lastFixAt = 0;
let disposers: (() => void)[] = [];

/** Id del viaggio in corso, per i test e la diagnostica. */
export function currentTripId(): number | null {
  return tripId;
}

async function persistTrip(final: boolean) {
  if (tripId === null) return;
  const endedAt = final ? lastFixAt || Date.now() : null;
  const elapsedS = ((endedAt ?? Date.now()) - startedAt) / 1000;
  const patch: Partial<Trip> = {
    distanceM,
    maxSpeedKmh,
    endedAt,
    avgSpeedKmh: elapsedS > 0 ? (distanceM / elapsedS) * 3.6 : 0,
  };
  if (final) patch.routeKey = await buildRouteKey(tripId);
  await db.trips.update(tripId, patch);
}

/**
 * Firma del percorso: i varchi attraversati in ordine cronologico.
 * È la chiave con cui lo storico riconosce lo stesso tragitto ripetuto.
 */
async function buildRouteKey(id: number): Promise<string> {
  const points = await db.checkpoints.where('tripId').equals(id).sortBy('t');
  return points.map((c) => c.gateName).join(' › ');
}

/** Apre un nuovo viaggio. Da chiamare all'avvio del tracking. */
export async function startTrip(): Promise<number> {
  await endTrip();
  startedAt = Date.now();
  lastFixAt = 0;
  distanceM = 0;
  maxSpeedKmh = 0;
  prevFix = null;
  fixesSincePersist = 0;
  tripId = await db.trips.add({
    startedAt,
    endedAt: null,
    distanceM: 0,
    maxSpeedKmh: 0,
    avgSpeedKmh: 0,
    routeKey: '',
  });
  return tripId;
}

/** Chiude il viaggio in corso, se ce n'è uno. */
export async function endTrip(): Promise<void> {
  if (tripId === null) return;
  await persistTrip(true);
  tripId = null;
  prevFix = null;
}

/**
 * Chiude i viaggi rimasti aperti da sessioni precedenti.
 *
 * Se l'app viene chiusa mentre il tracking è attivo nessuno esegue la
 * chiusura: al riavvio quei viaggi resterebbero per sempre "in corso" e
 * sporcherebbero lo storico. Li chiudiamo sull'ultimo istante di cui abbiamo
 * evidenza, cioè l'ultimo checkpoint registrato (o l'avvio, se non ce ne sono).
 */
export async function closeOrphanTrips(): Promise<number> {
  const open = await db.trips.filter((t) => t.endedAt === null).toArray();
  for (const trip of open) {
    const points = await db.checkpoints.where('tripId').equals(trip.id!).sortBy('t');
    const endedAt = points.length ? points[points.length - 1]!.t : trip.startedAt;
    const elapsedS = (endedAt - trip.startedAt) / 1000;
    await db.trips.update(trip.id!, {
      endedAt,
      routeKey: points.map((c) => c.gateName).join(' › '),
      avgSpeedKmh: elapsedS > 0 ? (trip.distanceM / elapsedS) * 3.6 : 0,
    });
  }
  return open.length;
}

function onFix(fix: Fix) {
  if (tripId === null) return;
  lastFixAt = fix.t;
  if (prevFix) distanceM += travelledBetween(prevFix, fix);
  prevFix = fix;
  if (fix.speedKmh > maxSpeedKmh) maxSpeedKmh = fix.speedKmh;

  if (++fixesSincePersist >= PERSIST_EVERY_FIXES) {
    fixesSincePersist = 0;
    void persistTrip(false).catch(() => {});
  }

  // Coda per la condivisione live: no-op finché l'utente non la attiva.
  void enqueueLivePosition(fix).catch(() => {});
}

/**
 * Aggancia il registratore agli eventi del motore. Come nel motore Tutor, i
 * corpi degli effect girano in `untracked`: leggono altri signal e non devono
 * ri-sottoscriversi a ogni passaggio.
 */
export function startRecorder(): () => void {
  stopRecorder();

  disposers = [
    effect(() => {
      const fix = lastFix.value;
      if (fix) untracked(() => onFix(fix));
    }),

    effect(() => {
      const pass = lastPass.value;
      if (!pass) return;
      untracked(() => {
        if (tripId === null) return;
        const checkpoint: Checkpoint = {
          tripId,
          gateId: pass.gateId,
          gateName: pass.gateName,
          t: pass.t,
          speedKmh: pass.speedKmh,
          offsetM: pass.distanceM,
        };
        // Scrittura immediata: orario e velocità sotto il varco sono il dato
        // che non si può ricostruire a posteriori.
        void db.checkpoints.add(checkpoint).catch(() => {});
        void persistTrip(false).catch(() => {});
      });
    }),

    effect(() => {
      const done = lastCompleted.value;
      if (!done) return;
      untracked(() => {
        if (tripId === null) return;
        const segment: TripSegment = {
          tripId,
          fromGateId: done.fromGateId,
          fromGateName: done.fromGateName,
          toGateId: done.toGateId,
          toGateName: done.toGateName,
          startedAt: done.startedAt,
          endedAt: done.endedAt,
          distanceM: done.distanceM,
          averageKmh: done.averageKmh,
          speedLimit: done.speedLimit,
        };
        void db.segments.add(segment).catch(() => {});
      });
    }),
  ];

  return stopRecorder;
}

export function stopRecorder(): void {
  disposers.forEach((d) => d());
  disposers = [];
}
