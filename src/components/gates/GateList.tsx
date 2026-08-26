import { useState } from 'preact/hooks';
import type { Gate } from '@/lib/db';
import { deleteGate, updateGate } from '@/lib/gates';

interface Props {
  gates: Gate[];
  onChanged: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  gps: 'cattura GPS',
  manual: 'coordinate',
  map: 'mappa',
};

function GateRow({ gate, onChanged }: { gate: Gate; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(gate.name);
  const [limit, setLimit] = useState(gate.speedLimit?.toString() ?? '');

  const save = async () => {
    const parsed = Number(limit.trim().replace(',', '.'));
    await updateGate(gate.id!, {
      name: name.trim() || gate.name,
      speedLimit: limit.trim() && Number.isFinite(parsed) ? parsed : null,
    });
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    await deleteGate(gate.id!);
    onChanged();
  };

  return (
    <li class="gate-item">
      {editing ? (
        <div class="gate-item__edit">
          <input
            type="text"
            value={name}
            aria-label="Nome varco"
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <input
            type="text"
            inputMode="numeric"
            value={limit}
            placeholder="limite km/h"
            aria-label="Limite di velocità"
            onInput={(e) => setLimit(e.currentTarget.value)}
          />
          <div class="gate-item__actions">
            <button type="button" onClick={save}>Salva</button>
            <button type="button" onClick={() => setEditing(false)}>Annulla</button>
          </div>
        </div>
      ) : (
        <>
          <div class="gate-item__main">
            <strong class="gate-item__name">{gate.name}</strong>
            <span class="gate-item__coords">
              {gate.lat.toFixed(6)}, {gate.lon.toFixed(6)}
            </span>
            <span class="gate-item__meta">
              {gate.samples} ril. · ±{Math.round(gate.bestAccuracy)} m ·{' '}
              {SOURCE_LABEL[gate.source] ?? gate.source}
              {gate.speedLimit != null && ` · limite ${gate.speedLimit} km/h`}
            </span>
          </div>
          <div class="gate-item__actions">
            <button type="button" onClick={() => setEditing(true)}>Modifica</button>
            <button type="button" class="danger" onClick={remove}>Elimina</button>
          </div>
        </>
      )}
    </li>
  );
}

export function GateList({ gates, onChanged }: Props) {
  if (gates.length === 0) {
    return <p class="gate-empty">Nessun varco censito. Usa uno dei tre metodi qui sopra.</p>;
  }

  return (
    <ul class="gate-list">
      {gates.map((gate) => (
        <GateRow key={gate.id} gate={gate} onChanged={onChanged} />
      ))}
    </ul>
  );
}
