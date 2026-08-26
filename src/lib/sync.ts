import { signal } from '@preact/signals';
import { db, getSetting, setSetting, type Fix, type LivePosition } from '@/lib/db';
import { currentProfile } from '@/lib/auth';

/**
 * Architettura di sincronizzazione delle coordinate live.
 *
 * L'app oggi è puramente locale e non invia nulla da nessuna parte. Questo
 * modulo definisce però il **confine** oltre il quale un backend andrebbe
 * innestato, così che aggiungerlo domani non richieda di toccare né il motore
 * GPS né il registratore.
 *
 * Il pattern è una outbox: le posizioni si accodano in IndexedDB con stato
 * `pending`, e un adattatore le drena. L'adattatore attivo di default non
 * manda niente — è il comportamento corretto per un'app offline-first, e
 * rende la coda un archivio locale invece che una perdita di dati.
 */

/** Contratto che un futuro backend dovrà soddisfare. */
export interface SyncAdapter {
  readonly id: string;
  /** Invia un lotto di posizioni. Ritorna gli id accettati dal server. */
  push(batch: LivePosition[]): Promise<number[]>;
}

/**
 * Adattatore di default: non invia nulla e non finge di farlo.
 * Le posizioni restano `pending` nella coda locale.
 */
export const localOnlyAdapter: SyncAdapter = {
  id: 'local-only',
  async push() {
    return [];
  },
};

let adapter: SyncAdapter = localOnlyAdapter;

/** Sostituisce l'adattatore. Qui si innesterà il client del backend. */
export function setSyncAdapter(next: SyncAdapter): void {
  adapter = next;
}

export function currentAdapterId(): string {
  return adapter.id;
}

const SHARING_KEY = 'sync:liveSharing';

/** Condivisione live attiva. Spenta di default: è un dato di posizione. */
export const liveSharing = signal(false);

export async function restoreSharingPreference(): Promise<boolean> {
  liveSharing.value = await getSetting(SHARING_KEY, false);
  return liveSharing.value;
}

export async function setLiveSharing(on: boolean): Promise<void> {
  liveSharing.value = on;
  await setSetting(SHARING_KEY, on);
}

/**
 * Ogni quanto accodare una posizione quando la condivisione è attiva.
 *
 * Accodare ogni fix produrrebbe un punto al secondo: molto più di quanto
 * serva a mostrare "dov'è" qualcuno su una mappa, e uno spreco di banda che
 * un domani pagherebbe l'utente.
 */
export const LIVE_INTERVAL_MS = 10_000;

let lastQueuedAt = 0;

/**
 * Accoda una posizione, se la condivisione è attiva e c'è un profilo.
 * Senza profilo non si accoda nulla: un punto senza identità non sarebbe
 * inviabile a nessuno e resterebbe spazzatura nel database.
 */
export async function enqueueLivePosition(fix: Fix): Promise<boolean> {
  if (!liveSharing.peek()) return false;
  const profile = currentProfile.peek();
  if (!profile?.id) return false;
  if (fix.t - lastQueuedAt < LIVE_INTERVAL_MS) return false;

  lastQueuedAt = fix.t;
  await db.livePositions.add({
    profileId: profile.id,
    t: fix.t,
    lat: fix.lat,
    lon: fix.lon,
    speedKmh: fix.speedKmh,
    heading: fix.heading,
    syncState: 'pending',
    attempts: 0,
  });
  return true;
}

export interface QueueStats {
  pending: number;
  sent: number;
  failed: number;
}

export async function queueStats(): Promise<QueueStats> {
  const [pending, sent, failed] = await Promise.all([
    db.livePositions.where('syncState').equals('pending').count(),
    db.livePositions.where('syncState').equals('sent').count(),
    db.livePositions.where('syncState').equals('failed').count(),
  ]);
  return { pending, sent, failed };
}

/**
 * Prova a svuotare la coda con l'adattatore corrente.
 *
 * Con `localOnlyAdapter` non fa nulla di visibile: esiste perché il ciclo di
 * drenaggio sia già scritto e testato quando il backend arriverà.
 */
export async function flushQueue(limit = 100): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  const batch = await db.livePositions
    .where('syncState')
    .equals('pending')
    .limit(limit)
    .toArray();
  if (batch.length === 0) return 0;

  try {
    const accepted = await adapter.push(batch);
    if (accepted.length === 0) return 0;
    await db.livePositions.where('id').anyOf(accepted).modify({ syncState: 'sent' });
    return accepted.length;
  } catch {
    // Un invio fallito non si perde: resta `pending` e si ritenta più tardi.
    await db.livePositions
      .where('id')
      .anyOf(batch.map((p) => p.id!))
      .modify((p) => {
        p.attempts += 1;
      });
    return 0;
  }
}

/** Svuota la coda locale (le posizioni non ancora inviate vanno perse). */
export async function clearQueue(): Promise<void> {
  await db.livePositions.clear();
  lastQueuedAt = 0;
}
