import { useState } from 'preact/hooks';
import { MAX_SPEED, rawSpeed, demoMode, speedSource } from '@/lib/speed';
import { countFixes, pruneOldFixes } from '@/lib/db';
import { rejectedFixes, dopplerFixes, derivedFixes } from '@/lib/gps';

/**
 * Pannello diagnostico: pilota la velocità senza GPS e mostra lo stato del
 * log offline. Con il GPS attivo i controlli mock si disattivano, così le
 * due sorgenti non possono mai contendersi il tachimetro.
 */
export function MockControls() {
  const [open, setOpen] = useState(false);
  const [fixCount, setFixCount] = useState<number | null>(null);
  const onGps = speedSource.value === 'gps';

  const refreshCount = async () => setFixCount(await countFixes());

  const prune = async () => {
    await pruneOldFixes(7);
    await refreshCount();
  };

  return (
    <section class="mock" data-open={open}>
      <button
        type="button"
        class="mock__toggle"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refreshCount();
        }}
      >
        DIAGNOSTICA {open ? '▾' : '▴'}
      </button>
      {open && (
        <div class="mock__body">
          <p class="mock__hint">
            {onGps
              ? 'Sorgente: GPS. I controlli mock sono disattivati.'
              : 'Sorgente: mock. Avvia il tracking per usare il GPS reale.'}
          </p>
          <label class="mock__demo">
            <input
              type="checkbox"
              checked={demoMode.value}
              disabled={onGps}
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
              disabled={onGps || demoMode.value}
              onInput={(e) => (rawSpeed.value = Number(e.currentTarget.value))}
              aria-label="Velocità simulata"
            />
            <span class="mock__value">{Math.round(rawSpeed.value)} km/h</span>
          </div>
          <div class="mock__source">
            <span>Sorgente velocità in questa sessione:</span>
            <span class="mock__source-counts">
              <strong>{dopplerFixes.value}</strong> doppler ·{' '}
              <strong>{derivedFixes.value}</strong> derivati
            </span>
            {dopplerFixes.value === 0 && derivedFixes.value > 0 && (
              <small>
                Il chip non ha mai fornito la velocità Doppler: nel traffico
                lento il dato derivato può essere letto come 0 km/h.
              </small>
            )}
          </div>

          <div class="mock__db">
            <span>
              Log offline: <strong>{fixCount ?? '…'}</strong> fix
              {rejectedFixes.value > 0 && ` · ${rejectedFixes.value} scartati`}
            </span>
            <span class="mock__db-actions">
              <button type="button" onClick={refreshCount}>
                Aggiorna
              </button>
              <button type="button" onClick={prune}>
                Pota &gt; 7gg
              </button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
