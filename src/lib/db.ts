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

export class NaviDB extends Dexie {
  fixes!: Table<Fix, number>;
  settings!: Table<Setting, string>;
  gates!: Table<Gate, number>;

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
