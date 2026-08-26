import { useEffect, useState } from 'preact/hooks';
import {
  loadTrips,
  groupByDay,
  groupByRoute,
  type TripDetail,
} from '@/lib/history';
import { closeOrphanTrips } from '@/lib/recorder';
import { themeId, applyThemeToDocument } from '@/lib/themes';
import { TripCard } from './TripCard';
import { url } from '@/lib/paths';

type View = 'days' | 'routes';

/** Storico viaggi, raggruppabile per giorni o per percorsi ripetuti. */
export default function HistoryPage() {
  const [view, setView] = useState<View>('days');
  const [trips, setTrips] = useState<TripDetail[] | null>(null);

  const reload = async () => setTrips(await loadTrips());

  useEffect(() => {
    applyThemeToDocument(themeId.value);
    // Un viaggio interrotto dalla chiusura dell'app resterebbe "in corso"
    // per sempre: lo si chiude prima di mostrare lo storico.
    void closeOrphanTrips().then(reload);
  }, []);

  const days = trips ? groupByDay(trips) : [];
  const routes = trips ? groupByRoute(trips) : [];
  const totalKm = trips
    ? trips.reduce((sum, t) => sum + t.trip.distanceM, 0) / 1000
    : 0;

  return (
    <div class="history">
      <header class="history__header">
        <a class="history__back" href={url('/')} aria-label="Torna al tachimetro">‹</a>
        <h1>Storico</h1>
        {trips && trips.length > 0 && (
          <span class="history__total">
            {totalKm < 100 ? totalKm.toFixed(1) : totalKm.toFixed(0)} km
          </span>
        )}
      </header>

      <nav class="history__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'days'}
          class={view === 'days' ? 'history__tab history__tab--on' : 'history__tab'}
          onClick={() => setView('days')}
        >
          Giorni
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'routes'}
          class={view === 'routes' ? 'history__tab history__tab--on' : 'history__tab'}
          onClick={() => setView('routes')}
        >
          Percorsi
        </button>
      </nav>

      <section class="history__body">
        {trips === null && <p class="history__empty">Carico…</p>}

        {trips !== null && trips.length === 0 && (
          <p class="history__empty">
            Nessun viaggio registrato. Avvia il tracking dal tachimetro: ogni
            sessione viene salvata qui, con orario e velocità sotto ogni varco.
          </p>
        )}

        {trips !== null &&
          view === 'days' &&
          days.map((day) => (
            <div class="history__group" key={day.key}>
              <div class="history__group-head">
                <h2>{day.label}</h2>
                <span>
                  {day.trips.length} viaggi · {(day.totalDistanceM / 1000).toFixed(1)} km
                </span>
              </div>
              {day.trips.map((detail) => (
                <TripCard key={detail.trip.id} detail={detail} onChanged={reload} />
              ))}
            </div>
          ))}

        {trips !== null &&
          view === 'routes' &&
          routes.map((route) => (
            <div class="history__group" key={route.key}>
              <div class="history__group-head">
                <h2>{route.label}</h2>
                <span>
                  {route.trips.length} viaggi
                  {route.bestAverageKmh !== null &&
                    ` · media da ${Math.round(route.bestAverageKmh)} a ${Math.round(route.worstAverageKmh!)} km/h`}
                  {route.overLimitCount > 0 && ` · ${route.overLimitCount} oltre limite`}
                </span>
              </div>
              {route.trips.map((detail) => (
                <TripCard
                  key={detail.trip.id}
                  detail={detail}
                  onChanged={reload}
                  showRoute={false}
                />
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}
