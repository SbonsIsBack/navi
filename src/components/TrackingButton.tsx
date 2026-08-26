import { gpsStatus, startGps, stopGps, isGpsRunning } from '@/lib/gps';
import { requestWakeLock, releaseWakeLock } from '@/lib/wakelock';

/** Avvio/arresto del tracking. Pollice-raggiungibile, stato sempre esplicito. */
export function TrackingButton() {
  const status = gpsStatus.value;
  const running = status === 'requesting' || status === 'active' || status === 'error';
  // Solo l'assenza dell'API è definitiva: dopo un rifiuto l'utente può
  // concedere il permesso dalle impostazioni del browser e riprovare.
  const blocked = status === 'unavailable';

  const toggle = () => {
    if (isGpsRunning()) {
      stopGps();
      void releaseWakeLock();
    } else {
      startGps();
      void requestWakeLock();
    }
  };

  return (
    <button
      type="button"
      class={running ? 'track-btn track-btn--on' : 'track-btn'}
      onClick={toggle}
      disabled={blocked}
    >
      {blocked
        ? 'GPS NON DISPONIBILE'
        : running
          ? 'FERMA TRACKING'
          : status === 'denied'
            ? 'RIPROVA'
            : 'AVVIA TRACKING'}
    </button>
  );
}
