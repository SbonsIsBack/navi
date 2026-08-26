import Dexie, { type Table } from 'dexie';

/**
 * Database offline dell'app. Tutto vive nel browser: nessuna chiamata di rete
 * è necessaria per registrare o rileggere i dati (requisito Airplane Mode).
 *
 * Le versioni successive dello schema (varchi Tutor in Fase 4, viaggi e
 * checkpoint in Fase 6) si aggiungono qui con `.version(n).stores(...)`:
 * Dexie applica le migrazioni in automatico sui DB già esistenti.
 */

/** Un fix GPS accettato dai filtri di qualità. */
export interface Fix {
  id?: number;
  /** Epoch ms del rilevamento (dal device, non dall'orologio dell'app). */
  t: number;
  lat: number;
  lon: number;
  /** Velocità in km/h già filtrata (vedi `src/lib/gps.ts`). */
  speedKmh: number;
  /** Raggio di incertezza orizzontale in metri. */
  accuracy: number;
  /** Rotta in gradi (0 = Nord), quando disponibile. */
  heading: number | null;
  /** Altitudine in metri, quando disponibile. */
  altitude: number | null;
  /** `true` se la velocità arriva dal Doppler del chip GPS, `false` se derivata. */
  doppler: boolean;
}

/** Impostazioni e stato applicativo, come coppie chiave/valore. */
export interface Setting<T = unknown> {
  key: string;
  value: T;
}

/** Come è stata censita la posizione di un varco. */
export type GateSource = 'gps' | 'manual' | 'map';

/** Un varco Tutor censito dall'utente. */
export interface Gate {
  id?: number;
  name: string;
  lat: number;
  lon: number;
  /** Quante rilevazioni concorrono alla posizione corrente. */
  samples: number;
  /**
   * Peso statistico accumulato (somma di 1/accuratezza²): serve alla media
   * pesata dell'anti-cloni, vedi `src/lib/gates.ts`.
   */
  weight: number;
  /** Migliore accuratezza osservata, in metri. */
  bestAccuracy: number;
  /** Limite di velocità della tratta in km/h (usato dal motore di Fase 5). */
  speedLimit: number | null;
  source: GateSource;
  createdAt: number;
  updatedAt: number;
}

/** Un viaggio: una sessione di tracking, dall'avvio all'arresto del GPS. */
export interface Trip {
  id?: number;
  startedAt: number;
  /** `null` finché il viaggio è in corso (o se l'app è stata chiusa). */
  endedAt: number | null;
  distanceM: number;
  maxSpeedKmh: number;
  /** Media sull'intero viaggio, calcolata alla chiusura. */
  avgSpeedKmh: number;
  /**
   * Firma del percorso: i varchi attraversati in ordine, uniti da "›".
   * Precalcolata alla chiusura del viaggio perché è la chiave con cui lo
   * storico raggruppa i tragitti ripetuti.
   */
  routeKey: string;
}

/** Passaggio sotto un varco durante un viaggio. */
export interface Checkpoint {
  id?: number;
  tripId: number;
  gateId: number;
  gateName: string;
  /** Orario esatto del transito. */
  t: number;
  /** Velocità istantanea al passaggio. */
  speedKmh: number;
  /** Quanto è stato "centrato" il varco, in metri. */
  offsetM: number;
}

/** Tratta fra due varchi completata durante un viaggio. */
export interface TripSegment {
  id?: number;
  tripId: number;
  fromGateId: number;
  fromGateName: string;
  toGateId: number;
  toGateName: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  averageKmh: number;
  speedLimit: number | null;
}

/** Da dove proviene l'identità: oggi solo locale, domani Apple/Google. */
export type AuthProvider = 'local' | 'apple' | 'google';

/** Profilo utente. Vive sul device; il sync cloud è predisposto, non attivo. */
export interface Profile {
  id?: number;
  displayName: string;
  provider: AuthProvider;
  /**
   * Identificativo rilasciato dal provider esterno (`sub` di Apple/Google).
   * Vuoto per l'utente locale: è la chiave con cui un futuro backend
   * riconoscerebbe lo stesso utente su device diversi.
   */
  providerId: string | null;
  email: string | null;
  /** Emoji usata come avatar quando non c'è una foto. */
  avatarEmoji: string;
  /** Colore di sfondo dell'avatar (token esadecimale). */
  avatarColor: string;
  /**
   * Foto profilo come data URL, ridimensionata a lato 128 px.
   * Sta nel DB e non su un CDN: l'app deve funzionare in Airplane Mode.
   */
  avatarPhoto: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Stato di una posizione nella coda di invio. */
export type SyncState = 'pending' | 'sent' | 'failed';

/**
 * Posizione in coda per la futura condivisione live.
 *
 * È una **outbox**: la si scrive sempre in locale e un adattatore di sync la
 * drena quando (e se) esisterà un backend. Questo è ciò che rende possibile
 * aggiungere il cloud senza toccare la logica di tracking, ed è il motivo per
 * cui la tabella esiste già ora che l'app è puramente locale.
 */
export interface LivePosition {
  id?: number;
  profileId: number;
  t: number;
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number | null;
  syncState: SyncState;
  /** Tentativi di invio già effettuati, per un futuro backoff. */
  attempts: number;
}

export class NaviDB extends Dexie {
  fixes!: Table<Fix, number>;
  settings!: Table<Setting, string>;
  gates!: Table<Gate, number>;
  trips!: Table<Trip, number>;
  checkpoints!: Table<Checkpoint, number>;
  segments!: Table<TripSegment, number>;
  profiles!: Table<Profile, number>;
  livePositions!: Table<LivePosition, number>;

  constructor() {
    super('navi');
    this.version(1).stores({
      fixes: '++id, t',
      settings: 'key',
    });
    // v2: varchi Tutor. `lat` è indicizzato per restringere la ricerca di
    // prossimità con una range query prima del calcolo delle distanze.
    this.version(2).stores({
      gates: '++id, lat, updatedAt, name',
    });
    // v3: storico viaggi. `startedAt` ordina la vista per giorni, `routeKey`
    // raggruppa i tragitti ripetuti, `tripId` lega checkpoint e tratte.
    this.version(3).stores({
      trips: '++id, startedAt, endedAt, routeKey',
      checkpoints: '++id, tripId, t, gateId',
      segments: '++id, tripId, startedAt',
    });
    // v4: profilo e coda posizioni live. `syncState` è indicizzato perché è
    // il campo su cui un futuro adattatore cercherebbe cosa resta da inviare.
    this.version(4).stores({
      profiles: '++id, provider, providerId',
      livePositions: '++id, syncState, t, profileId',
    });
  }
}

export const db = new NaviDB();

/** Legge un'impostazione, con fallback se assente. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

/**
 * Elimina i fix più vecchi di `days` giorni. A 1 fix/secondo un'ora di guida
 * produce ~3600 righe: senza potatura il DB crescerebbe senza limite.
 */
export async function pruneOldFixes(days = 7): Promise<number> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.fixes.where('t').below(cutoff).delete();
}

/** Numero di fix registrati (usato dalla UI per mostrare lo stato del log). */
export function countFixes(): Promise<number> {
  return db.fixes.count();
}
