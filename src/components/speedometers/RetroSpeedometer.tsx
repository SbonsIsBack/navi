import type { SpeedometerProps } from '@/lib/themes';
import { SevenSegmentNumber } from './SevenSegment';

const SEGMENTS = 28;
const CX = 200;
const CY = 205;
const R_IN = 138;
const R_OUT = 172;
const START_ANGLE = 180; // arco superiore, da sinistra a destra
const SWEEP = 180;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** Tema Retro Digital Dashboard: barrette verdi luminescenti + numero 7-seg. */
export function RetroSpeedometer({ speed, max }: SpeedometerProps) {
  const litCount = Math.round((Math.min(1, speed / max)) * SEGMENTS);

  const bars = [];
  for (let i = 0; i < SEGMENTS; i++) {
    // Piccolo gap angolare tra una barretta e l'altra.
    const a0 = START_ANGLE + (SWEEP / SEGMENTS) * i + 1.2;
    const a1 = START_ANGLE + (SWEEP / SEGMENTS) * (i + 1) - 1.2;
    const [x1, y1] = polar(R_OUT, a0);
    const [x2, y2] = polar(R_OUT, a1);
    const [x3, y3] = polar(R_IN, a1);
    const [x4, y4] = polar(R_IN, a0);
    bars.push(
      <polygon
        key={i}
        points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
        class={i < litCount ? 'retro-bar retro-bar--on' : 'retro-bar'}
      />,
    );
  }

  return (
    <div class="speedo speedo--retro" role="img" aria-label={`${Math.round(speed)} chilometri orari`}>
      <svg viewBox="0 0 400 230" class="retro-arc" aria-hidden="true">
        {bars}
        <text x="32" y="222" class="retro-scale">0</text>
        <text x="368" y="222" class="retro-scale retro-scale--end">{max}</text>
      </svg>
      <div class="retro-readout">
        <SevenSegmentNumber value={speed} digits={3} />
        <div class="retro-unit">km/h</div>
      </div>
    </div>
  );
}
