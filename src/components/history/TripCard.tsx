import { useState } from 'preact/hooks';
import type { TripDetail } from '@/lib/history';
import { deleteTrip } from '@/lib/history';

const clock = (t: number) =>
  new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

const clockSec = (t: number) =>
  new Date(t).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/**
 * Durata leggibile. Sotto il minuto mostra i secondi: una tratta fra due
 * varchi vicini dura poche decine di secondi e arrotondarla a "0m" la
 * farebbe sembrare un errore.
 */
function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface Props {
  detail: TripDetail;
  onChanged: () => void;
  /** Nella vista per percorsi la sequenza dei varchi è già nel titolo. */
  showRoute?: boolean;
}

/** Una riga di viaggio, espandibile su checkpoint e tratte. */
export function TripCard({ detail, onChanged, showRoute = true }: Props) {
  const [open, setOpen] = useState(false);
  const { trip, checkpoints, segments } = detail;
  const endedAt = trip.endedAt ?? trip.startedAt;

  return (
    <article class="trip" data-open={open}>
      <button type="button" class="trip__head" onClick={() => setOpen(!open)}>
        <span class="trip__time">
          {clock(trip.startedAt)} → {clock(endedAt)}
        </span>
        <span class="trip__stats">
          {(trip.distanceM / 1000).toFixed(1)} km · {duration(endedAt - trip.startedAt)} ·
          max {Math.round(trip.maxSpeedKmh)}
        </span>
        {showRoute && trip.routeKey && <span class="trip__route">{trip.routeKey}</span>}
        <span class="trip__badges">
          {checkpoints.length > 0 && (
            <span class="trip__badge">{checkpoints.length} varchi</span>
          )}
          {segments.length > 0 && (
            <span class="trip__badge">{segments.length} tratte</span>
          )}
          <span class="trip__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      {open && (
        <div class="trip__body">
          {segments.length > 0 && (
            <>
              <h4>Tratte Tutor</h4>
              <ul class="trip__segments">
                {segments.map((s) => {
                  const over = s.speedLimit != null && s.averageKmh > s.speedLimit;
                  return (
                    <li key={s.id} data-over={over}>
                      <span class="trip__seg-route">
                        {s.fromGateName} → {s.toGateName}
                      </span>
                      <span class="trip__seg-avg">
                        media <strong>{Math.round(s.averageKmh)}</strong> km/h
                        {s.speedLimit != null && ` · limite ${s.speedLimit}`}
                      </span>
                      <span class="trip__seg-meta">
                        {(s.distanceM / 1000).toFixed(2)} km ·{' '}
                        {duration(s.endedAt - s.startedAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {checkpoints.length > 0 ? (
            <>
              <h4>Passaggi sotto i varchi</h4>
              <ul class="trip__checkpoints">
                {checkpoints.map((c) => (
                  <li key={c.id}>
                    <span class="trip__cp-time">{clockSec(c.t)}</span>
                    <span class="trip__cp-gate">{c.gateName}</span>
                    <span class="trip__cp-speed">{Math.round(c.speedKmh)} km/h</span>
                    <span class="trip__cp-offset">±{Math.round(c.offsetM)} m</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p class="trip__empty">Nessun varco attraversato in questo viaggio.</p>
          )}

          <button
            type="button"
            class="trip__delete"
            onClick={async () => {
              await deleteTrip(trip.id!);
              onChanged();
            }}
          >
            Elimina viaggio
          </button>
        </div>
      )}
    </article>
  );
}
