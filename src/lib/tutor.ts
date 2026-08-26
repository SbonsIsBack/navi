import { signal, effect, batch, untracked } from '@preact/signals';
import type { Fix, Gate } from '@/lib/db';
import { distanceMeters } from '@/lib/geo';
import { lastFix, noiseFloorFor } from '@/lib/gps';
import { listGates } from '@/lib/gates';

/**
 * Raggio entro cui si inizia a sorvegliare un varco.
 *
 * Non può essere il raggio di normalizzazione (6 m): a 130 km/h si percorrono
 * ~36 m al secondo e il GPS emette circa un fix al secondo, quindi un varco
 * "stretto" verrebbe scavalcato tra due rilevazioni senza accorgersene.
 * A 60 m ci sono sempre almeno un paio di fix dentro la zona, anche in
 * autostrada.
 */
export const TRIGGER_RADIUS_M = 60;

/**
 * Quanto ci si deve riallontanare dal punto di minima distanza prima di
 * dichiarare avvenuto il passaggio. Serve a non scambiare il tremolio del
 * GPS da fermo vicino a un varco per un transito.
 */
const PASS_CONFIRM_M = 12;

/** Un transito rilevato sotto un varco. */
export interface PassEvent {
  gateId: number;
  gateName: string;
  /** Epoch ms del punto di massimo avvicinamento. */
  t: number;
  /** Velocità istantanea al passaggio, km/h. */
  speedKmh: number;
  /** Distanza minima dal varco, in metri: quanto è stato "centrato". */
  distanceM: number;
  /** Posizione rilevata al transito: da qui riparte il conteggio dei metri. */
  lat: number;
  lon: number;
}

/** Tratta in corso fra due varchi. */
export interface ActiveSegment {
  fromGateId: number;
  fromGateName: string;
  startedAt: number;
  /** Distanza percorsa dall'ingresso, in metri. */
  distanceM: number;
  /** Limite della tratta in km/h, se censito sul varco d'ingresso. */
  speedLimit: number | null;
  /** Velocità di ingresso sotto il varco. */
  entrySpeedKmh: number;
}

/** Tratta chiusa dal passaggio sotto un secondo varco. */
export interface CompletedSegment extends ActiveSegment {
  toGateId: number;
  toGateName: string;
  endedAt: number;
  averageKmh: number;
}

export const activeSegment = signal<ActiveSegment | null>(null);
/** Media in tempo reale sulla tratta in corso, km/h. `null` se nessuna tratta. */
export const averageSpeed = signal<number | null>(null);
export const lastPass = signal<PassEvent | null>(null);
export const lastCompleted = signal<CompletedSegment | null>(null);

/** Stato di sorveglianza di un singolo varco. */
interface GateWatch {
  gate: Gate;
  /** Siamo dentro il raggio di trigger. */
  inZone: boolean;
  /** Distanza minima osservata durante l'avvicinamento. */
  minDistance: number;
  /** Fix corrispondente alla distanza minima: è il momento del transito. */
  minFix: Fix | null;
  /** Passaggio già emesso: non riemetterlo finché non si esce dalla zona. */
  spent: boolean;
}

let watches: GateWatch[] = [];
let prevFix: Fix | null = null;
let dispose: (() => void) | null = null;

/** (Ri)carica i varchi censiti e azzera la sorveglianza. */
export async function loadGatesIntoEngine(): Promise<number> {
  const gates = await listGates();
  watches = gates
    .filter((g) => g.id != null)
    .map((gate) => ({
      gate,
      inZone: false,
      minDistance: Infinity,
      minFix: null,
      spent: false,
    }));
  return watches.length;
}

/**
 * Rileva il transito sotto un varco cercando il punto di massimo
 * avvicinamento.
 *
 * Non basta "sono entrato nel raggio": il momento del passaggio è quello in
 * cui la distanza smette di diminuire e ricomincia a crescere. Cercare quel
 * minimo dà il transito con la precisione del singolo fix, senza dipendere
 * da quanto è largo il raggio di trigger.
 */
function detectPass(watch: GateWatch, fix: Fix): PassEvent | null {
  const distance = distanceMeters(fix, watch.gate);

  if (distance > TRIGGER_RADIUS_M) {
    const pending = watch.inZone && !watch.spent ? watch.minFix : null;
    const pendingDistance = watch.minDistance;

    // Fuori zona: la sorveglianza si riarma per il prossimo passaggio.
    watch.inZone = false;
    watch.spent = false;
    watch.minDistance = Infinity;
    watch.minFix = null;

    // Ma se stavamo sorvegliando un avvicinamento, l'uscita dalla zona *è*
    // il transito, ed è la conferma più forte possibile di esserci allontanati.
    // Senza questo ramo i varchi verrebbero mancati alle alte velocità: a
    // 145 km/h si percorrono 40 m per fix, quindi il primo fix dopo il punto
    // di minimo può già trovarsi oltre il raggio di trigger.
    if (pending) {
      return passFrom(watch, pending, pendingDistance);
    }
    return null;
  }

  if (!watch.inZone) {
    watch.inZone = true;
    watch.minDistance = distance;
    watch.minFix = fix;
    return null;
  }

  if (watch.spent) return null;

  if (distance < watch.minDistance) {
    watch.minDistance = distance;
    watch.minFix = fix;
    return null;
  }

  // La distanza sta risalendo: se il riallontanamento è netto, il varco è
  // stato superato nel punto di minimo.
  if (distance > watch.minDistance + PASS_CONFIRM_M && watch.minFix) {
    watch.spent = true;
    return passFrom(watch, watch.minFix, watch.minDistance);
  }

  return null;
}

