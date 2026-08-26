import { useEffect, useState } from 'preact/hooks';
import { THEMES, themeId, applyThemeToDocument } from '@/lib/themes';
import { MAX_SPEED, smoothSpeed, startSpeedLoop, stopSpeedLoop } from '@/lib/speed';
import { pruneOldFixes } from '@/lib/db';
import { stopGps } from '@/lib/gps';
import { releaseWakeLock } from '@/lib/wakelock';
import { startTutorEngine, loadGatesIntoEngine, resetTutorEngine } from '@/lib/tutor';
import { ThemeSwitcher } from './ThemeSwitcher';
import { MockControls } from './MockControls';
import { GpsStatusBar } from './GpsStatusBar';
import { TrackingButton } from './TrackingButton';
import { AverageSpeedPanel } from './AverageSpeedPanel';

/** Island principale: tachimetro a tema, media Tutor e controlli di tracking. */
export default function Dashboard() {
  const [gateCount, setGateCount] = useState(0);

  useEffect(() => {
    startSpeedLoop();
    const stopEngine = startTutorEngine();
    void loadGatesIntoEngine().then(setGateCount);
    // Potatura all'avvio: tiene il DB in salute senza intervento dell'utente.
    void pruneOldFixes(7).catch(() => {});

    return () => {
      stopSpeedLoop();
      stopEngine();
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
        <AverageSpeedPanel gateCount={gateCount} />
      </main>

      <footer class="dashboard__footer">
        <TrackingButton onStart={resetTutorEngine} onStop={resetTutorEngine} />
        <a class="nav-link" href="/varchi">
          VARCHI TUTOR
        </a>
      </footer>

      <MockControls />
    </div>
  );
}
