import { signal } from '@preact/signals';
import type { FunctionComponent } from 'preact';
import { AnalogSpeedometer } from '@/components/speedometers/AnalogSpeedometer';
import { DigitalSpeedometer } from '@/components/speedometers/DigitalSpeedometer';
import { RetroSpeedometer } from '@/components/speedometers/RetroSpeedometer';

export interface SpeedometerProps {
  /** Velocità (già smussata) in km/h. */
  speed: number;
  /** Fondo scala in km/h. */
  max: number;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  Speedometer: FunctionComponent<SpeedometerProps>;
}

export type ThemeId = 'analog' | 'digital' | 'retro';

/**
 * Registro dei temi. Per aggiungerne uno: nuova entry qui + blocco di token
 * CSS `[data-theme='...']` in `src/styles/themes.css`.
 */
export const THEMES: Record<ThemeId, ThemeDef> = {
  analog: { id: 'analog', label: 'Analogico', Speedometer: AnalogSpeedometer },
  digital: { id: 'digital', label: 'Digitale', Speedometer: DigitalSpeedometer },
  retro: { id: 'retro', label: 'Retro', Speedometer: RetroSpeedometer },
};

const STORAGE_KEY = 'navi:theme';

function loadTheme(): ThemeId {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in THEMES) return saved as ThemeId;
  }
  return 'digital';
}

export const themeId = signal<ThemeId>(loadTheme());

export function setTheme(id: ThemeId) {
  themeId.value = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage pieno o non disponibile: il tema resta solo in memoria.
  }
}

/** Propaga il tema corrente ai token CSS globali via attributo data-theme. */
export function applyThemeToDocument(id: ThemeId) {
  document.documentElement.dataset.theme = id;
}
