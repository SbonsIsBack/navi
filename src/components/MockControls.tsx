import { useState } from 'preact/hooks';
import { MAX_SPEED, rawSpeed, demoMode } from '@/lib/speed';

/**
 * Pannello di sviluppo per pilotare la velocità senza GPS (Fase 2).
 * Verrà sostituito/nascosto quando arriverà il provider GPS reale (Fase 3).
 */
export function MockControls() {
  const [open, setOpen] = useState(true);

  return (
    <section class="mock" data-open={open}>
      <button type="button" class="mock__toggle" onClick={() => setOpen(!open)}>
        MOCK VELOCITÀ {open ? '▾' : '▴'}
      </button>
      {open && (
        <div class="mock__body">
          <label class="mock__demo">
            <input
              type="checkbox"
              checked={demoMode.value}
              onChange={(e) => (demoMode.value = e.currentTarget.checked)}
            />
            Demo drive (accelerazioni casuali)
          </label>
          <div class="mock__slider">
            <input
              type="range"
              min="0"
              max={MAX_SPEED}
              step="1"
              value={Math.round(rawSpeed.value)}
              disabled={demoMode.value}
              onInput={(e) => (rawSpeed.value = Number(e.currentTarget.value))}
              aria-label="Velocità simulata"
            />
            <span class="mock__value">{Math.round(rawSpeed.value)} km/h</span>
          </div>
        </div>
      )}
    </section>
  );
}
