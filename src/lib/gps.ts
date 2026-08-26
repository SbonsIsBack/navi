import { signal } from '@preact/signals';
import { db, type Fix } from '@/lib/db';
import { distanceMeters, MS_TO_KMH } from '@/lib/geo';
import { rawSpeed, speedSource } from '@/lib/speed';

export type GpsStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'error';

export const gpsStatus = signal<GpsStatus>('idle');
export const gpsError = signal<string | null>(null);
export const lastFix = signal<Fix | null>(null);
/** `true` quando l'ultimo fix è troppo vecchio (galleria, cielo coperto). */
export const gpsStale = signal(false);
/** Fix scartati dai filtri di qualità: utile in diagnostica. */
export const rejectedFixes = signal(0);

/** ---- Soglie dei filtri di qualità ---- */
const FILTERS = {
  /** Oltre questa incertezza il fix è inutilizzabile. */
  maxAccuracyM: 100,
  /** Velocità oltre la quale il fix è un salto GPS, non un'auto. */
  maxPlausibleKmh: 400,
  /** Sotto questa soglia consideriamo il veicolo fermo (dato Doppler). */
  stationaryKmh: 1.5,
  /** Intervallo minimo tra due fix per derivare una velocità sensata. */
  minDeltaS: 0.2,
  /** Oltre questo silenzio il segnale è considerato perso. */
  staleAfterS: 5,
};

/**
 * Soglia sotto la quale uno spostamento è rumore e non movimento reale.
 * Esportata perché il motore Tutor deve integrare le distanze con lo stesso
 * criterio con cui qui si decide che il veicolo è fermo.
 */
export function noiseFloorFor(accuracy: number): number {
  const acc = accuracy > 0 ? accuracy : FILTERS.maxAccuracyM;
  return Math.max(3, acc * 0.5);
}

let watchId: number | null = null;
let staleTimer: number | null = null;
let prev: { lat: number; lon: number; t: number } | null = null;
/** Ultime 3 letture per il filtro mediano anti-picco. */
const window3: number[] = [];

