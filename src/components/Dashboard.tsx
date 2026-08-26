import { useEffect } from 'preact/hooks';
import { THEMES, themeId, applyThemeToDocument } from '@/lib/themes';
import { MAX_SPEED, smoothSpeed, startSpeedLoop, stopSpeedLoop } from '@/lib/speed';
import { ThemeSwitcher } from './ThemeSwitcher';
import { MockControls } from './MockControls';

/** Island principale: tachimetro a tema, media (Fase 5) e controlli mock. */
export default function Dashboard() {
  useEffect(() => {
    startSpeedLoop();
    return stopSpeedLoop;
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeId.value);
  }, [themeId.value]);

  const { Speedometer } = THEMES[themeId.value];

  return (
    <div class="dashboard">
      <header class="dashboard__header">
        <span class="dashboard__brand">NAVI</span>
        <ThemeSwitcher />
      </header>

      <main class="dashboard__main">
        <Speedometer speed={smoothSpeed.value} max={MAX_SPEED} />
        {/* Slot velocità media: si attiva col motore Tutor della Fase 5. */}
        <div class="avg-slot" aria-label="Velocità media">
          <span class="avg-slot__label">MEDIA TUTOR</span>
          <span class="avg-slot__value">—</span>
        </div>
      </main>

      <MockControls />
    </div>
  );
}
