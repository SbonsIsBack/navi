import { useEffect, useState } from 'preact/hooks';
import type { Gate } from '@/lib/db';
import { listGates } from '@/lib/gates';
import { themeId, applyThemeToDocument } from '@/lib/themes';
import { GateCapture } from './GateCapture';
import { GateManualForm } from './GateManualForm';
import { GateList } from './GateList';
import { GateMap } from './GateMap';
import { url } from '@/lib/paths';

type Method = 'capture' | 'manual' | 'map';

const TABS: { id: Method; label: string }[] = [
  { id: 'capture', label: 'Cattura GPS' },
  { id: 'manual', label: 'Coordinate' },
  { id: 'map', label: 'Mappa' },
];

/** Pagina di censimento varchi: i tre metodi di inserimento più l'elenco. */
export default function GatesPage() {
  const [method, setMethod] = useState<Method>('capture');
  const [gates, setGates] = useState<Gate[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);

  const reload = async () => setGates(await listGates());

  useEffect(() => {
    void reload();
    applyThemeToDocument(themeId.value);
  }, []);

  return (
    <div class="gates">
      <header class="gates__header">
        <a class="gates__back" href={url('/')} aria-label="Torna al tachimetro">
          ‹
        </a>
        <h1>Varchi Tutor</h1>
        <span class="gates__count">{gates.length}</span>
      </header>

      <nav class="gates__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={method === tab.id}
            class={method === tab.id ? 'gates__tab gates__tab--on' : 'gates__tab'}
            onClick={() => setMethod(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section class="gates__panel">
        {method === 'capture' && <GateCapture onSaved={reload} />}
        {method === 'manual' && <GateManualForm onSaved={reload} preset={null} />}
        {method === 'map' && (
          <>
            <GateMap gates={gates} selected={picked} onPick={setPicked} />
            <GateManualForm onSaved={reload} preset={picked} />
          </>
        )}
      </section>

      <section class="gates__saved">
        <h2>Varchi censiti</h2>
        <GateList gates={gates} onChanged={reload} />
      </section>
    </div>
  );
}
