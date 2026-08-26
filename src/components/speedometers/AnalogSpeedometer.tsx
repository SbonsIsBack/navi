import type { SpeedometerProps } from '@/lib/themes';

const CX = 200;
const CY = 200;
const START_ANGLE = 135; // gradi schermo (0 = destra, senso orario)
const SWEEP = 270;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function angleFor(speed: number, max: number) {
  return START_ANGLE + SWEEP * Math.min(1, Math.max(0, speed / max));
}

/** Tema Analogico: quadrante classico con lancetta fluida. */
export function AnalogSpeedometer({ speed, max }: SpeedometerProps) {
  const needleAngle = angleFor(speed, max);

  const ticks = [];
  for (let v = 0; v <= max; v += 10) {
    const a = angleFor(v, max);
    const major = v % 20 === 0;
    const [x1, y1] = polar(major ? 150 : 158, a);
    const [x2, y2] = polar(168, a);
    ticks.push(
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        class={major ? 'tick tick--major' : 'tick'}
        key={v}
      />,
    );
    if (v % 40 === 0) {
      const [lx, ly] = polar(126, a);
      ticks.push(
        <text x={lx} y={ly} class="dial-label" key={`l${v}`}>
          {v}
        </text>,
      );
    }
  }

  return (
    <div class="speedo speedo--analog">
      <svg viewBox="0 0 400 400" role="img" aria-label={`${Math.round(speed)} chilometri orari`}>
        <circle cx={CX} cy={CY} r="190" class="dial-face" />
        <circle cx={CX} cy={CY} r="176" class="dial-rim" />
        {ticks}
        <text x={CX} y="300" class="dial-unit">
          km/h
        </text>
        {/* La punta del poligono a riposo guarda a sinistra (180°): compenso. */}
        <g
          style={{
            transform: `rotate(${needleAngle - 180}deg)`,
            transformOrigin: '200px 200px',
          }}
        >
          <polygon points="200,192 200,208 40,200" class="needle" />
          <polygon points="200,195 200,205 260,200" class="needle-tail" />
        </g>
        <circle cx={CX} cy={CY} r="12" class="needle-hub" />
      </svg>
      <div class="analog-readout">{Math.round(speed)}</div>
    </div>
  );
}
