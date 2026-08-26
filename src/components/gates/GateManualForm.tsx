import { useState } from 'preact/hooks';
import { upsertGate } from '@/lib/gates';

interface Props {
  onSaved: () => void;
  /** Coordinate precompilate, es. da un click sulla mappa. */
  preset?: { lat: number; lon: number } | null;
}

/** Parser tollerante: accetta il punto o la virgola come separatore decimale. */
function parseCoord(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Inserimento per coordinate digitate a mano. */
export function GateManualForm({ onSaved, preset }: Props) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Le coordinate scelte sulla mappa hanno la precedenza su quanto digitato.
  const latValue = preset ? preset.lat.toFixed(6) : lat;
  const lonValue = preset ? preset.lon.toFixed(6) : lon;

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setOk(null);

    const latN = parseCoord(latValue);
    const lonN = parseCoord(lonValue);
    if (latN === null || latN < -90 || latN > 90) {
      setError('Latitudine non valida: deve essere tra -90 e 90.');
      return;
    }
    if (lonN === null || lonN < -180 || lonN > 180) {
      setError('Longitudine non valida: deve essere tra -180 e 180.');
      return;
    }

    const limitN = limit.trim() ? parseCoord(limit) : null;
    const result = await upsertGate({
      lat: latN,
      lon: lonN,
      source: preset ? 'map' : 'manual',
      name: name || undefined,
      speedLimit: limitN,
    });

    setOk(
      result.merged
        ? `Coincide con «${result.gate.name}» (${result.distance!.toFixed(1)} m): posizione aggiornata.`
        : `Salvato «${result.gate.name}».`,
    );
    setName('');
    setLat('');
    setLon('');
    setLimit('');
    onSaved();
  };

  return (
    <form class="gate-form" onSubmit={submit}>
      <label class="gate-form__field">
        <span>Nome (opzionale)</span>
        <input
          type="text"
          value={name}
          placeholder="es. A1 km 312 Nord"
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <div class="gate-form__row">
        <label class="gate-form__field">
          <span>Latitudine</span>
          <input
            type="text"
            inputMode="decimal"
            value={latValue}
            placeholder="45.123456"
            onInput={(e) => setLat(e.currentTarget.value)}
          />
        </label>
        <label class="gate-form__field">
          <span>Longitudine</span>
          <input
            type="text"
            inputMode="decimal"
            value={lonValue}
            placeholder="9.123456"
            onInput={(e) => setLon(e.currentTarget.value)}
          />
        </label>
      </div>
      <label class="gate-form__field">
        <span>Limite tratta km/h (opzionale)</span>
        <input
          type="text"
          inputMode="numeric"
          value={limit}
          placeholder="130"
          onInput={(e) => setLimit(e.currentTarget.value)}
        />
      </label>
      <button type="submit" class="gate-form__submit">
        SALVA VARCO
      </button>
      {error && <p class="gate-form__msg" data-kind="err">{error}</p>}
      {ok && <p class="gate-form__msg" data-kind="ok">{ok}</p>}
    </form>
  );
}
