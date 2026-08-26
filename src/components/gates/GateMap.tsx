import { useEffect, useRef, useState } from 'preact/hooks';
import type { Gate } from '@/lib/db';
import { CLONE_RADIUS_M } from '@/lib/gates';
import { captureCurrentPosition } from '@/lib/gps';
import 'leaflet/dist/leaflet.css';

interface Props {
  gates: Gate[];
  selected: { lat: number; lon: number } | null;
  onPick: (point: { lat: number; lon: number }) => void;
}

const DEFAULT_CENTER: [number, number] = [41.9, 12.5]; // Italia
const DEFAULT_ZOOM = 6;
const PICK_ZOOM = 17;

/**
 * Mappa interattiva per posizionare un varco con un tocco.
 *
 * Leaflet è caricato dinamicamente: pesa più di tutto il resto dell'app e non
 * deve gravare sul tachimetro, che è la schermata che si apre in auto.
 * I marker sono `circleMarker`, non icone PNG: nessun asset esterno da
 * risolvere, quindi la mappa si comporta bene anche offline.
 */
export function GateMap({ gates, selected, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const gateLayerRef = useRef<any>(null);
  const pickLayerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [tilesOffline, setTilesOffline] = useState(false);

  // Init: una sola volta, con import dinamico della libreria.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      });
      mapRef.current = map;

      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      });
      tiles.on('tileerror', () => setTilesOffline(true));
      tiles.on('tileload', () => setTilesOffline(false));
      tiles.addTo(map);

      gateLayerRef.current = L.layerGroup().addTo(map);
      pickLayerRef.current = L.layerGroup().addTo(map);

      map.on('click', (e: any) => {
        onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
      });

      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Ridisegna i varchi esistenti a ogni cambiamento della lista.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = gateLayerRef.current;
    if (!ready || !L || !layer) return;

    layer.clearLayers();
    for (const gate of gates) {
      L.circleMarker([gate.lat, gate.lon], {
        radius: 7,
        color: '#2ee6a6',
        fillColor: '#2ee6a6',
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindTooltip(`${gate.name} · ${gate.samples} ril.`)
        .addTo(layer);

      // Il raggio di normalizzazione, in scala reale: rende visibile perché
      // un nuovo punto vicino verrà assorbito invece di creare un clone.
      L.circle([gate.lat, gate.lon], {
        radius: CLONE_RADIUS_M,
        color: '#2ee6a6',
        weight: 1,
        opacity: 0.5,
        fillOpacity: 0.08,
      }).addTo(layer);
    }
  }, [gates, ready]);

  // Marker del punto scelto.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = pickLayerRef.current;
    if (!ready || !L || !layer) return;

    layer.clearLayers();
    if (selected) {
      L.circleMarker([selected.lat, selected.lon], {
        radius: 9,
        color: '#ffc23d',
        fillColor: '#ffc23d',
        fillOpacity: 0.9,
        weight: 3,
      }).addTo(layer);
    }
  }, [selected, ready]);

  const centerOnMe = async () => {
    try {
      const p = await captureCurrentPosition();
      mapRef.current?.setView([p.lat, p.lon], PICK_ZOOM);
    } catch {
      // Senza posizione la mappa resta dov'è: nessun errore bloccante.
    }
  };

  return (
    <div class="gate-map">
      <div class="gate-map__canvas" ref={containerRef} />
      <div class="gate-map__bar">
        <button type="button" onClick={centerOnMe}>
          Centra su di me
        </button>
        <span class="gate-map__coords">
          {selected
            ? `${selected.lat.toFixed(6)}, ${selected.lon.toFixed(6)}`
            : 'Tocca la mappa per scegliere il punto'}
        </span>
      </div>
      {tilesOffline && (
        <p class="gate-map__offline">
          Mappa offline: le tile non ancora visitate non sono disponibili, ma puoi
          comunque toccare per scegliere le coordinate.
        </p>
      )}
    </div>
  );
}
