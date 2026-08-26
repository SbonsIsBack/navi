/**
 * Display a 7 segmenti disegnato in SVG: nessun font esterno da scaricare,
 * quindi resa identica ovunque e pienamente offline. Ogni cifra vive in un
 * viewBox 56×100; i segmenti spenti restano visibili come "ghost" (estetica
 * dei cruscotti LCD anni '90).
 */

type SegmentName = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

const SEGMENT_POINTS: Record<SegmentName, string> = {
  a: '2,0 54,0 46,10 10,10',
  b: '56,2 56,48 46,43 46,12',
  c: '56,52 56,98 46,88 46,57',
  d: '10,90 46,90 54,100 2,100',
  e: '0,52 10,57 10,88 0,98',
  f: '0,2 10,12 10,43 0,48',
  g: '4,50 11,45 45,45 52,50 45,55 11,55',
};

const DIGIT_SEGMENTS: Record<string, SegmentName[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
  ' ': [],
};

interface DigitProps {
  /** '0'-'9', '-' oppure ' ' (tutti i segmenti spenti). */
  char: string;
}

export function SevenSegmentDigit({ char }: DigitProps) {
  const lit = new Set(DIGIT_SEGMENTS[char] ?? []);
  return (
    <svg viewBox="0 0 56 100" class="sseg-digit" aria-hidden="true">
      <g transform="skewX(-4)" transform-origin="28 50">
        {(Object.keys(SEGMENT_POINTS) as SegmentName[]).map((name) => (
          <polygon
            key={name}
            points={SEGMENT_POINTS[name]}
            class={lit.has(name) ? 'sseg-on' : 'sseg-off'}
          />
        ))}
      </g>
    </svg>
  );
}

interface NumberProps {
  value: number;
  digits?: number;
}

export function SevenSegmentNumber({ value, digits = 3 }: NumberProps) {
  const text = String(Math.max(0, Math.round(value))).padStart(digits, ' ').slice(-digits);
  return (
    <div class="sseg-number">
      {[...text].map((ch, i) => (
        <SevenSegmentDigit char={ch} key={i} />
      ))}
    </div>
  );
}