function median3(value: number): number {
  window3.push(value);
  if (window3.length > 3) window3.shift();
  const sorted = [...window3].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function resetFilters() {
  prev = null;
  window3.length = 0;
}

/**
 * Ricava la velocità in km/h da un fix.
 *
 * Preferiamo `coords.speed`: è calcolata dal chip GNSS via effetto Doppler,
 * quindi è molto più stabile della derivata delle posizioni. Quando manca
 * (desktop, alcuni browser) la deriviamo dalla distanza percorsa, con una
 * soglia legata all'accuratezza per non scambiare il drift del GPS da fermo
 * per movimento reale.
 *
 * Ritorna `null` se il fix va scartato.
 */
function speedFromFix(pos: GeolocationPosition): { kmh: number; doppler: boolean } | null {
  const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
  const t = pos.timestamp;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (accuracy != null && accuracy > FILTERS.maxAccuracyM) return null;

  const acc = accuracy ?? FILTERS.maxAccuracyM;
  let candidate: number;
  let doppler: boolean;

  if (speed != null && Number.isFinite(speed) && speed >= 0) {
    candidate = speed * MS_TO_KMH;
    doppler = true;
    if (candidate < FILTERS.stationaryKmh) candidate = 0;
  } else if (prev) {
    const dt = (t - prev.t) / 1000;
    if (dt < FILTERS.minDeltaS) return null;
    const dist = distanceMeters(prev, { lat, lon });
    // Uno spostamento più piccolo dell'incertezza della misura è rumore,
    // non movimento: da fermo il GPS "cammina" di qualche metro.
    const noiseFloor = noiseFloorFor(acc);
    candidate = dist < noiseFloor ? 0 : (dist / dt) * MS_TO_KMH;
    doppler = false;
  } else {
    // Primo fix: serve solo a inizializzare il riferimento.
    prev = { lat, lon, t };
    return null;
  }

  prev = { lat, lon, t };
  if (candidate > FILTERS.maxPlausibleKmh) return null;
  return { kmh: candidate, doppler };
}

function markFresh() {
  gpsStale.value = false;
  if (staleTimer !== null) clearTimeout(staleTimer);
  staleTimer = window.setTimeout(() => {
    gpsStale.value = true;
  }, FILTERS.staleAfterS * 1000);
}

function onPosition(pos: GeolocationPosition) {
  gpsStatus.value = 'active';
  gpsError.value = null;
  markFresh();

  const derived = speedFromFix(pos);
  if (!derived) {
    rejectedFixes.value++;
    return;
  }

  const kmh = median3(derived.kmh);
  const fix: Fix = {
    t: pos.timestamp,
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    speedKmh: kmh,
    accuracy: pos.coords.accuracy ?? -1,
    heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
    altitude: Number.isFinite(pos.coords.altitude) ? pos.coords.altitude : null,
    doppler: derived.doppler,
  };

  lastFix.value = fix;
  if (speedSource.value === 'gps') rawSpeed.value = kmh;

  // Persistenza best-effort: un errore di scrittura non deve fermare il tracking.
  db.fixes.add(fix).catch(() => {});
}

function onError(err: GeolocationPositionError) {
  if (err.code === err.PERMISSION_DENIED) {
    gpsStatus.value = 'denied';
    gpsError.value =
      'Permesso negato. Abilita la posizione nelle impostazioni del browser, poi riprova.';
    stopGps();
    return;
  }
  // TIMEOUT e POSITION_UNAVAILABLE sono transitori: il watch resta attivo.
  gpsStatus.value = 'error';
  gpsError.value =
    err.code === err.TIMEOUT
      ? 'Nessun fix GPS: segnale debole.'
      : 'Posizione non disponibile.';
}

/** Avvia il tracking GPS e dirotta la UI sulla sorgente reale. */
export function startGps(): void {
  if (watchId !== null) return;
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    gpsStatus.value = 'unavailable';
    gpsError.value = 'Geolocalizzazione non supportata da questo browser.';
    return;
  }

  resetFilters();
  gpsStatus.value = 'requesting';
  gpsError.value = null;
  speedSource.value = 'gps';
  rawSpeed.value = 0;

  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  });
}

/** Ferma il tracking e riporta la UI alla sorgente mock. */
export function stopGps(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (staleTimer !== null) {
    clearTimeout(staleTimer);
    staleTimer = null;
  }
  resetFilters();
  gpsStale.value = false;
  if (gpsStatus.value !== 'denied' && gpsStatus.value !== 'unavailable') {
    gpsStatus.value = 'idle';
  }
  speedSource.value = 'mock';
  rawSpeed.value = 0;
}

export function isGpsRunning(): boolean {
  return watchId !== null;
}

export interface CapturedPoint {
  lat: number;
  lon: number;
  accuracy: number;
  t: number;
}

/** Un fix più vecchio di così non descrive più dove siamo adesso. */
const CAPTURE_MAX_AGE_MS = 3000;

/**
 * Scatto istantaneo della posizione, per il pulsante di cattura sotto il varco.
 *
 * Se il tracking è già attivo riusa l'ultimo fix (immediato, nessuna attesa
 * mentre si passa a 130 km/h); altrimenti chiede una posizione una tantum.
 */
export function captureCurrentPosition(): Promise<CapturedPoint> {
  const fix = lastFix.value;
  if (fix && Date.now() - fix.t < CAPTURE_MAX_AGE_MS) {
    return Promise.resolve({
      lat: fix.lat,
      lon: fix.lon,
      accuracy: fix.accuracy,
      t: fix.t,
    });
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocalizzazione non supportata da questo browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? -1,
          t: pos.timestamp,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Permesso di posizione negato.'
              : 'Posizione non disponibile: segnale assente.',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  });
}
