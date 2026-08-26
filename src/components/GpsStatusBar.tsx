import { gpsStatus, gpsStale, gpsError, lastFix } from '@/lib/gps';

const LABELS: Record<string, string> = {
  idle: 'GPS spento',
  requesting: 'Ricerca segnale…',
  active: 'GPS attivo',
  denied: 'Permesso negato',
  unavailable: 'GPS non disponibile',
  error: 'Errore GPS',
};

/** Qualità del fix in base al raggio di incertezza. */
function accuracyClass(accuracy: number): string {
  if (accuracy < 0) return 'unknown';
  if (accuracy <= 10) return 'good';
  if (accuracy <= 30) return 'fair';
  return 'poor';
}

/** Striscia diagnostica compatta: non deve rubare la scena al tachimetro. */
export function GpsStatusBar() {
  const status = gpsStatus.value;
  const fix = lastFix.value;
  const stale = gpsStale.value;

  const state = stale && status === 'active' ? 'stale' : status;
  const quality = fix ? accuracyClass(fix.accuracy) : 'unknown';

  return (
    <div class="gps-bar" data-state={state}>
      <span class="gps-bar__dot" data-quality={quality} aria-hidden="true" />
      <span class="gps-bar__label">
        {stale && status === 'active' ? 'Segnale perso' : LABELS[status]}
      </span>
      {status === 'active' && fix && !stale && (
        <>
          <span class="gps-bar__sep">·</span>
          <span class="gps-bar__metric">±{Math.round(fix.accuracy)} m</span>
          <span class="gps-bar__sep">·</span>
          <span class="gps-bar__metric" title={fix.doppler ? 'Velocità dal chip GNSS' : 'Velocità derivata dalle posizioni'}>
            {fix.doppler ? 'doppler' : 'derivata'}
          </span>
        </>
      )}
      {gpsError.value && status !== 'active' && (
        <span class="gps-bar__error">{gpsError.value}</span>
      )}
    </div>
  );
}
