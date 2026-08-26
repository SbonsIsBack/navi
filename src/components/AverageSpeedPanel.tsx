import { useEffect, useState } from 'preact/hooks';
import {
  activeSegment,
  averageSpeed,
  lastPass,
  lastCompleted,
  type CompletedSegment,
} from '@/lib/tutor';

/** Margine sotto il limite entro cui conviene già avvisare. */
const WARN_MARGIN_KMH = 5;

function statusFor(average: number, limit: number | null): 'neutral' | 'ok' | 'warn' | 'over' {
  if (limit == null) return 'neutral';
  if (average > limit) return 'over';
  if (average > limit - WARN_MARGIN_KMH) return 'warn';
  return 'ok';
}

const clock = (t: number) =>
  new Date(t).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  /** Varchi censiti: senza, il motore non ha nulla da sorvegliare. */
  gateCount: number;
}

/**
 * Esito della tratta appena conclusa.
 *
 * Va mostrato anche mentre è già iniziata la tratta successiva: uscendo da un
 * varco ne parte subito un'altra, e senza questo riquadro il numero che conta
 * davvero — la media effettiva sulla tratta appena percorsa — sparirebbe
 * nell'istante in cui viene calcolato.
 */
function CompletedRecap({ done }: { done: CompletedSegment }) {
  const over = done.speedLimit != null && done.averageKmh > done.speedLimit;
  return (
    <div class="avg-recap" data-over={over}>
      <span class="avg-recap__route">
        {done.fromGateName} → {done.toGateName}
      </span>
      <span class="avg-recap__value">
        media <strong>{Math.round(done.averageKmh)}</strong> km/h
        {done.speedLimit != null && ` · limite ${done.speedLimit}`}
      </span>
      <span class="avg-recap__meta">
        {(done.distanceM / 1000).toFixed(2)} km in{' '}
        {formatElapsed(done.endedAt - done.startedAt)}
      </span>
    </div>
  );
}

export function AverageSpeedPanel({ gateCount }: Props) {
  // Il cronometro deve scorrere anche mentre il GPS tace (galleria): senza
  // questo tick si aggiornerebbe solo all'arrivo del fix successivo.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const segment = activeSegment.value;
  const average = averageSpeed.value;
  const pass = lastPass.value;
  const done = lastCompleted.value;

  if (!segment) {
    return (
      <div class="avg" data-status="idle">
        <span class="avg__label">MEDIA TUTOR</span>
        <span class="avg__idle">
          {gateCount === 0
            ? 'Nessun varco censito'
            : `In attesa del varco · ${gateCount} sorvegliati`}
        </span>
        {done && <CompletedRecap done={done} />}
      </div>
    );
  }

  const value = average ?? 0;
  const status = statusFor(value, segment.speedLimit);
  const delta = segment.speedLimit != null ? value - segment.speedLimit : null;

  return (
    <div class="avg" data-status={status}>
      <span class="avg__label">
        MEDIA DA {segment.fromGateName.toUpperCase()}
      </span>

      <div class="avg__readout">
        <span class="avg__value">{Math.round(value)}</span>
        <span class="avg__unit">km/h</span>
      </div>

      {segment.speedLimit != null ? (
        <span class="avg__limit">
          limite {segment.speedLimit} ·{' '}
          <strong>
            {delta! >= 0 ? '+' : '−'}
            {Math.abs(Math.round(delta!))}
          </strong>{' '}
          km/h
        </span>
      ) : (
        <span class="avg__limit avg__limit--none">
          limite non impostato per questa tratta
        </span>
      )}

      <div class="avg__meta">
        <span>{formatElapsed(Date.now() - segment.startedAt)}</span>
        <span>{(segment.distanceM / 1000).toFixed(2)} km</span>
        {pass && pass.gateId === segment.fromGateId && (
          <span>
            transito {clock(pass.t)} a {Math.round(pass.speedKmh)} km/h
          </span>
        )}
      </div>

      {done && <CompletedRecap done={done} />}
    </div>
  );
}
