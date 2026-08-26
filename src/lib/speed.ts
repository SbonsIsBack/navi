import { signal } from '@preact/signals';

/** Fondo scala dei tachimetri (km/h). */
export const MAX_SPEED = 240;

/** Sorgente che alimenta `rawSpeed`. */
export type SpeedSource = 'mock' | 'gps';

/**
 * Sorgente attiva. Il mock scrive `rawSpeed` solo quando vale `'mock'`,
 * il provider GPS solo quando vale `'gps'`: mai entrambe insieme.
 */
export const speedSource = signal<SpeedSource>('mock');

/**
 * Velocità grezza dalla sorgente attiva (km/h): mock (slider / demo drive)
 * oppure provider GPS. Chi la scrive non deve preoccuparsi dello smoothing.
 */
export const rawSpeed = signal(0);

/**
 * Velocità smussata per la UI (km/h): insegue `rawSpeed` con uno smoothing
 * esponenziale a 60fps, così lancetta e numeri si muovono fluidi anche se
 * la sorgente aggiorna a scatti (il GPS emette ~1 fix al secondo).
 */
export const smoothSpeed = signal(0);

/** Mock "demo drive": accelerazioni/frenate simulate per testare la UI. */
export const demoMode = signal(false);

/** Reattività dello smoothing: quota di gap recuperata al secondo (~e^-rate). */
const SMOOTHING_RATE = 5;

/** Parametri della guida simulata. */
const DEMO = {
  accel: 12, // km/h al secondo in accelerazione
  brake: 20, // km/h al secondo in frenata
  minHold: 2, // secondi minimi a velocità di crociera
  maxHold: 7,
};

let rafId: number | null = null;
let lastTs = 0;
let cruiseTarget = 0;
let nextTargetAt = 0;

function tick(ts: number) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;

  if (demoMode.value && speedSource.value === 'mock') {
    if (ts >= nextTargetAt) {
      cruiseTarget = Math.round(Math.random() * MAX_SPEED * 0.85);
      nextTargetAt =
        ts + (DEMO.minHold + Math.random() * (DEMO.maxHold - DEMO.minHold)) * 1000;
    }
    const gap = cruiseTarget - rawSpeed.value;
    const ratePerS = gap >= 0 ? DEMO.accel : DEMO.brake;
    const step = Math.sign(gap) * Math.min(Math.abs(gap), ratePerS * dt);
    rawSpeed.value = Math.max(0, rawSpeed.value + step);
  }

  const alpha = 1 - Math.exp(-SMOOTHING_RATE * dt);
  const next = smoothSpeed.value + (rawSpeed.value - smoothSpeed.value) * alpha;
  // Snap sotto il decimo di km/h per non oscillare all'infinito.
  smoothSpeed.value = Math.abs(next - rawSpeed.value) < 0.05 ? rawSpeed.value : next;

  rafId = requestAnimationFrame(tick);
}

/** Avvia il loop rAF di smoothing/demo. Idempotente. */
export function startSpeedLoop() {
  if (rafId !== null) return;
  lastTs = performance.now();
  nextTargetAt = 0;
  rafId = requestAnimationFrame(tick);
}

export function stopSpeedLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
