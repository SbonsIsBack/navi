import { db, type Gate, type GateSource } from '@/lib/db';
import { distanceMeters, type LatLng } from '@/lib/geo';

/**
 * Raggio di normalizzazione: due rilevazioni entro questa distanza sono
 * considerate lo stesso varco fisico, non due varchi distinti. È il valore
 * richiesto dalle specifiche (5-6 m) e corrisponde all'ordine di grandezza
 * dell'errore GPS in condizioni buone.
 */
export const CLONE_RADIUS_M = 6;

/** Accuratezza attribuita a un punto inserito a mano o preso dalla mappa. */
const ASSUMED_MANUAL_ACCURACY_M = 10;

/** Nessuna misura è puntiforme: evita pesi infiniti se l'accuratezza è 0. */
const MIN_ACCURACY_M = 1;

const M_PER_DEG_LAT = 111_320;

export interface GateObservation {
  lat: number;
  lon: number;
  /** Accuratezza in metri; se assente si assume quella di un inserimento manuale. */
  accuracy?: number | null;
  source: GateSource;
  name?: string;
  speedLimit?: number | null;
}

/**
 * Peso di un'osservazione nella media: l'inverso della varianza.
 *
 * Un fix a ±3 m vale ~100 volte uno a ±30 m, che è esattamente il rapporto
 * con cui vanno combinate due misure indipendenti della stessa grandezza.
 * Una media semplice, al contrario, lascerebbe che un singolo fix scadente
 * sposti un varco già misurato bene decine di volte.
 */
function weightOf(accuracy: number): number {
  return 1 / Math.max(MIN_ACCURACY_M, accuracy) ** 2;
}

function accuracyOf(obs: GateObservation): number {
  const a = obs.accuracy;
  return a != null && Number.isFinite(a) && a > 0 ? a : ASSUMED_MANUAL_ACCURACY_M;
}

/**
 * Fonde una nuova osservazione nella posizione consolidata di un varco,
 * con media pesata per l'inverso della varianza.
 */
export function mergePosition(
  gate: Pick<Gate, 'lat' | 'lon' | 'weight'>,
  point: LatLng,
  accuracy: number,
): { lat: number; lon: number; weight: number } {
  const w = weightOf(accuracy);
  const total = gate.weight + w;
  return {
    lat: (gate.lat * gate.weight + point.lat * w) / total,
    lon: (gate.lon * gate.weight + point.lon * w) / total,
    weight: total,
  };
}

/**
 * Cerca il varco esistente più vicino a `point` entro `radius` metri.
 *
 * IndexedDB non sa fare query spaziali: restringiamo prima con una range
 * query sulla latitudine indicizzata (l'unica dimensione con un fattore di
 * conversione costante), poi calcoliamo la distanza reale solo sui pochi
 * candidati rimasti.
 */
export async function findNearbyGate(
  point: LatLng,
  radius = CLONE_RADIUS_M,
): Promise<{ gate: Gate; distance: number } | null> {
  const deltaLat = radius / M_PER_DEG_LAT;
  const candidates = await db.gates
    .where('lat')
    .between(point.lat - deltaLat, point.lat + deltaLat, true, true)
    .toArray();

  let best: { gate: Gate; distance: number } | null = null;
  for (const gate of candidates) {
    const distance = distanceMeters(point, gate);
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { gate, distance };
    }
  }
  return best;
}

export interface UpsertResult {
  gate: Gate;
  /** `true` se l'osservazione è confluita in un varco esistente. */
  merged: boolean;
  /** Distanza dal varco esistente, in metri, quando `merged`. */
  distance?: number;
}

/**
 * Registra un'osservazione: la fonde nel varco vicino se esiste (anti-cloni),
 * altrimenti crea un nuovo varco.
 */
export async function upsertGate(obs: GateObservation): Promise<UpsertResult> {
  const accuracy = accuracyOf(obs);
  const point: LatLng = { lat: obs.lat, lon: obs.lon };

  // Transazione: senza, due catture ravvicinate potrebbero leggere entrambe
  // "nessun varco vicino" e creare i cloni che stiamo cercando di evitare.
  return db.transaction('rw', db.gates, async () => {
    const near = await findNearbyGate(point);

    if (near) {
      const merged = mergePosition(near.gate, point, accuracy);
      const updated: Gate = {
        ...near.gate,
        ...merged,
        samples: near.gate.samples + 1,
        bestAccuracy: Math.min(near.gate.bestAccuracy, accuracy),
        // Il nome esistente vince: l'utente l'ha scelto, la cattura no.
        name: near.gate.name,
        speedLimit: obs.speedLimit ?? near.gate.speedLimit,
        updatedAt: Date.now(),
      };
      await db.gates.put(updated);
      return { gate: updated, merged: true, distance: near.distance };
    }

    const now = Date.now();
    const gate: Gate = {
      name: obs.name?.trim() || `Varco ${(await db.gates.count()) + 1}`,
      lat: obs.lat,
      lon: obs.lon,
      samples: 1,
      weight: weightOf(accuracy),
      bestAccuracy: accuracy,
      speedLimit: obs.speedLimit ?? null,
      source: obs.source,
      createdAt: now,
      updatedAt: now,
    };
    const id = await db.gates.add(gate);
    return { gate: { ...gate, id }, merged: false };
  });
}

export function listGates(): Promise<Gate[]> {
  return db.gates.orderBy('updatedAt').reverse().toArray();
}

export function deleteGate(id: number): Promise<void> {
  return db.gates.delete(id);
}

export async function updateGate(
  id: number,
  patch: Partial<Pick<Gate, 'name' | 'speedLimit'>>,
): Promise<void> {
  await db.gates.update(id, { ...patch, updatedAt: Date.now() });
}