function passFrom(watch: GateWatch, minFix: Fix, minDistance: number): PassEvent {
  return {
    gateId: watch.gate.id!,
    gateName: watch.gate.name,
    t: minFix.t,
    speedKmh: minFix.speedKmh,
    distanceM: minDistance,
    lat: minFix.lat,
    lon: minFix.lon,
  };
}

/**
 * Distanza percorsa fra due fix, ignorando gli spostamenti sotto la soglia
 * di rumore: da fermo il GPS deriva di qualche metro e senza questo filtro
 * un'auto in coda accumulerebbe chilometri fantasma.
 */
export function travelledBetween(a: Fix, b: Fix): number {
  const d = distanceMeters(a, b);
  return d < noiseFloorFor(b.accuracy) ? 0 : d;
}

function openSegment(pass: PassEvent, gate: Gate, currentFix: Fix) {
  // Il transito viene confermato uno o due fix dopo il punto di minimo: a
  // 145 km/h sono già 40-80 m percorsi. Il cronometro parte dall'istante del
  // transito, quindi anche i metri devono partire da lì, altrimenti la media
  // resta stabilmente sotto quella reale.
  const alreadyTravelled = distanceMeters({ lat: pass.lat, lon: pass.lon }, currentFix);

  activeSegment.value = {
    fromGateId: pass.gateId,
    fromGateName: pass.gateName,
    startedAt: pass.t,
    distanceM: alreadyTravelled,
    speedLimit: gate.speedLimit,
    entrySpeedKmh: pass.speedKmh,
  };

  const elapsedS = (currentFix.t - pass.t) / 1000;
  averageSpeed.value = elapsedS > 0 ? (alreadyTravelled / elapsedS) * 3.6 : null;
}

function closeSegment(pass: PassEvent, segment: ActiveSegment, currentFix: Fix) {
  // Il transito viene confermato dopo il punto di minimo, quindi `distanceM`
  // contiene già i metri percorsi *oltre* il varco d'uscita, mentre il
  // cronometro si ferma all'istante del transito. Senza questo scorporo la
  // media risulterebbe sistematicamente più alta di quella reale (a 150 km/h
  // sono ~40 m di troppo su una tratta cronometrata al secondo).
  const overshoot = distanceMeters({ lat: pass.lat, lon: pass.lon }, currentFix);
  const distanceM = Math.max(0, segment.distanceM - overshoot);

  const elapsedS = (pass.t - segment.startedAt) / 1000;
  const averageKmh = elapsedS > 0 ? (distanceM / elapsedS) * 3.6 : 0;

  lastCompleted.value = {
    ...segment,
    distanceM,
    toGateId: pass.gateId,
    toGateName: pass.gateName,
    endedAt: pass.t,
    averageKmh,
  };
}

function onFix(fix: Fix) {
  // 1. Accumula la distanza percorsa sulla tratta in corso.
  const segment = activeSegment.peek();
  if (segment && prevFix) {
    const distanceM = segment.distanceM + travelledBetween(prevFix, fix);
    activeSegment.value = { ...segment, distanceM };
    const elapsedS = (fix.t - segment.startedAt) / 1000;
    averageSpeed.value = elapsedS > 0 ? (distanceM / elapsedS) * 3.6 : 0;
  }
  prevFix = fix;

  // 2. Cerca un transito sotto uno dei varchi censiti.
  for (const watch of watches) {
    const pass = detectPass(watch, fix);
    if (!pass) continue;

    lastPass.value = pass;
    const current = activeSegment.peek();

    // Il varco che chiude una tratta apre subito la successiva: le tratte
    // Tutor sono concatenate, l'uscita di una è l'ingresso dell'altra.
    if (current && current.fromGateId !== pass.gateId) {
      closeSegment(pass, current, fix);
    }
    openSegment(pass, watch.gate, fix);
  }
}

/** Azzera tratta in corso e sorveglianza (all'avvio/arresto del tracking). */
export function resetTutorEngine() {
  activeSegment.value = null;
  averageSpeed.value = null;
  lastPass.value = null;
  lastCompleted.value = null;
  prevFix = null;
  for (const watch of watches) {
    watch.inZone = false;
    watch.spent = false;
    watch.minDistance = Infinity;
    watch.minFix = null;
  }
}

/**
 * Aggancia il motore al flusso dei fix GPS. Ritorna la funzione di rilascio.
 * Il motore consuma `lastFix`, quindi resta naturalmente inattivo quando il
 * tracking è fermo.
 */
export function startTutorEngine(): () => void {
  dispose?.();
  dispose = effect(() => {
    const fix = lastFix.value;
    // `untracked` è obbligatorio: dentro `onFix` si leggono e si riscrivono
    // gli stessi signal, e senza isolamento l'effect si auto-invaliderebbe
    // ("Cycle detected"), interrompendo l'elaborazione a metà. `batch` evita
    // inoltre i render intermedi sui più signal aggiornati insieme.
    if (fix) untracked(() => batch(() => onFix(fix)));
  });
  return () => {
    dispose?.();
    dispose = null;
  };
}
