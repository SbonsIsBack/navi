import { useEffect } from 'preact/hooks';
import { THEMES, themeId, applyThemeToDocument } from '@/lib/themes';
import { MAX_SPEED, smoothSpeed, startSpeedLoop, stopSpeedLoop } from '@/lib/speed';
import { pruneOldFixes } from '@/lib/db';
import { stopGps } from '@/lib/gps';
import { releaseWakeLock } from '@/lib/wakelock';
import { ThemeSwitcher } from './ThemeSwitcher';
import { MockControls } from './MockControls';
import { GpsStatusBar } from './GpsStatusBar';
import { TrackingButton } from './TrackingButton';

/** Island principale: tachimetro a tema, stato GPS e controlli di tracking. */
export default function Dashboard() {
  useEffect(() => {
    startSpeedLoop();
    // Potatura all'avvio: tiene il DB in salute senza intervento dell'utente.
    void pruneOldFixes(7).catch(() => {});
    return () => {
      stopSpeedLoop();
      stopGps();
      void releaseWakeLock();
    };
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

      <GpsStatusBar />

      <main class="dashboard__main">
        <Speedometer speed={smoothSpeed.value} max={MAX_SPEED} />
        {/* Slot velocità media: si attiva col motore Tutor della Fase 5. */}
        <div class="avg-slot" aria-label="Velocità media">
          <span class="avg-slot__label">MEDIA TUTOR</span>
          <span class="avg-slot__value">—</span>
        </div>
      </main>

      <footer class="dashboard__footer">
        <TrackingButton />
        <a class="nav-link" href="/varchi">
          VARCHI TUTOR
        </a>
      </footer>

      <MockControls />
    </div>
  );
}
