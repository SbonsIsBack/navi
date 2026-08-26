import { useState } from 'preact/hooks';
import { captureCurrentPosition } from '@/lib/gps';
import { upsertGate, CLONE_RADIUS_M } from '@/lib/gates';

interface Props {
  onSaved: () => void;
}

type Phase = 'idle' | 'capturing';

/**
 * Il metodo di inserimento principale: si preme fisicamente passando sotto il
 * varco. Deve essere enorme e centrato — si preme guidando, senza guardare.
 */
export function GateCapture({ onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const capture = async () => {
    if (phase === 'capturing') return;
    setPhase('capturing');
    setMessage(null);
    try {
      const point = await captureCurrentPosition();
      const result = await upsertGate({
        lat: point.lat,
        lon: point.lon,
        accuracy: point.accuracy,
        source: 'gps',
      });

      // Feedback tattile: conferma la cattura senza dover guardare lo schermo.
      navigator.vibrate?.(result.merged ? [30, 60, 30] : 60);

      setMessage(
        result.merged
          ? {
              text: `Riconosciuto «${result.gate.name}» a ${result.distance!.toFixed(1)} m: posizione aggiornata (${result.gate.samples} rilevazioni).`,
              kind: 'ok',
            }
          : { text: `Nuovo varco salvato: «${result.gate.name}».`, kind: 'ok' },
      );
      onSaved();
    } catch (err) {
      setMessage({ text: (err as Error).message, kind: 'err' });
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div class="capture">
      <button
        type="button"
        class="capture__btn"
        data-phase={phase}
        onClick={capture}
        disabled={phase === 'capturing'}
      >
        <span class="capture__icon" aria-hidden="true">◎</span>
        <span class="capture__label">
          {phase === 'capturing' ? 'RILEVO…' : 'SONO SOTTO IL VARCO'}
        </span>
      </button>
      <p class="capture__hint">
        Premi passando sotto il Tutor. Entro {CLONE_RADIUS_M} m da un varco già
        censito la posizione viene affinata invece di crearne un doppione.
      </p>
      {message && (
        <p class="capture__msg" data-kind={message.kind} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
