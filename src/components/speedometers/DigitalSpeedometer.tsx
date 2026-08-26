import type { SpeedometerProps } from '@/lib/themes';

/** Tema Digitale: numero grande, pulito, minimalista. */
export function DigitalSpeedometer({ speed, max }: SpeedometerProps) {
  const value = Math.round(speed);
  const fraction = Math.min(1, speed / max);

  return (
    <div class="speedo speedo--digital" role="img" aria-label={`${value} chilometri orari`}>
      <div class="digital-value">{value}</div>
      <div class="digital-unit">km/h</div>
      <div class="digital-bar">
        <div class="digital-bar__fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
    </div>
  );
}
